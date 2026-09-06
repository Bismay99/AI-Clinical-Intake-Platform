"""
voice_agent/tts.py

Local neural Text-to-Speech service using Piper TTS.
Runs 100% locally and offline via ONNX runtime on CPU/GPU.
Zero cloud API, zero monthly quota, calm hospital-appropriate cadence.
"""

import io
import wave
import numpy as np
from pathlib import Path
from typing import Optional, Tuple
from piper import PiperVoice
from piper.config import SynthesisConfig
from .config import config

class LocalPiperTTS:
    """Local TTS service wrapping Piper Hindi and English voice models."""

    def __init__(self):
        self._voice_hi: Optional[PiperVoice] = None
        self._voice_en: Optional[PiperVoice] = None
        # Natural conversational speed: length_scale < 1.0 slightly increases pace to sound
        # crisp and energetic rather than dragged out or overly slow.
        self._syn_config_hi = SynthesisConfig(length_scale=0.92)
        self._syn_config_en = SynthesisConfig(length_scale=0.95)

    def _ensure_loaded(self):
        if self._voice_hi is None and Path(config.tts_model_hi).exists():
            print(f"[TTS] Loading Piper Hindi voice: {config.tts_model_hi}")
            self._voice_hi = PiperVoice.load(config.tts_model_hi)

        if self._voice_en is None and Path(config.tts_model_en).exists():
            print(f"[TTS] Loading Piper English voice: {config.tts_model_en}")
            self._voice_en = PiperVoice.load(config.tts_model_en)

    def synthesize(self, text: str, language_key: str = "hi") -> Tuple[bytes, int]:
        """
        Synthesizes text into 16-bit mono PCM audio bytes and sample rate.

        Args:
            text: Text to speak.
            language_key: 'hi' for Hindi / Hinglish, 'en' for English.

        Returns:
            (raw_pcm_bytes, sample_rate)
        """
        self._ensure_loaded()
        voice = self._voice_hi if language_key == "hi" else self._voice_en
        syn_config = self._syn_config_hi if language_key == "hi" else self._syn_config_en

        if voice is None:
            raise RuntimeError(f"Piper voice for language '{language_key}' is not available.")

        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wav_file:
            voice.synthesize_wav(text, wav_file, syn_config=syn_config)

        wav_bytes = wav_buffer.getvalue()
        # Parse PCM from generated WAV header
        with wave.open(io.BytesIO(wav_bytes), "rb") as r:
            sample_rate = r.getframerate()
            pcm_bytes = r.readframes(r.getnframes())

        return pcm_bytes, sample_rate

# Singleton instance
local_tts = LocalPiperTTS()
