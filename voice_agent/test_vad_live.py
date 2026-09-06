import asyncio
import wave
import numpy as np
from livekit.plugins import silero
from livekit.agents import vad
from livekit import rtc

async def main():
    vad_model = silero.VAD.load(
        min_speech_duration=0.1,
        min_silence_duration=0.4,
    )
    vad_stream = vad_model.stream()

    events_received = []

    async def vad_consumer():
        async for event in vad_stream:
            events_received.append(event.type)
            print(f"VAD EVENT: {event.type}")

    consumer_task = asyncio.create_task(vad_consumer())

    # Read real speech WAV
    with wave.open("voice_agent/test_output/stt_test_english.wav", "rb") as wf:
        sr = wf.getframerate()
        frames = wf.readframes(wf.getnframes())

    # Feed 20ms chunks (320 samples at 16000Hz)
    chunk_bytes = int(16000 * 0.02 * 2) # 640 bytes
    
    # Send speech
    for offset in range(0, len(frames), chunk_bytes):
        chunk = frames[offset:offset + chunk_bytes]
        if len(chunk) < chunk_bytes:
            chunk = chunk.ljust(chunk_bytes, b'\x00')
        frame = rtc.AudioFrame(data=chunk, sample_rate=16000, num_channels=1, samples_per_channel=320)
        vad_stream.push_frame(frame)
        await asyncio.sleep(0.005)

    # Send 1 second of trailing silence to trigger END_OF_SPEECH
    silence = b'\x00' * 640
    for _ in range(50):
        frame = rtc.AudioFrame(data=silence, sample_rate=16000, num_channels=1, samples_per_channel=320)
        vad_stream.push_frame(frame)
        await asyncio.sleep(0.005)

    await asyncio.sleep(0.5)
    vad_stream.end_input()
    await consumer_task
    print("VAD Event count:", len(events_received))
    print("Has START:", vad.VADEventType.START_OF_SPEECH in events_received)
    print("Has END:", vad.VADEventType.END_OF_SPEECH in events_received)

asyncio.run(main())
