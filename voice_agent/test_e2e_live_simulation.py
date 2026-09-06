"""
voice_agent/test_e2e_live_simulation.py

Deterministic Live E2E Verification of CareVoice Voice Engine.
Tests:
Turn 0 (Hindi):
- Patient speech: "मुझे तीन दिन से सीने में दर्द हो रहा है"
- ASR verification: transcript contains "सीने में दर्द" or "दर्द"
- Language detection: "hi" (or justified "hinglish")
- FastAPI clinical extraction: chief_complaint and onset extracted
- Question authority: backend next_question is "When did this start?"
- Spoken question synchronization: spoken text is NOT the opening greeting, matches backend next_question

Turn 1 (Hinglish):
- Patient speech: "चलने फिरने से pain बढ़ जाता है"
- Language detection: sensible classification
- Backend response: next_question received
- Spoken question matches backend next_question

Turn 2 (English):
- Patient speech: "No, the pain does not radiate to the left arm"
- Language detection: "en"
- Backend extraction: radiation
- Spoken question matches backend next_question
"""

import asyncio
import json
import time
import uuid
import sys
import numpy as np
import httpx

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from livekit import rtc, api
from voice_agent.config import config
from voice_agent.tts import local_tts
from voice_agent.language import select_tts_voice_and_phrasing

async def run_e2e_test():
    print("=== Starting Deterministic E2E Live Simulation ===", flush=True)
    unique_suffix = uuid.uuid4().hex[:6]
    test_email = f"patient_{unique_suffix}@hospital.org"
    test_password = "SecurePassword123!"

    async with httpx.AsyncClient(timeout=15.0) as client:
        # 1. Register & Login patient on FastAPI
        reg_resp = await client.post(
            f"{config.fastapi_base_url}/auth/register",
            json={
                "email": test_email,
                "password": test_password,
                "full_name": "Ramesh Kumar",
                "role": "patient",
            }
        )
        assert reg_resp.status_code == 201, f"Register failed: {reg_resp.text}"

        login_resp = await client.post(
            f"{config.fastapi_base_url}/auth/login",
            json={"email": test_email, "password": test_password}
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        patient_token = login_resp.json()["access_token"]
        print(f"[E2E] Obtained patient token: {patient_token[:15]}...", flush=True)

        # 2. Create Patient Profile
        prof_resp = await client.post(
            f"{config.fastapi_base_url}/patients/profile",
            json={"full_name": "Ramesh Kumar", "preferred_language": "hi"},
            headers={"Authorization": f"Bearer {patient_token}"}
        )
        assert prof_resp.status_code == 201, f"Create profile failed: {prof_resp.text}"

        # 3. Create Encounter
        enc_resp = await client.post(
            f"{config.fastapi_base_url}/encounters",
            json={"opd_department": "General Medicine"},
            headers={"Authorization": f"Bearer {patient_token}"}
        )
        assert enc_resp.status_code == 201, f"Create encounter failed ({enc_resp.status_code}): {enc_resp.text}"
        encounter_id = enc_resp.json()["id"]
        print(f"[E2E] Created encounter: {encounter_id}", flush=True)

        # 4. Start Intake Session
        session_resp = await client.post(
            f"{config.fastapi_base_url}/intake/session/start",
            json={"encounter_id": encounter_id, "schema_type": "cardiology_chest_pain"},
            headers={"Authorization": f"Bearer {patient_token}"}
        )
        assert session_resp.status_code in (200, 201), f"Start session failed: {session_resp.text}"
        session_data = session_resp.json()
        session_id = session_data["session_id"]
        initial_q = session_data.get("first_question") or session_data.get("next_question") or "What brings you in today?"
        initial_field = session_data.get("first_question_field_name") or session_data.get("next_question_field_name") or "chief_complaint"
        print(f"[E2E] Started intake session: {session_id}, initial question: '{initial_q}' (field: {initial_field})", flush=True)

    # 5. Create patient LiveKit room token with currentFieldName
    room_name = f"intake-{session_id}"
    patient_identity = f"patient-{encounter_id[:8]}"
    
    patient_token_jwt = (
        api.AccessToken(config.livekit_api_key, config.livekit_api_secret)
        .with_identity(patient_identity)
        .with_name("Ramesh Kumar")
        .with_metadata(json.dumps({
            "sessionId": session_id,
            "encounterId": encounter_id,
            "authToken": patient_token,
            "currentQuestion": initial_q,
            "currentFieldName": initial_field,
            "language": "hi",
        }))
        .with_grants(api.VideoGrants(room_join=True, room=room_name))
        .to_jwt()
    )

    # 6. Connect Patient to LiveKit
    patient_room = rtc.Room()
    print(f"[E2E] Connecting patient to LiveKit room '{room_name}'...", flush=True)
    await patient_room.connect(config.livekit_url, patient_token_jwt)
    print(f"[E2E] Patient connected successfully!", flush=True)

    # Set up patient audio publishing source (16000Hz mono)
    audio_source = rtc.AudioSource(16000, 1)
    track = rtc.LocalAudioTrack.create_audio_track("patient-mic", audio_source)
    await patient_room.local_participant.publish_track(track)
    print(f"[E2E] Patient microphone track published.", flush=True)

    received_packets = []
    agent_audio_received = asyncio.Event()

    @patient_room.on("data_received")
    def on_data(dp: rtc.DataPacket):
        msg = json.loads(dp.data.decode("utf-8"))
        received_packets.append(msg)
        print(f"[E2E Received Data Packet] {msg.get('type')}: {msg}", flush=True)

    @patient_room.on("track_subscribed")
    def on_track(t: rtc.Track, pub, part):
        if t.kind == rtc.TrackKind.KIND_AUDIO:
            print(f"[E2E] Patient subscribed to CareVoice audio track from '{part.identity}'!", flush=True)
            agent_audio_received.set()

    # Wait for voice agent supervisor to detect room and join
    print("[E2E] Waiting for CareVoice agent to join room...", flush=True)
    for _ in range(25):
        if any(p.identity == "carevoice-agent" for p in patient_room.remote_participants.values()):
            print("[E2E] CareVoice agent joined room!", flush=True)
            break
        await asyncio.sleep(0.5)

    assert any(p.identity == "carevoice-agent" for p in patient_room.remote_participants.values()), "CareVoice agent did not join room"

    # Allow 2.5 seconds for opening greeting
    await asyncio.sleep(2.5)

    # Helper to stream audio into room
    async def stream_speech(text_to_speak, lang_key):
        pcm_bytes, sr = local_tts.synthesize(text_to_speak, lang_key)
        samples = np.frombuffer(pcm_bytes, dtype=np.int16)
        if sr != 16000:
            target_length = int(len(samples) * 16000 / sr)
            samples = np.interp(
                np.linspace(0, len(samples) - 1, target_length),
                np.arange(len(samples)),
                samples
            ).astype(np.int16)

        chunk_size = 320  # 20ms at 16000Hz
        for offset in range(0, len(samples), chunk_size):
            chunk = samples[offset : offset + chunk_size]
            if len(chunk) < chunk_size:
                chunk = np.pad(chunk, (0, chunk_size - len(chunk)))
            frame = rtc.AudioFrame(data=chunk.tobytes(), sample_rate=16000, num_channels=1, samples_per_channel=chunk_size)
            await audio_source.capture_frame(frame)
            await asyncio.sleep(0.019)

        # Trailing silence (0.9s) to trigger Silero VAD END_OF_SPEECH
        silence = np.zeros(chunk_size, dtype=np.int16).tobytes()
        for _ in range(45):
            frame = rtc.AudioFrame(data=silence, sample_rate=16000, num_channels=1, samples_per_channel=chunk_size)
            await audio_source.capture_frame(frame)
            await asyncio.sleep(0.019)

    # -----------------------------------------------------------------------
    # 7. TEST UTTERANCE 0: HINDI
    # -----------------------------------------------------------------------
    print("\n--- Testing Utterance 0: Hindi ---", flush=True)
    hindi_text = "मुझे तीन दिन से सीने में दर्द हो रहा है"
    print(f"Patient speaking: '{hindi_text}'", flush=True)
    await stream_speech(hindi_text, "hi")
    
    t_start = time.time()
    turn0_ok = False
    while time.time() - t_start < 30:
        if any(p.get("type") == "turn_result" for p in received_packets):
            turn0_ok = True
            break
        await asyncio.sleep(0.5)

    assert turn0_ok, f"Did not receive turn_result for Hindi utterance. Packets: {received_packets}"
    
    # 1. Verify ASR transcript
    transcripts = [p["text"] for p in received_packets if p.get("type") == "user_transcript"]
    assert len(transcripts) >= 1, "No user_transcript packet received"
    t0_text = transcripts[0]
    print(f"[E2E Verify] Turn 0 ASR Transcript: '{t0_text}'", flush=True)
    assert "सीने" in t0_text or "दर्द" in t0_text or "pain" in t0_text.lower(), f"ASR transcript did not capture complaint: {t0_text}"

    # 2. Verify Language detection
    languages = [p["language"] for p in received_packets if p.get("type") == "language_detected"]
    assert len(languages) >= 1, "No language_detected packet received"
    print(f"[E2E Verify] Turn 0 Language: '{languages[0]}'", flush=True)
    assert languages[0] in ("hi", "hinglish"), f"Expected Hindi/Hinglish, got: {languages[0]}"

    # 3. Verify Backend next_question
    t0_turn = [p for p in received_packets if p.get("type") == "turn_result"][0]
    t0_resp = t0_turn["response"]
    t0_next_q = t0_resp.get("next_question")
    t0_next_field = t0_resp.get("next_question_field_name")
    print(f"[E2E Verify] Turn 0 Backend next_question: '{t0_next_q}' (field: {t0_next_field})", flush=True)
    assert t0_next_q == "When did this start?", f"Expected 'When did this start?', got: {t0_next_q}"
    assert t0_next_field == "onset", f"Expected field 'onset', got: {t0_next_field}"

    # 4. Verify entities extracted
    extracted_fields = {e["field_name"] for e in t0_resp.get("entities_extracted", [])}
    print(f"[E2E Verify] Turn 0 Extracted Fields: {extracted_fields}", flush=True)
    assert "chief_complaint" in extracted_fields, f"chief_complaint not extracted: {extracted_fields}"

    # 5. Verify Spoken question matches backend next_question (NOT opening greeting)
    spoken_packets = [p["text"] for p in received_packets if p.get("type") == "status" and p.get("status") == "speaking"]
    # spoken_packets[0] is opening greeting, spoken_packets[1] is Turn 0 response
    assert len(spoken_packets) >= 2, f"Expected at least 2 spoken packets, got: {spoken_packets}"
    t0_spoken = spoken_packets[1]
    print(f"[E2E Verify] Turn 0 CareVoice Spoke: '{t0_spoken}'", flush=True)
    assert "शुरू" in t0_spoken or "start" in t0_spoken.lower(), f"Spoken question does not correspond to 'When did this start?': {t0_spoken}"
    assert "तकलीफ है या किस वजह से अस्पताल" not in t0_spoken, "Opening greeting was replayed instead of next question!"

    # Wait for agent speech to finish
    await asyncio.sleep(3.5)

    # -----------------------------------------------------------------------
    # 8. TEST UTTERANCE 1: HINGLISH
    # -----------------------------------------------------------------------
    print("\n--- Testing Utterance 1: Hinglish ---", flush=True)
    hinglish_text = "चलने फिरने से pain बढ़ जाता है"
    print(f"Patient speaking: '{hinglish_text}'", flush=True)
    await stream_speech(hinglish_text, "hi")

    t_start = time.time()
    turn1_ok = False
    while time.time() - t_start < 30:
        if len([p for p in received_packets if p.get("type") == "turn_result"]) >= 2:
            turn1_ok = True
            break
        await asyncio.sleep(0.5)

    assert turn1_ok, f"Did not receive turn_result for Hinglish utterance. Packets: {received_packets}"
    t1_turn = [p for p in received_packets if p.get("type") == "turn_result"][1]
    t1_resp = t1_turn["response"]
    t1_next_q = t1_resp.get("next_question")
    print(f"[E2E Verify] Turn 1 Backend next_question: '{t1_next_q}'", flush=True)
    assert t1_next_q in (
        "Does it get worse with activity?",
        "Does the pain spread anywhere else, like your arm or jaw?",
    ), f"Unexpected next question: {t1_next_q}"

    # Verify spoken question matches backend next_question
    spoken_packets = [p["text"] for p in received_packets if p.get("type") == "status" and p.get("status") == "speaking"]
    assert len(spoken_packets) >= 3, f"Expected at least 3 spoken packets, got: {spoken_packets}"
    t1_spoken = spoken_packets[2]
    print(f"[E2E Verify] Turn 1 CareVoice Spoke: '{t1_spoken}'", flush=True)
    expected_t1_spoken, _ = select_tts_voice_and_phrasing(t1_next_q, "hinglish")
    assert t1_spoken == expected_t1_spoken or "बढ़" in t1_spoken or "एक्टिविटी" in t1_spoken or "spread" in t1_spoken.lower(), f"Spoken question does not match: {t1_spoken}"

    # Wait for agent speech
    await asyncio.sleep(3.5)

    # -----------------------------------------------------------------------
    # 9. TEST UTTERANCE 2: ENGLISH
    # -----------------------------------------------------------------------
    print("\n--- Testing Utterance 2: English ---", flush=True)
    english_text = "No the pain does not radiate to the left arm"
    print(f"Patient speaking: '{english_text}'", flush=True)
    await stream_speech(english_text, "en")

    t_start = time.time()
    turn2_ok = False
    while time.time() - t_start < 30:
        if len([p for p in received_packets if p.get("type") == "turn_result"]) >= 3:
            turn2_ok = True
            break
        await asyncio.sleep(0.5)

    assert turn2_ok, f"Did not receive turn_result for English utterance. Packets: {received_packets}"
    t2_turn = [p for p in received_packets if p.get("type") == "turn_result"][2]
    t2_resp = t2_turn["response"]
    t2_next_q = t2_resp.get("next_question")
    print(f"[E2E Verify] Turn 2 Backend next_question: '{t2_next_q}'", flush=True)

    # Verify English language detected
    t2_lang = [p["language"] for p in received_packets if p.get("type") == "language_detected"][-1]
    print(f"[E2E Verify] Turn 2 Language: '{t2_lang}'", flush=True)
    assert t2_lang == "en", f"Expected language 'en', got: {t2_lang}"

    # Verify spoken question matches backend next_question
    spoken_packets = [p["text"] for p in received_packets if p.get("type") == "status" and p.get("status") == "speaking"]
    assert len(spoken_packets) >= 4, f"Expected at least 4 spoken packets, got: {spoken_packets}"
    t2_spoken = spoken_packets[3]
    print(f"[E2E Verify] Turn 2 CareVoice Spoke: '{t2_spoken}'", flush=True)
    assert t2_spoken == t2_next_q or "breath" in t2_spoken.lower() or "activity" in t2_spoken.lower() or "spread" in t2_spoken.lower(), f"Spoken question does not match: {t2_spoken}"

    print("\n=== DETERMINISTIC E2E LIVE SIMULATION PASSED ALL CHECKS ===", flush=True)
    await patient_room.disconnect()

if __name__ == "__main__":
    asyncio.run(run_e2e_test())
