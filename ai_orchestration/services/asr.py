"""
services/asr.py

Canonical speech-to-text (ASR) adapter for PS47 AI Clinical Intake Platform.
Supports English, Hindi (hi-IN), and Hinglish / code-switched speech.

Responsibilities:
  1. Validates and inspects audio bytes (WAV, MP3, WebM, OGG, M4A, FLAC).
  2. Dispatches transcription to Google Gemini ASR (default: gemini-3.5-transcribe).
  3. Preserves original spoken transcript verbatim (never translates Hinglish to English).
  4. Returns typed TranscriptionResult with explicit, unfabricated confidence semantics.
  5. Implements bounded exponential backoff for transient 503 / 429 errors.
  6. Never exposes or logs API keys.
"""

import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Upload and buffer limits
MAX_AUDIO_BYTES = 10 * 1024 * 1024  # 10 MB limit for single turn audio
MIN_AUDIO_BYTES = 16                # Minimum plausible audio header length


# ---------------------------------------------------------------------------
# Typed ASR Exception Hierarchy
# ---------------------------------------------------------------------------

class AsrError(Exception):
    """Base exception for all ASR-related errors."""


class AsrInvalidAudioError(AsrError):
    """Raised when audio bytes are empty, oversized, or corrupted."""


class AsrConfigError(AsrError):
    """Raised when ASR configuration or API credentials are missing or invalid."""


class AsrApiError(AsrError):
    """Raised when the ASR provider returns an API error or server failure."""


class AsrResponseError(AsrError):
    """Raised when the ASR provider response is malformed or unparseable."""


# ---------------------------------------------------------------------------
# Typed ASR Contract
# ---------------------------------------------------------------------------

@dataclass
class TranscriptionResult:
    """
    Typed result of speech-to-text transcription.

    - text: Original verbatim transcription text (never translated or fabricated).
    - language: Language hint supplied or resolved (e.g. "en", "hi", "auto").
    - detected_language: Language explicitly detected by provider or code-switch analysis,
      or "mixed" if code-switching is detected. None if no detection was performed.
    - raw_confidence: Provider-reported ASR confidence (0.0 to 1.0).
      STRICTLY None if provider does not report confidence (never fabricated).
    - provider: Name of the ASR provider (e.g. "gemini").
    - model: Specific model used for transcription.
    - metadata: Audio and provider metadata (duration, format, MIME type, etc.).
    """
    text: str
    language: str
    detected_language: Optional[str] = None
    raw_confidence: Optional[float] = None
    provider: str = "gemini"
    model: str = "gemini-3.5-transcribe"
    metadata: Dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Audio Validation & MIME Detection
# ---------------------------------------------------------------------------

def detect_audio_mime_type(audio_bytes: bytes, filename_hint: Optional[str] = None) -> str:
    """
    Permissively detects the audio MIME type from header magic bytes or filename.
    Supports browser recordings (WebM/Opus, OGG), standard WAV, MP3, FLAC, M4A/AAC.
    Falls back to 'audio/wav' rather than failing on unknown browser headers.
    """
    if filename_hint:
        lower_name = filename_hint.lower()
        if lower_name.endswith(".webm"):
            return "audio/webm"
        if lower_name.endswith(".ogg") or lower_name.endswith(".opus"):
            return "audio/ogg"
        if lower_name.endswith(".mp3"):
            return "audio/mp3"
        if lower_name.endswith(".wav"):
            return "audio/wav"
        if lower_name.endswith(".m4a") or lower_name.endswith(".aac"):
            return "audio/mp4"
        if lower_name.endswith(".flac"):
            return "audio/flac"

    if len(audio_bytes) >= 4:
        # WAV: RIFF....WAVE
        if audio_bytes[:4] == b"RIFF" and len(audio_bytes) >= 12 and audio_bytes[8:12] == b"WAVE":
            return "audio/wav"
        # MP3: ID3 or sync frame
        if audio_bytes[:3] == b"ID3" or audio_bytes[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
            return "audio/mp3"
        # OGG: OggS
        if audio_bytes[:4] == b"OggS":
            return "audio/ogg"
        # WebM: EBML header \x1a\x45\xdf\xa3
        if audio_bytes[:4] == b"\x1a\x45\xdf\xa3":
            return "audio/webm"
        # FLAC: fLaC
        if audio_bytes[:4] == b"fLaC":
            return "audio/flac"
        # MP4 / M4A: ....ftyp
        if len(audio_bytes) >= 8 and audio_bytes[4:8] == b"ftyp":
            return "audio/mp4"

    # Permissive fallback: default to audio/wav without rejecting
    return "audio/wav"


def validate_audio_bytes(audio_bytes: Any) -> None:
    """
    Enforces audio upload constraints:
      - must be bytes or bytearray
      - must not be empty or below minimum plausible header size
      - must not exceed MAX_AUDIO_BYTES (10MB)
    """
    if not isinstance(audio_bytes, (bytes, bytearray)):
        raise AsrInvalidAudioError(
            f"Audio input must be bytes or bytearray, got: {type(audio_bytes).__name__}"
        )
    if len(audio_bytes) == 0:
        raise AsrInvalidAudioError("Audio bytes cannot be empty.")
    if len(audio_bytes) < MIN_AUDIO_BYTES:
        raise AsrInvalidAudioError(
            f"Audio bytes too short ({len(audio_bytes)} bytes) to be valid audio."
        )
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise AsrInvalidAudioError(
            f"Audio exceeds maximum size of {MAX_AUDIO_BYTES / (1024*1024):.0f}MB "
            f"({len(audio_bytes)} bytes)."
        )


# ---------------------------------------------------------------------------
# Code-Switching & Language Detection Helpers
# ---------------------------------------------------------------------------

_DEVANAGARI_REGEX = re.compile(r"[\u0900-\u097F]")
_LATIN_WORDS_REGEX = re.compile(r"[a-zA-Z]{2,}")

_HINDI_TRANSLITERATED_MARKERS = {
    "mein", "se", "ko", "ka", "ki", "ke", "hai", "hain", "tha", "thi",
    "dard", "mahine", "saal", "ho", "raha", "rahi", "kuch", "bohot",
    "bahut", "bhi", "aur", "par", "mujhe", "mera", "meri", "mere",
    "hum", "kya", "kyun", "kab", "kahan", "nahi", "haan", "accha", "theek",
    "seene", "pet", "bukhar", "khansi", "saans", "takleef",
}

_ENGLISH_WORDS_FOR_CODE_SWITCH = {
    "chest", "pain", "days", "hours", "fever", "cough", "doctor", "medicine",
    "tablet", "problem", "issue", "hospital", "report", "test", "headache",
    "severe", "mild", "two", "three", "four", "five",
}


def detect_code_switching(text: str) -> Optional[str]:
    """
    Analyzes text to detect code-switched Hindi-English (Hinglish) speech.
    Returns:
      - 'mixed': if text exhibits clear code-switching (mix of Devanagari and Latin,
        or transliterated Hindi combined with English words).
      - 'hi': if predominantly Devanagari script or transliterated Hindi without English.
      - None: if plain English or no Hindi/code-switch signal detected.
    """
    if not text:
        return None

    has_devanagari = bool(_DEVANAGARI_REGEX.search(text))
    latin_words = [w.lower() for w in _LATIN_WORDS_REGEX.findall(text)]

    # Mix of Devanagari script and Latin words (e.g. "मुझे chest mein दर्द है")
    if has_devanagari and latin_words:
        return "mixed"

    # Predominantly Devanagari without Latin words
    if has_devanagari:
        return "hi"

    # Latin-only: check for transliterated Hindi markers
    hindi_marker_count = sum(1 for w in latin_words if w in _HINDI_TRANSLITERATED_MARKERS)
    english_marker_count = sum(1 for w in latin_words if w in _ENGLISH_WORDS_FOR_CODE_SWITCH)

    # Both Hindi markers and English words present -> Hinglish code-switching
    if hindi_marker_count >= 1 and english_marker_count >= 1:
        return "mixed"

    # Predominantly transliterated Hindi
    if hindi_marker_count >= 2:
        return "hi"

    return None


# ---------------------------------------------------------------------------
# Client Factory
# ---------------------------------------------------------------------------

def get_asr_client(provider: Optional[str] = None) -> Any:
    """
    Instantiates and returns the configured ASR client.
    Reuses LLM_API_KEY / GEMINI_API_KEY / ASR_API_KEY from the environment.
    """
    effective_provider = (provider or os.environ.get("ASR_PROVIDER", "gemini")).lower()

    if effective_provider != "gemini":
        raise AsrConfigError(
            f"Unsupported ASR provider: {effective_provider!r}. "
            "Supported providers: ['gemini']."
        )

    api_key = (
        os.environ.get("ASR_API_KEY")
        or os.environ.get("LLM_API_KEY")
        or os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
    )
    if not api_key or not api_key.strip():
        raise AsrConfigError(
            "No API key found for Gemini ASR. "
            "Please set ASR_API_KEY, LLM_API_KEY, or GEMINI_API_KEY."
        )

    try:
        from google import genai  # noqa: PLC0415
        return genai.Client(api_key=api_key.strip())
    except Exception as exc:
        raise AsrConfigError(f"Failed to initialize Gemini ASR client: {exc}") from exc


# ---------------------------------------------------------------------------
# Transient Error Detection & Retry
# ---------------------------------------------------------------------------

def _is_transient_asr_error(exc: Exception) -> bool:
    """
    Returns True only for transient server overload or rate limiting errors (503, 429).
    Never retries permanent client errors (400, 401, 403, 404, invalid audio).
    """
    status_code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if status_code in (503, 429):
        return True
    msg = str(exc).upper()
    return ("503" in msg or "429" in msg) and (
        "UNAVAILABLE" in msg or "HIGH DEMAND" in msg or "RESOURCE_EXHAUSTED" in msg or "TEMPORARY" in msg
    )


# ---------------------------------------------------------------------------
# Gemini ASR Implementation
# ---------------------------------------------------------------------------

def _call_gemini_asr(
    client: Any,
    model: str,
    audio_bytes: bytes,
    mime_type: str,
    language_hint: str = "auto",
) -> TranscriptionResult:
    """
    Executes real audio transcription using Google Gemini via google-genai SDK.
    Supports dedicated models (gemini-3.5-transcribe) and general multimodal models.
    Includes bounded exponential backoff for transient 503 UNAVAILABLE / 429 errors.
    """
    from google.genai import types as genai_types  # noqa: PLC0415

    audio_part = genai_types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)

    prompt = (
        "You are an expert clinical medical speech transcription system.\n"
        "Transcribe this spoken audio verbatim.\n"
        "Rules:\n"
        "1. Preserve the spoken language exactly (English, Hindi, or Hinglish/code-switched speech).\n"
        "2. Do NOT translate Hindi or Hinglish into English.\n"
        "3. Transcribe only what was spoken. Do not add explanations, conversational comments, or markdown.\n"
        "4. If the audio is silent or contains no human speech, return an empty string."
    )

    # Configure language codes if language_hint is given
    lang_codes = None
    if language_hint and language_hint.lower() not in ("auto", "mixed"):
        if language_hint.lower() in ("hi", "hindi"):
            lang_codes = ["hi-IN"]
        elif language_hint.lower() in ("en", "english"):
            lang_codes = ["en-IN", "en-US"]

    config = genai_types.GenerateContentConfig(
        temperature=0.0,
        audio_transcription_config=genai_types.AudioTranscriptionConfig(
            language_codes=lang_codes,
            mode=genai_types.AudioTranscriptionConfigMode.VERBATIM,
        ) if lang_codes else None,
    )

    max_retries = 3
    backoff_delays = [2.0, 4.0, 8.0]

    for attempt in range(max_retries + 1):
        try:
            # gemini-3.5-transcribe handles audio part alone or with prompt
            contents = [audio_part, prompt] if "transcribe" not in model else [audio_part]
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )

            # 1. Check if model returned a dedicated Transcription object in candidate parts
            extracted_text = None
            provider_lang = None
            provider_confidence = None

            if (
                response
                and response.candidates
                and response.candidates[0].content
                and response.candidates[0].content.parts
            ):
                for p in response.candidates[0].content.parts:
                    if hasattr(p, "audio_transcription") and p.audio_transcription:
                        at = p.audio_transcription
                        extracted_text = getattr(at, "text", None)
                        provider_lang = getattr(at, "language_code", None)
                        break
                    elif hasattr(p, "text") and p.text:
                        extracted_text = p.text
                        break

            # 2. Fallback to response.text if candidate extraction didn't yield text
            if not extracted_text and getattr(response, "text", None):
                extracted_text = response.text

            # Normalize empty/silence responses
            cleaned_text = (extracted_text or "").strip()

            # Clean out boilerplate silence statements like "(no speech detected)"
            if cleaned_text.lower() in (
                "no speech", "none", "silence", "[silence]", "no speech detected.",
                "(no speech detected)", "[no speech]"
            ):
                cleaned_text = ""

            # Language detection: prioritize provider language, then code-switch analysis
            detected_language = provider_lang
            if not detected_language and cleaned_text:
                detected_language = detect_code_switching(cleaned_text)

            return TranscriptionResult(
                text=cleaned_text,
                language=language_hint,
                detected_language=detected_language,
                raw_confidence=provider_confidence,  # strictly None unless reported
                provider="gemini",
                model=model,
                metadata={
                    "byte_size": len(audio_bytes),
                    "mime_type": mime_type,
                    "provider_lang": provider_lang,
                },
            )

        except Exception as exc:
            # Bounded retry on transient 503 / 429
            if attempt < max_retries and _is_transient_asr_error(exc):
                delay = backoff_delays[attempt]
                logger.warning(
                    "Gemini ASR returned transient error (attempt %d/%d). Retrying in %.1fs... Error: %s",
                    attempt + 1, max_retries, delay, exc,
                )
                time.sleep(delay)
                continue

            # Non-transient error or retries exhausted
            raise AsrApiError(f"Gemini ASR API error: {exc}") from exc


# ---------------------------------------------------------------------------
# Canonical Entrypoint
# ---------------------------------------------------------------------------

def transcribe(
    audio_bytes: bytes,
    language_hint: str = "auto",
    client: Any = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    mime_type: Optional[str] = None,
    filename_hint: Optional[str] = None,
) -> TranscriptionResult:
    """
    Canonical speech-to-text entrypoint for PS47.

    Parameters:
      - audio_bytes: Raw audio bytes from patient microphone upload.
      - language_hint: Expected language hint (e.g. "en", "hi", "auto").
      - client: Optional pre-configured ASR client (injected by tests).
      - provider: Provider override ("gemini"). Defaults to env ASR_PROVIDER.
      - model: Model override. Defaults to env ASR_MODEL or "gemini-3.5-transcribe".
      - mime_type: Optional explicit MIME type. Auto-detected if omitted.
      - filename_hint: Optional filename for MIME detection hint.

    Returns:
      TranscriptionResult with verbatim transcript, language metadata,
      and raw_confidence (None if unavailable).
    """
    validate_audio_bytes(audio_bytes)

    detected_mime = mime_type or detect_audio_mime_type(audio_bytes, filename_hint)

    effective_provider = (provider or os.environ.get("ASR_PROVIDER", "gemini")).lower()
    effective_model = model or os.environ.get("ASR_MODEL", "gemini-3.5-transcribe")

    if client is None:
        client = get_asr_client(effective_provider)

    if effective_provider == "gemini":
        return _call_gemini_asr(
            client=client,
            model=effective_model,
            audio_bytes=audio_bytes,
            mime_type=detected_mime,
            language_hint=language_hint,
        )

    raise AsrConfigError(f"Unsupported ASR provider: {effective_provider!r}")
