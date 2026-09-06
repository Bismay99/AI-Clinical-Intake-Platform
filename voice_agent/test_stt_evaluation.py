import wave
import os
import sys
import time
from faster_whisper import WhisperModel
from piper import PiperVoice

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Generate audio for the 3 test utterances
pv_hi = PiperVoice.load("voice_agent/models/tts/hi_IN-rohan-medium.onnx", config_path="voice_agent/models/tts/hi_IN-rohan-medium.onnx.json")
pv_en = PiperVoice.load("voice_agent/models/tts/en_US-lessac-medium.onnx", config_path="voice_agent/models/tts/en_US-lessac-medium.onnx.json")

os.makedirs("voice_agent/test_output", exist_ok=True)

test_cases = [
    ("hindi", "मुझे तीन दिन से सीने में दर्द हो रहा है।", pv_hi),
    ("english", "I have had chest pain for three days.", pv_en),
    ("hinglish", "मुझे 3 डेज़ से चेस्ट में पेन हो रहा है।", pv_hi),
]

for name, text, pv in test_cases:
    wav_path = f"voice_agent/test_output/stt_test_{name}.wav"
    with wave.open(wav_path, "wb") as wf:
        pv.synthesize_wav(text, wf)

models_to_test = ["base", "small"]

print("==================== STT EVALUATION ====================")
for model_name in models_to_test:
    print(f"\n--- Model: {model_name} ---")
    t_load = time.perf_counter()
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    load_dur = time.perf_counter() - t_load
    print(f"Model load time: {load_dur:.2f}s")

    for name, expected_text, _ in test_cases:
        wav_path = f"voice_agent/test_output/stt_test_{name}.wav"
        t0 = time.perf_counter()
        segments, info = model.transcribe(
            wav_path,
            beam_size=3,
            initial_prompt="यह एक क्लिनिकल वार्तालाप है। Hindi and English clinical conversation.",
        )
        transcript = " ".join(s.text for s in segments).strip()
        latency = time.perf_counter() - t0

        print(f"[{name.upper()}]")
        print(f"  Target:     {expected_text}")
        print(f"  Transcript: {transcript}")
        print(f"  Language:   {info.language} (prob: {info.language_probability:.2f})")
        print(f"  Latency:    {latency:.2f}s")
