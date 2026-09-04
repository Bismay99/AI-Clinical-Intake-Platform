"""
services/asr.py

Thin adapter around a speech-to-text provider (PRD Section 6).
MVP target: English + Hindi/Hinglish. Swap the provider call inside
`transcribe()` without touching anything upstream in brain.py.

Kept provider-agnostic on purpose (Architecture Section 3.6): plug in
AI4Bharat's ASR models, a cloud STT API, or a mock for local dev/demo.
"""

from dataclasses import dataclass


@dataclass
class TranscriptionResult:
    text: str
    language: str
    raw_confidence: float  # provider-reported confidence, if available


def transcribe(audio_bytes: bytes, language_hint: str) -> TranscriptionResult:
    """
    Replace this body with a real provider call, e.g.:
        result = ai4bharat_client.transcribe(audio_bytes, lang=language_hint)
        return TranscriptionResult(text=result.text, language=result.lang,
                                    raw_confidence=result.confidence)

    MVP placeholder returns a stub so the rest of the pipeline is runnable
    and testable before a real ASR provider is wired in.
    """
    if not audio_bytes:
        return TranscriptionResult(text="", language=language_hint, raw_confidence=0.0)

    # --- placeholder: real integration goes here ---
    return TranscriptionResult(
        text="[transcribed speech placeholder]",
        language=language_hint,
        raw_confidence=0.85,
    )
