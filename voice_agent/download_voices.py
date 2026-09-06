import os
import httpx

models = [
    ("rohan", "https://huggingface.co/rhasspy/piper-voices/resolve/main/hi/hi_IN/rohan/medium/hi_IN-rohan-medium"),
    ("pratham", "https://huggingface.co/rhasspy/piper-voices/resolve/main/hi/hi_IN/pratham/medium/hi_IN-pratham-medium"),
]

os.makedirs("voice_agent/models/tts", exist_ok=True)

for name, base_url in models:
    for ext in [".onnx", ".onnx.json"]:
        url = f"{base_url}{ext}"
        out = f"voice_agent/models/tts/hi_IN-{name}-medium{ext}"
        if os.path.exists(out) and os.path.getsize(out) > 1000:
            print(f"Already exists: {out} ({os.path.getsize(out)} bytes)")
            continue
        print(f"Downloading {url} -> {out}...")
        with httpx.stream("GET", url, follow_redirects=True, timeout=120.0) as resp:
            resp.raise_for_status()
            with open(out, "wb") as f:
                for chunk in resp.iter_bytes(chunk_size=65536):
                    f.write(chunk)
        print(f"Downloaded {out} ({os.path.getsize(out)} bytes)")
