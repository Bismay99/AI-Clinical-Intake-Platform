import wave
import os
import sys
import time

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from voice_agent.tts import local_tts
from faster_whisper import WhisperModel

sentences = {
    'hindi': ('समझ गई। यह दर्द लगातार रहता है या बीच-बीच में होता है?', 'hi'),
    'english': ('I understand. Is the pain continuous, or does it come and go?', 'en'),
    'hinglish_roman': ('Samajh gayi. Ye pain continuously ho raha hai ya beech-beech mein?', 'hi'),
    'hinglish_devanagari': ('समझ गई। यह pain continuously हो रहा है या बीच-बीच में?', 'hi'),
}

os.makedirs('voice_agent/test_output', exist_ok=True)

print("--- SYNTHESIS BENCHMARK ---")
for name, (text, lang) in sentences.items():
    t0 = time.perf_counter()
    pcm, sr = local_tts.synthesize(text, lang)
    dur = time.perf_counter() - t0
    out_path = f'voice_agent/test_output/{name}.wav'
    with wave.open(out_path, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm)
    audio_dur = len(pcm) / (sr * 2)
    print(f'[{name}] synth: {dur:.2f}s | audio_len: {audio_dur:.2f}s | bytes: {len(pcm)}')

print("\n--- TRANSCRIBING OUTPUT WITH WHISPER TO VERIFY PRONUNCIATION ---")
model = WhisperModel('small', device='cpu', compute_type='int8')
for name in sentences.keys():
    path = f'voice_agent/test_output/{name}.wav'
    segments, info = model.transcribe(path)
    transcription = ' '.join(s.text for s in segments).strip()
    print(f'[{name}] lang: {info.language} | recognized: "{transcription}"')
