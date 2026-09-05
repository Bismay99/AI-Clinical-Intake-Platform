"""
tests/test_voice_pipeline_real.py

Real live end-to-end voice intake pipeline test (Phase 4C).
Runs actual audio through:
  Real Audio -> Real Gemini ASR -> raw_transcript -> Normalization -> Real LLM Extraction -> Question Engine -> UNREVIEWED Draft Entity

Requires:
  - LLM_API_KEY (or ASR_API_KEY) in environment
  - Network access to Google Gemini

Run explicitly with:
    pytest -m live_voice_pipeline tests/test_voice_pipeline_real.py -v
"""

import os
from pathlib import Path
import pytest

pytestmark = pytest.mark.live_voice_pipeline

from ai_orchestration.brain import handle_intake_turn
from ai_orchestration.contracts import (
    IntakeRequest,
    IntakeResponse,
    SourceType,
    VerificationStatus,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "audio"


@pytest.fixture(autouse=True)
def require_live_credentials():
    api_key = (
        os.environ.get("ASR_API_KEY")
        or os.environ.get("LLM_API_KEY")
        or os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
    )
    if not api_key or not api_key.strip():
        pytest.skip("No API key available for live voice pipeline test.")


@pytest.mark.live_voice_pipeline
def test_real_voice_pipeline_english_intake_turn():
    """
    Full real pipeline test:
      1. English audio ('I have severe chest pain for three days.')
      2. Gemini ASR transcribes to raw_transcript.
      3. Normalization maps to clinical terminology.
      4. Structured extraction extracts chief_complaint ('chest pain').
      5. Question engine advances to next field ('onset').
      6. All entities have intake_session provenance and UNREVIEWED status.
    """
    audio_path = FIXTURES_DIR / "english_chest_pain.mp3"
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    req = IntakeRequest(
        encounter_id="enc_live_voice_001",
        schema_id="allopathic_chest_pain_v1",
        language="en",
        audio_bytes=audio_bytes,
        touch_answer=None,
        history=[],
        answering_field_name="chief_complaint",
    )

    resp: IntakeResponse = handle_intake_turn(req)

    print(f"\n[Live Voice Pipeline] Raw transcript: {resp.raw_transcript!r}")
    print(f"[Live Voice Pipeline] Next question: {resp.next_question} ({resp.next_question_field_name})")
    print(f"[Live Voice Pipeline] Extracted entities: {[(e.field_name, e.value) for e in resp.draft_entities]}")

    # 1. Raw transcript preserved
    assert resp.raw_transcript is not None
    assert len(resp.raw_transcript.strip()) > 0
    assert "chest" in resp.raw_transcript.lower()
    assert "pain" in resp.raw_transcript.lower()

    # 2. Draft entities extracted
    assert len(resp.draft_entities) >= 1
    field_names = [e.field_name for e in resp.draft_entities]
    assert "chief_complaint" in field_names

    # 3. Provenance correctly points to intake_session turn
    for entity in resp.draft_entities:
        assert entity.source.source_type == SourceType.INTAKE_SESSION
        assert entity.source.source_id == "enc_live_voice_001"
        assert entity.source.location == "turn:0"

    # 4. Strict safety invariant: all entities are UNREVIEWED
    for entity in resp.draft_entities:
        assert entity.verification_status == VerificationStatus.UNREVIEWED

    # 5. Question engine advanced to the next missing field in schema
    assert resp.next_question is not None
    assert resp.next_question_field_name == "onset"
    assert resp.pathway_complete is False


@pytest.mark.live_voice_pipeline
def test_real_voice_pipeline_silence_produces_no_hallucinations():
    """
    Verifies that real silence audio in the voice pipeline does NOT hallucinate
    clinical symptoms or fabricate draft entities.
    """
    audio_path = FIXTURES_DIR / "silence.wav"
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    req = IntakeRequest(
        encounter_id="enc_live_silence_001",
        schema_id="allopathic_chest_pain_v1",
        language="en",
        audio_bytes=audio_bytes,
        touch_answer=None,
        history=[],
        answering_field_name="chief_complaint",
    )

    resp: IntakeResponse = handle_intake_turn(req)

    print(f"\n[Live Silence Pipeline] Raw transcript: {resp.raw_transcript!r}")
    print(f"[Live Silence Pipeline] Extracted entities: {[(e.field_name, e.value) for e in resp.draft_entities]}")

    # Must not extract any hallucinated clinical entities from silence
    assert len(resp.draft_entities) == 0, (
        f"Expected no entities from silence audio, but got: {resp.draft_entities}"
    )
