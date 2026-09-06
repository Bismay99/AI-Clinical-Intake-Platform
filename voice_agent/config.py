"""
voice_agent/config.py

Configuration settings for the self-hosted CareVoice Realtime Voice Agent.
Keeps all secrets server-side and points to local services.
"""

import os
from pathlib import Path
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent

class VoiceAgentConfig(BaseModel):
    # LiveKit WebRTC Transport (Local self-hosted dev server)
    livekit_url: str = os.getenv("LIVEKIT_URL", "ws://127.0.0.1:7880")
    livekit_api_key: str = os.getenv("LIVEKIT_API_KEY", "devkey")
    livekit_api_secret: str = os.getenv("LIVEKIT_API_SECRET", "secret")

    # FastAPI Clinical Core Backend (Canonical Clinical Authority)
    fastapi_base_url: str = os.getenv("FASTAPI_BASE_URL", "http://127.0.0.1:8000")

    # Local STT (Faster-Whisper on CPU with INT8 quantization)
    stt_model_size: str = os.getenv("STT_MODEL_SIZE", "small")
    stt_device: str = os.getenv("STT_DEVICE", "cpu")
    stt_compute_type: str = os.getenv("STT_COMPUTE_TYPE", "int8")

    # Local TTS (Piper neural voice models)
    tts_model_hi: str = os.getenv(
        "TTS_MODEL_HI",
        str(BASE_DIR / "models" / "tts" / "hi_IN-rohan-medium.onnx")
        if (BASE_DIR / "models" / "tts" / "hi_IN-rohan-medium.onnx").exists()
        else str(BASE_DIR / "models" / "tts" / "hi_IN-priyamvada-medium.onnx")
    )
    tts_model_en: str = os.getenv(
        "TTS_MODEL_EN",
        str(BASE_DIR / "models" / "tts" / "en_US-lessac-medium.onnx")
    )

config = VoiceAgentConfig()
