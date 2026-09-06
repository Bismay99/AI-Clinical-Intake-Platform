"""
voice_agent/stt.py

Local Speech-to-Text service using Faster-Whisper.
Supports Hindi (Devanagari), Indian Hinglish, and English with low latency.
"""

import numpy as np
from typing import Optional, Tuple, Union
from faster_whisper import WhisperModel
from .config import config

class LocalWhisperSTT:
    """Local STT service wrapping Faster-Whisper."""

    def __init__(self):
        self._model: Optional[WhisperModel] = None

    def _ensure_loaded(self):
        if self._model is None:
            print(f"[STT] Loading Faster-Whisper model: {config.stt_model_size} ({config.stt_device}, {config.stt_compute_type})...")
            self._model = WhisperModel(
                config.stt_model_size,
                device=config.stt_device,
                compute_type=config.stt_compute_type,
            )
            print("[STT] Faster-Whisper model loaded successfully.")

    def transcribe(
        self,
        audio: Union[np.ndarray, str],
        language_hint: Optional[str] = None
    ) -> Tuple[str, str]:
        """
        Transcribes 16kHz mono audio into text.

        Args:
            audio: 16kHz float32 mono numpy array, or path to audio file.
            language_hint: Optional BCP-47 language code hint.

        Returns:
            (transcript, detected_language)
        """
        self._ensure_loaded()
        assert self._model is not None

        segments, info = self._model.transcribe(
            audio,
            beam_size=1,
            language=language_hint,
            initial_prompt="नमस्ते, मुझे सीने में दर्द है। I have chest pain.",
        )

        transcript = " ".join(s.text.strip() for s in segments).strip()
        detected_language = info.language or "en"

        return transcript, detected_language

# Singleton instance
local_stt = LocalWhisperSTT()
