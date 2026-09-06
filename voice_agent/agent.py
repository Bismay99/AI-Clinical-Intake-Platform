"""
voice_agent/agent.py

Self-Hosted CareVoice Realtime Voice Agent.
Combines:
- LiveKit WebRTC Transport
- Silero VAD (real-time voice activity detection & natural interruption handling)
- Faster-Whisper Multilingual STT (Hindi, Hinglish, English)
- Conversational Language Detection & Selection
- Canonical FastAPI Backend Clinical Authority (POST /intake/turn & POST /intake/submit)
- Local Piper Neural TTS (hospital-appropriate calm Hindi & English voices)
"""

import os
import sys
import json
import time
import asyncio
import argparse
from typing import Optional, List
import numpy as np

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from livekit import rtc, api
from livekit.plugins import silero
from livekit.agents import vad

from .config import config
from .language import (
    detect_conversational_language,
    select_tts_voice_and_phrasing,
    format_closing_statement,
)
from .stt import local_stt
from .tts import local_tts
from .fastapi_client import fastapi_client


class CareVoiceRoomSession:
    """Manages a single CareVoice voice session inside a LiveKit room."""

    def __init__(
        self,
        room_name: str,
        session_id: Optional[str] = None,
        encounter_id: Optional[str] = None,
        auth_token: Optional[str] = None,
        initial_field_name: str = "chief_complaint",
    ):
        self.room_name = room_name
        self.session_id = session_id or room_name.replace("intake-", "")
        self.encounter_id = encounter_id or self.session_id
        self.auth_token = auth_token

        self.room: Optional[rtc.Room] = None
        self.audio_source: Optional[rtc.AudioSource] = None
        self.audio_track: Optional[rtc.LocalAudioTrack] = None

        # Clinical conversation state synchronized with FastAPI backend
        self.current_field_name: str = initial_field_name
        self.active_language: str = "hi"
        self.turn_generation: int = 0
        self.current_turn_number: int = 0
        self.initial_greeting_done: bool = False

        self.is_speaking_tts: bool = False
        self.stop_playback_flag: bool = False
        self.current_playback_task: Optional[asyncio.Task] = None
        self._running = True

    async def broadcast_event(self, event_type: str, data: dict):
        """Sends a real-time event packet over LiveKit data channel to the patient UI."""
        if not self.room or not self.room.local_participant:
            return
        payload = json.dumps({"type": event_type, **data}).encode("utf-8")
        try:
            await self.room.local_participant.publish_data(payload, reliable=True)
        except Exception as e:
            print(f"[CAREVOICE] Failed to publish data packet: {e}", flush=True)

    async def speak_text(self, text: str, language_key: str, generation: int, turn_num: int):
        """Synthesizes text using local Piper TTS and streams audio frames into WebRTC track."""
        if not self.audio_source or not self._running:
            return
        if generation != self.turn_generation:
            return

        self.stop_playback_flag = False
        self.is_speaking_tts = True
        await self.broadcast_event("status", {"status": "speaking", "text": text})

        model_path = config.tts_model_hi if language_key in ("hi", "hinglish") else config.tts_model_en
        model_name = os.path.basename(model_path)

        print(
            f'[CAREVOICE] TTS_INPUT session={self.session_id} turn={turn_num} generation={generation} '
            f'text="{text}" language={language_key} model={model_name}',
            flush=True,
        )

        try:
            t0 = time.perf_counter()
            pcm_bytes, sample_rate = local_tts.synthesize(text, language_key)
            tts_latency = time.perf_counter() - t0

            if generation != self.turn_generation or self.stop_playback_flag or not self._running:
                print(
                    f"[CAREVOICE] Stale TTS generation {generation} discarded before publish (current: {self.turn_generation})",
                    flush=True,
                )
                return

            print(
                f"[CAREVOICE] TTS_COMPLETE session={self.session_id} turn={turn_num} generation={generation} "
                f"bytes={len(pcm_bytes)} latency={tts_latency:.2f}s",
                flush=True,
            )

            print(f"[CAREVOICE] AUDIO_PUBLISHED session={self.session_id} turn={turn_num} generation={generation}", flush=True)

            audio_samples = np.frombuffer(pcm_bytes, dtype=np.int16)
            samples_per_frame = int(sample_rate * 0.02)
            total_samples = len(audio_samples)

            for offset in range(0, total_samples, samples_per_frame):
                if self.stop_playback_flag or generation != self.turn_generation or not self._running:
                    print(
                        f"[CAREVOICE] Playback interrupted/cancelled at offset {offset}/{total_samples}",
                        flush=True,
                    )
                    break

                chunk = audio_samples[offset : offset + samples_per_frame]
                if len(chunk) < samples_per_frame:
                    chunk = np.pad(chunk, (0, samples_per_frame - len(chunk)))

                frame = rtc.AudioFrame(
                    data=chunk.tobytes(),
                    sample_rate=sample_rate,
                    num_channels=1,
                    samples_per_channel=samples_per_frame,
                )
                await self.audio_source.capture_frame(frame)
                await asyncio.sleep(0.018)

        except Exception as e:
            print(f"[CAREVOICE] Error during TTS playback: {e}", flush=True)
        finally:
            self.is_speaking_tts = False
            if not self.stop_playback_flag and generation == self.turn_generation:
                await self.broadcast_event("status", {"status": "listening"})

    async def handle_patient_utterance(self, audio_data: np.ndarray, generation: int, turn_num: int):
        """Processes finalized patient speech: STT -> LangDetect -> FastAPI -> TTS."""
        if len(audio_data) < 16000 * 0.35:  # ignore clicks or breaths under 350ms
            return

        if generation != self.turn_generation or not self._running:
            print(f"[CAREVOICE] Discarding stale utterance generation {generation}", flush=True)
            return

        await self.broadcast_event("status", {"status": "thinking"})
        t0 = time.perf_counter()

        # 1. Faster-Whisper STT
        transcript, detected_stt_lang = local_stt.transcribe(audio_data)
        stt_latency = time.perf_counter() - t0

        if generation != self.turn_generation or not self._running:
            return

        if not transcript or len(transcript.strip()) < 2:
            await self.broadcast_event("status", {"status": "listening"})
            return

        print(
            f'[CAREVOICE] ASR_FINAL session={self.session_id} turn={turn_num} generation={generation} '
            f'transcript="{transcript}" latency={stt_latency:.2f}s',
            flush=True,
        )
        await self.broadcast_event("user_transcript", {"text": transcript})

        # 2. Conversational Language Detection
        detected_lang = detect_conversational_language(transcript, self.active_language)
        self.active_language = detected_lang
        print(
            f"[CAREVOICE] LANGUAGE_DETECTED session={self.session_id} turn={turn_num} generation={generation} "
            f"language={detected_lang}",
            flush=True,
        )
        await self.broadcast_event("language_detected", {"language": detected_lang})

        # 3. Canonical FastAPI Backend Dispatch (POST /intake/turn)
        answering_field = self.current_field_name or "chief_complaint"
        print(
            f'[CAREVOICE] BACKEND_REQUEST session={self.session_id} turn={turn_num} generation={generation} '
            f'endpoint="/intake/turn" field="{answering_field}"',
            flush=True,
        )
        try:
            turn_resp = await fastapi_client.submit_turn(
                session_id=self.session_id,
                encounter_id=self.encounter_id,
                transcript=transcript,
                answering_field_name=answering_field,
                auth_token=self.auth_token,
            )
            print(
                f"[CAREVOICE] BACKEND_RESPONSE session={self.session_id} turn={turn_num} generation={generation} status=200",
                flush=True,
            )
        except Exception as e:
            print(f"[CAREVOICE] Error dispatching turn to FastAPI: {e}", flush=True)
            await self.broadcast_event("error", {"detail": "Failed to record answer with clinical backend."})
            await self.broadcast_event("status", {"status": "listening"})
            return

        if generation != self.turn_generation or not self._running:
            print(f"[CAREVOICE] Discarding response for stale generation {generation}", flush=True)
            return

        # 4. Handle Canonical Response — FastAPI is the SOLE clinical question authority
        next_q = turn_resp.get("next_question")
        next_field = turn_resp.get("next_question_field_name")
        self.current_field_name = next_field

        print(
            f'[CAREVOICE] NEXT_QUESTION session={self.session_id} turn={turn_num} generation={generation} '
            f'next_question="{next_q}" next_field="{next_field}"',
            flush=True,
        )
        await self.broadcast_event("turn_result", {"response": turn_resp})

        if turn_resp.get("pathway_complete") or not next_q:
            print(
                f"[CAREVOICE] Clinical pathway complete session={self.session_id}. Finalizing encounter.",
                flush=True,
            )
            closing_text, tts_lang = format_closing_statement(detected_lang)
            await self.speak_text(closing_text, tts_lang, generation, turn_num)

            try:
                sub_resp = await fastapi_client.submit_intake(
                    session_id=self.session_id,
                    encounter_id=self.encounter_id,
                    auth_token=self.auth_token,
                )
                print(f"[CAREVOICE] Encounter successfully finalized: {sub_resp.get('status')}", flush=True)
                await self.broadcast_event("intake_completed", {"result": sub_resp})
            except Exception as e:
                print(f"[CAREVOICE] Error submitting intake: {e}", flush=True)
        else:
            # Render the EXACT canonical question in the patient's conversational language
            spoken_text, tts_lang = select_tts_voice_and_phrasing(next_q, detected_lang)
            await self.speak_text(spoken_text, tts_lang, generation, turn_num)

    async def run(self):
        """Connects to LiveKit room and executes the realtime voice loop."""
        token = (
            api.AccessToken(config.livekit_api_key, config.livekit_api_secret)
            .with_identity("carevoice-agent")
            .with_grants(api.VideoGrants(room_join=True, room=self.room_name))
            .to_jwt()
        )

        self.room = rtc.Room()
        print(f"[CAREVOICE] Connecting to LiveKit room '{self.room_name}' at {config.livekit_url}...", flush=True)
        await self.room.connect(config.livekit_url, token)
        print(f"[CAREVOICE] Connected to room '{self.room_name}'.", flush=True)

        # Create & publish local audio track for TTS output
        self.audio_source = rtc.AudioSource(22050, 1)
        self.audio_track = rtc.LocalAudioTrack.create_audio_track("carevoice-audio", self.audio_source)
        await self.room.local_participant.publish_track(self.audio_track)
        print("[CAREVOICE] CareVoice audio track published to room.", flush=True)

        vad_model = silero.VAD.load(
            min_speech_duration=0.1,
            min_silence_duration=0.45,
        )

        def apply_metadata(participant: rtc.RemoteParticipant):
            if not participant.metadata:
                return None
            try:
                m = json.loads(participant.metadata)
                if m.get("sessionId"):
                    self.session_id = m["sessionId"]
                if m.get("encounterId"):
                    self.encounter_id = m["encounterId"]
                if m.get("language"):
                    self.active_language = m["language"]
                if m.get("authToken"):
                    self.auth_token = m["authToken"]
                if m.get("currentFieldName"):
                    self.current_field_name = m["currentFieldName"]
                return m.get("currentQuestion")
            except Exception as e:
                print(f"[CAREVOICE] Error parsing participant metadata: {e}", flush=True)
                return None

        # Check existing remote participants
        initial_q_from_meta = None
        for p in self.room.remote_participants.values():
            q = apply_metadata(p)
            if q:
                initial_q_from_meta = q
            for pub in p.track_publications.values():
                if pub.track and pub.track.kind == rtc.TrackKind.KIND_AUDIO:
                    print(f"[CAREVOICE] Subscribed to existing patient audio track from '{p.identity}'.", flush=True)
                    asyncio.create_task(self._process_patient_audio(pub.track, vad_model))

        @self.room.on("participant_connected")
        def on_participant_connected(participant: rtc.RemoteParticipant):
            print(f"[CAREVOICE] patient connected: '{participant.identity}' (room: {self.room_name})", flush=True)
            apply_metadata(participant)

        @self.room.on("participant_disconnected")
        def on_participant_disconnected(participant: rtc.RemoteParticipant):
            print(f"[CAREVOICE] Participant disconnected: '{participant.identity}'", flush=True)
            if len(self.room.remote_participants) == 0:
                print(f"[CAREVOICE] Room '{self.room_name}' empty. Closing session.", flush=True)
                self._running = False

        @self.room.on("data_received")
        def on_data_received(data_packet: rtc.DataPacket):
            try:
                msg = json.loads(data_packet.data.decode("utf-8"))
                if msg.get("type") == "init":
                    if msg.get("sessionId"):
                        self.session_id = msg["sessionId"]
                    if msg.get("encounterId"):
                        self.encounter_id = msg["encounterId"]
                    if msg.get("language"):
                        self.active_language = msg["language"]
                    if msg.get("authToken"):
                        self.auth_token = msg["authToken"]
                    if msg.get("currentFieldName"):
                        self.current_field_name = msg["currentFieldName"]
                    q = msg.get("currentQuestion")
                    if q and not self.initial_greeting_done and self.current_turn_number == 0:
                        self.initial_greeting_done = True
                        spoken_text, tts_lang = select_tts_voice_and_phrasing(q, self.active_language)
                        self.turn_generation += 1
                        gen = self.turn_generation
                        asyncio.create_task(self.speak_text(spoken_text, tts_lang, gen, 0))
            except Exception as e:
                print(f"[CAREVOICE] Error processing data packet: {e}", flush=True)

        @self.room.on("track_subscribed")
        def on_track_subscribed(track: rtc.Track, publication, participant: rtc.RemoteParticipant):
            if track.kind == rtc.TrackKind.KIND_AUDIO:
                print(f"[CAREVOICE] Subscribed to patient audio track from participant '{participant.identity}'.", flush=True)
                asyncio.create_task(self._process_patient_audio(track, vad_model))

        # Initial opening question: spoken ONLY ONCE if no speech has occurred after 1.5s
        await asyncio.sleep(1.5)
        if not self.initial_greeting_done and self.current_turn_number == 0 and self._running:
            self.initial_greeting_done = True
            question_to_speak = initial_q_from_meta or "What brings you in today?"
            spoken_text, tts_lang = select_tts_voice_and_phrasing(question_to_speak, self.active_language)
            self.turn_generation += 1
            gen = self.turn_generation
            await self.speak_text(spoken_text, tts_lang, gen, 0)

        # Keep session alive
        while self._running:
            await asyncio.sleep(1.0)

    async def _process_patient_audio(self, track: rtc.RemoteAudioTrack, vad_model: silero.VAD):
        """Reads audio frames from patient track, performs VAD via producer-consumer, and drives turns."""
        audio_stream = rtc.AudioStream(track, sample_rate=16000, num_channels=1)
        vad_stream = vad_model.stream()

        audio_received_logged = False
        speech_buffer: List[np.ndarray] = []
        is_speech_active = False
        ring_buffer: List[np.ndarray] = []  # rolling pre-speech buffer (~300ms)
        MAX_RING_CHUNKS = 15

        async def vad_consumer():
            nonlocal is_speech_active, speech_buffer
            try:
                async for event in vad_stream:
                    if not self._running:
                        break

                    if event.type == vad.VADEventType.START_OF_SPEECH:
                        # Prevent any initial greeting from firing once patient starts speaking
                        self.initial_greeting_done = True

                        # Increment generation ID and turn number
                        self.turn_generation += 1
                        self.current_turn_number += 1
                        gen = self.turn_generation
                        turn_num = self.current_turn_number

                        print(
                            f"[CAREVOICE] TURN_START session={self.session_id} turn={turn_num} generation={gen}",
                            flush=True,
                        )

                        # Interrupt active agent speech immediately
                        if self.is_speaking_tts:
                            print(f"[CAREVOICE] Patient speech interrupted agent playback generation={gen}", flush=True)
                            self.stop_playback_flag = True

                        is_speech_active = True
                        speech_buffer = list(ring_buffer)

                    elif event.type == vad.VADEventType.END_OF_SPEECH:
                        gen = self.turn_generation
                        turn_num = self.current_turn_number
                        print(
                            f"[CAREVOICE] TURN_END session={self.session_id} turn={turn_num} generation={gen}",
                            flush=True,
                        )
                        is_speech_active = False
                        if speech_buffer:
                            full_audio = np.concatenate(speech_buffer)
                            speech_buffer = []
                            asyncio.create_task(self.handle_patient_utterance(full_audio, gen, turn_num))

            except Exception as ce:
                print(f"[CAREVOICE] VAD consumer exception: {ce}", flush=True)

        consumer_task = asyncio.create_task(vad_consumer())

        try:
            async for frame_event in audio_stream:
                if not self._running:
                    break
                if not audio_received_logged:
                    print(f"[CAREVOICE] Audio received from patient session={self.session_id}", flush=True)
                    audio_received_logged = True

                frame = frame_event.frame
                vad_stream.push_frame(frame)
                pcm_data = np.frombuffer(frame.data, dtype=np.int16).astype(np.float32) / 32768.0

                if is_speech_active:
                    speech_buffer.append(pcm_data)
                else:
                    ring_buffer.append(pcm_data)
                    if len(ring_buffer) > MAX_RING_CHUNKS:
                        ring_buffer.pop(0)
        except Exception as e:
            print(f"[CAREVOICE] Audio stream exception: {e}", flush=True)
        finally:
            try:
                vad_stream.end_input()
            except Exception:
                pass
            await consumer_task

    async def close(self):
        self._running = False
        if self.room:
            await self.room.disconnect()


async def monitor_and_join_rooms():
    """Supervisor daemon: monitors LiveKit for active intake rooms and launches agent sessions."""
    print("[CAREVOICE Supervisor] Starting room monitor on LiveKit...", flush=True)
    lk_api = api.LiveKitAPI(config.livekit_url, config.livekit_api_key, config.livekit_api_secret)
    active_sessions = {}

    try:
        while True:
            try:
                res = await lk_api.room.list_rooms(api.ListRoomsRequest())
                for room in res.rooms:
                    if room.name.startswith("intake-") and room.name not in active_sessions:
                        if room.num_participants > 0:
                            print(f"[CAREVOICE] Found patient waiting in room '{room.name}'. Launching session.", flush=True)
                            session = CareVoiceRoomSession(room.name)
                            task = asyncio.create_task(session.run())
                            active_sessions[room.name] = (session, task)

                # Clean up finished rooms
                finished_rooms = []
                for room_name, (session, task) in active_sessions.items():
                    if task.done() or not session._running:
                        finished_rooms.append(room_name)

                for r in finished_rooms:
                    del active_sessions[r]

            except Exception as e:
                print(f"[CAREVOICE Supervisor] Error checking rooms: {e}", flush=True)

            await asyncio.sleep(1.0)
    finally:
        await lk_api.aclose()


def main():
    parser = argparse.ArgumentParser(description="CareVoice Self-Hosted Realtime Voice Agent")
    parser.add_argument("--room", type=str, help="Directly join a specific LiveKit room name")
    parser.add_argument("--session_id", type=str, help="Intake session ID")
    parser.add_argument("--encounter_id", type=str, help="Encounter ID")
    parser.add_argument("--token", type=str, help="Patient auth token")
    args = parser.parse_args()

    if args.room:
        session = CareVoiceRoomSession(
            room_name=args.room,
            session_id=args.session_id,
            encounter_id=args.encounter_id,
            auth_token=args.token,
        )
        try:
            asyncio.run(session.run())
        except KeyboardInterrupt:
            print("\n[CAREVOICE] Shutting down.", flush=True)
            asyncio.run(session.close())
    else:
        # Default: Supervisor daemon mode
        try:
            asyncio.run(monitor_and_join_rooms())
        except KeyboardInterrupt:
            print("\n[CAREVOICE Supervisor] Exiting.", flush=True)

if __name__ == "__main__":
    main()
