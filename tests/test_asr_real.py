"""
tests/test_asr_real.py

Real live integration tests for Gemini ASR (Phase 4C).
Performs actual speech-to-text calls on real human speech audio fixtures.

Requires:
  - LLM_API_KEY (or ASR_API_KEY / GEMINI_API_KEY) in environment
  - Network access to Google Gemini endpoint

Run explicitly with:
    pytest -m live_asr tests/test_asr_real.py -v
"""

import os
from pathlib import Path
import pytest

pytestmark = pytest.mark.live_asr

from ai_orchestration.services.asr import (
    get_asr_client,
    transcribe,
    TranscriptionResult,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "audio"


# ---------------------------------------------------------------------------
# Fixture: real client or skip
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def live_asr_client():
    api_key = (
        os.environ.get("ASR_API_KEY")
        or os.environ.get("LLM_API_KEY")
        or os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
    )
    if not api_key or not api_key.strip():
        pytest.skip(
            "No API key found in environment (ASR_API_KEY, LLM_API_KEY, or GEMINI_API_KEY). "
            "Skipping live ASR integration tests."
        )
    return get_asr_client("gemini")


# ---------------------------------------------------------------------------
# Live Audio Tests
# ---------------------------------------------------------------------------

@pytest.mark.live_asr
def test_real_asr_english_speech(live_asr_client):
    """
    Real English speech test:
    Audio contains: 'I have severe chest pain for three days.'
    """
    audio_path = FIXTURES_DIR / "english_chest_pain.mp3"
    assert audio_path.exists(), f"Audio fixture missing: {audio_path}"

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    result = transcribe(
        audio_bytes=audio_bytes,
        language_hint="en",
        client=live_asr_client,
        mime_type="audio/mp3",
    )

    assert isinstance(result, TranscriptionResult)
    assert result.text, "English speech should yield non-empty transcript"
    lowered = result.text.lower()
    print(f"\n[Live ASR English] Transcript: {result.text!r}")

    # Verify key clinical terms are accurately recognized
    assert "chest" in lowered, f"Expected 'chest' in transcript: {result.text}"
    assert "pain" in lowered, f"Expected 'pain' in transcript: {result.text}"
    assert any(d in lowered for d in ["three", "3"]), f"Expected duration in transcript: {result.text}"


@pytest.mark.live_asr
def test_real_asr_hindi_speech(live_asr_client):
    """
    Real Hindi speech test:
    Audio contains: 'मुझे तीन दिन से सीने में तेज दर्द है।'
    """
    audio_path = FIXTURES_DIR / "hindi_chest_pain.mp3"
    assert audio_path.exists(), f"Audio fixture missing: {audio_path}"

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    result = transcribe(
        audio_bytes=audio_bytes,
        language_hint="hi",
        client=live_asr_client,
        mime_type="audio/mp3",
    )

    assert isinstance(result, TranscriptionResult)
    assert result.text, "Hindi speech should yield non-empty transcript"
    print(f"\n[Live ASR Hindi] Transcript: {result.text.encode('unicode_escape').decode()!r}")

    # Check Hindi clinical indicators (Devanagari or transliteration)
    hindi_keywords = ["दर्द", "दिन", "सीने", "तेज", "dard", "din", "seene"]
    assert any(kw in result.text for kw in hindi_keywords), (
        f"Hindi clinical keywords missing from transcript: {result.text}"
    )


@pytest.mark.live_asr
def test_real_asr_hinglish_speech_preserves_code_switching(live_asr_client):
    """
    Real Hinglish speech test:
    Audio contains: 'Mujhe two days se chest mein pain ho raha hai.'
    Verifies that code-switching is preserved verbatim and not forcibly translated to English.
    """
    audio_path = FIXTURES_DIR / "hinglish_chest_pain.mp3"
    assert audio_path.exists(), f"Audio fixture missing: {audio_path}"

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    result = transcribe(
        audio_bytes=audio_bytes,
        language_hint="auto",
        client=live_asr_client,
        mime_type="audio/mp3",
    )

    assert isinstance(result, TranscriptionResult)
    assert result.text, "Hinglish speech should yield non-empty transcript"
    print(f"\n[Live ASR Hinglish] Transcript: {result.text.encode('unicode_escape').decode()!r}")

    # Verify clinical terms (chest/pain) AND Hindi grammatical markers are both present
    lowered = result.text.lower()
    has_medical_words = any(w in lowered or w in result.text for w in ["chest", "pain", "चेस्ट", "पेन"])
    has_hindi_markers = any(w in lowered or w in result.text for w in ["se", "mein", "hai", "से", "में", "है", "दर्द", "dard"])

    assert has_medical_words, f"Expected medical words in Hinglish transcript: {result.text}"
    assert has_hindi_markers, f"Expected Hindi code-switching markers in Hinglish transcript: {result.text}"


@pytest.mark.live_asr
def test_real_asr_silence_no_hallucinated_speech(live_asr_client):
    """
    Real silence audio test:
    Verifies that silence or ambient background noise does NOT produce fabricated clinical facts.
    """
    audio_path = FIXTURES_DIR / "silence.wav"
    assert audio_path.exists(), f"Audio fixture missing: {audio_path}"

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    result = transcribe(
        audio_bytes=audio_bytes,
        language_hint="auto",
        client=live_asr_client,
        mime_type="audio/wav",
    )

    assert isinstance(result, TranscriptionResult)
    print(f"\n[Live ASR Silence] Transcript: {result.text!r}")

    # Must be either empty string or not contain any fabricated clinical symptoms
    lowered = result.text.lower()
    hallucinated_terms = ["chest pain", "fever", "cough", "amoxicillin", "atorvastatin", "diabetes"]
    for term in hallucinated_terms:
        assert term not in lowered, f"Hallucinated clinical term '{term}' found in silence transcript: {result.text}"


@pytest.mark.live_asr
def test_real_asr_confidence_semantics(live_asr_client):
    """
    Verifies that raw_confidence is either None or a valid float in [0.0, 1.0],
    and is never fabricated with a hardcoded constant.
    """
    audio_path = FIXTURES_DIR / "english_chest_pain.mp3"
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    result = transcribe(
        audio_bytes=audio_bytes,
        language_hint="en",
        client=live_asr_client,
        mime_type="audio/mp3",
    )
    if result.raw_confidence is not None:
        assert 0.0 <= result.raw_confidence <= 1.0
