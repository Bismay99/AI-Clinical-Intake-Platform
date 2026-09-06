import wave
import os
import sys
import time
from piper import PiperVoice
from faster_whisper import WhisperModel

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

test_sentences = [
    ("hi_sentence", "समझ गई। यह दर्द लगातार रहता है या बीच-बीच में होता है?"),
    ("hi_exertion", "क्या चलने-फिरने या मेहनत का काम करने से यह दर्द और बढ़ जाता है?"),
    ("hi_closing", "आपकी सभी जानकारियां दर्ज कर ली गई हैं और डॉक्टर के रिव्यू के लिए तैयार हैं।"),
]

voices = [
    ("priyamvada", "voice_agent/models/tts/hi_IN-priyamvada-medium.onnx"),
    ("rohan", "voice_agent/models/tts/hi_IN-rohan-medium.onnx"),
]

os.makedirs("voice_agent/test_output", exist_ok=True)
whisper = WhisperModel("small", device="cpu", compute_type="int8")

for voice_name, model_path in voices:
    print(f"\n==================== VOICE: {voice_name} ====================")
    pv = PiperVoice.load(model_path, config_path=f"{model_path}.json")
    for s_name, text in test_sentences:
        t0 = time.perf_counter()
        out_wav = f"voice_agent/test_output/{voice_name}_{s_name}.wav"
        with wave.open(out_wav, "wb") as wf:
            pv.synthesize_wav(text, wf)
        synth_time = time.perf_counter() - t0

        # Transcribe back to check intelligibility
        segments, info = whisper.transcribe(out_wav)
        transcribed = " ".join(s.text for s in segments).strip()

        print(f"[{s_name}]")
        print(f"  Input:       {text}")
        print(f"  Transcribed: {transcribed}")
        print(f"  Synth Time:  {synth_time:.2f}s | Language: {info.language}")
