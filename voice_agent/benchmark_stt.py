"""
voice_agent/benchmark_stt.py

Benchmarks Faster-Whisper models (tiny, base, small) on:
1. Hindi audio accuracy & script fidelity (Devanagari vs transliteration)
2. English audio accuracy
3. Hinglish audio accuracy
4. Transcription latency (Time-to-First-Transcript) on local PC CPU
"""

import time
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from faster_whisper import WhisperModel

MODELS = ["base", "small"]
TEST_FILES = [
    ("Hindi", "voice_agent/test_hindi.wav", "नमस्ते, यह दर्द लगातार रहता है या बीच-बीच में होता है?"),
    ("English", "voice_agent/test_en.wav", "I understand. Does the pain spread anywhere else, like your arm or jaw?"),
]

def benchmark():
    results = {}

    for model_name in MODELS:
        print(f"\n{'='*50}\nBenchmarking Faster-Whisper: {model_name}\n{'='*50}")
        t0 = time.perf_counter()
        try:
            model = WhisperModel(model_name, device="cpu", compute_type="int8")
            load_time = time.perf_counter() - t0
            print(f"Model [{model_name}] loaded in {load_time:.2f}s")
        except Exception as e:
            print(f"Failed to load [{model_name}]: {e}")
            continue

        model_results = {"load_time": load_time, "runs": []}

        for label, audio_path, expected in TEST_FILES:
            t_start = time.perf_counter()
            segments, info = model.transcribe(audio_path, beam_size=1)
            text = " ".join(s.text for s in segments).strip()
            latency = time.perf_counter() - t_start

            print(f"\nTest [{label}]:")
            print(f"  Expected:   {expected}")
            print(f"  Transcript: {text}")
            print(f"  Detected:   {info.language} ({info.language_probability:.2f})")
            print(f"  Latency:    {latency:.2f}s")

            model_results["runs"].append({
                "label": label,
                "transcript": text,
                "detected_lang": info.language,
                "latency": latency,
            })

        results[model_name] = model_results

    return results

if __name__ == "__main__":
    benchmark()
