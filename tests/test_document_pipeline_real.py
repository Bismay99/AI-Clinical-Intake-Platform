"""
tests/test_document_pipeline_real.py

End-to-end real pipeline test (Phase 4B).

Runs the FULL document processing pipeline:
  Real PaddleOCR neural inference -> OcrBlock[] -> Real LLM extraction
  -> Pydantic validation -> RawFieldGuess[] -> evidence matching
  -> provenance attachment -> confidence calculation
  -> safety validation -> UNREVIEWED ExtractedEntity

Requirements:
  - @pytest.mark.live_document_ai
  - PaddleOCR 3.7.0 installed (no API key required)
  - LLM_API_KEY set in environment
  - LLM_PROVIDER set (default: openai)
  - Pillow installed (for generating test image)

Run explicitly with:
    pytest -m live_document_ai tests/test_document_pipeline_real.py -v

The conftest autouse fixture does NOT apply any mocks to these tests.
This is a full live run of both the OCR and LLM pipelines.

NOTE: The prescription image is generated programmatically from known text.
It is an automated fixture for testing the OCR+LLM pipeline end-to-end.
It does NOT represent a real patient document.
"""

import os
import io
import pytest

pytestmark = pytest.mark.live_document_ai

from ai_orchestration.contracts import VerificationStatus, SourceType
from ai_orchestration.extraction import extract_from_document
from ai_orchestration.confidence import LOW_CONFIDENCE_THRESHOLD


# ---------------------------------------------------------------------------
# Fixture: generate a sample prescription image
# ---------------------------------------------------------------------------

PRESCRIPTION_TEXT_LINES = [
    "Patient: Rahul Das",
    "Date: 02/09/2026",
    "Medicine: Amoxicillin 500mg",
    "Dose: 1 tablet twice daily",
    "Duration: 5 days",
]

EXPECTED_DOCUMENT_ID = "e2e-prescription-001"


@pytest.fixture(scope="module")
def prescription_image_bytes():
    """
    Generate a simple PNG image of the sample prescription text.
    Uses Pillow to render text as a white-background image.
    This is an automated fixture for testing only -- not a real patient record.
    """
    pytest.importorskip("PIL", reason="Pillow required for document pipeline tests")
    from PIL import Image, ImageDraw, ImageFont

    # Create a white image
    img_width, img_height = 600, 300
    img = Image.new("RGB", (img_width, img_height), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Use default PIL font (no external font required)
    try:
        font = ImageFont.truetype("arial.ttf", 20)
    except (IOError, OSError):
        font = ImageFont.load_default()

    # Draw each line of the prescription
    y = 20
    for line in PRESCRIPTION_TEXT_LINES:
        draw.text((20, y), line, fill=(0, 0, 0), font=font)
        y += 40

    # Encode to PNG bytes
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture(scope="module")
def check_llm_configured():
    """Skip if LLM is not configured."""
    api_key = os.environ.get("LLM_API_KEY", "").strip()
    if not api_key:
        pytest.skip(
            "LLM_API_KEY environment variable is not set. "
            "Set it to run end-to-end document pipeline tests."
        )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.live_document_ai
def test_full_pipeline_returns_entities(prescription_image_bytes, check_llm_configured):
    """
    Full pipeline test: image bytes -> PaddleOCR -> LLM -> ExtractedEntity list.
    Verifies the pipeline produces at least one entity.
    """
    entities = extract_from_document(
        document_id=EXPECTED_DOCUMENT_ID,
        document_type="prescription",
        file_bytes=prescription_image_bytes,
    )

    print(f"\nFull pipeline extracted {len(entities)} entities:")
    for e in entities:
        print(f"  {e.field_name}: {e.value!r} "
              f"(confidence={e.confidence:.2f}, loc={e.source.location})")

    assert isinstance(entities, list), "Pipeline must return a list"
    assert len(entities) > 0, (
        "End-to-end pipeline must extract at least one entity from the Rahul Das prescription image"
    )


@pytest.mark.live_document_ai
def test_full_pipeline_entities_are_unreviewed(prescription_image_bytes, check_llm_configured):
    """AI must never set entities to ACCEPTED, EDITED, or REJECTED."""
    entities = extract_from_document(
        document_id=EXPECTED_DOCUMENT_ID,
        document_type="prescription",
        file_bytes=prescription_image_bytes,
    )
    for entity in entities:
        assert entity.verification_status == VerificationStatus.UNREVIEWED, (
            f"Entity {entity.field_name!r} must be UNREVIEWED; got {entity.verification_status}"
        )


@pytest.mark.live_document_ai
def test_full_pipeline_provenance_is_from_document(prescription_image_bytes, check_llm_configured):
    """Every entity must trace back to the document, not an intake session."""
    entities = extract_from_document(
        document_id=EXPECTED_DOCUMENT_ID,
        document_type="prescription",
        file_bytes=prescription_image_bytes,
    )
    for entity in entities:
        assert entity.source.source_type == SourceType.DOCUMENT, (
            f"Entity {entity.field_name!r} has wrong source_type: {entity.source.source_type}"
        )
        assert entity.source.source_id == EXPECTED_DOCUMENT_ID


@pytest.mark.live_document_ai
def test_full_pipeline_provenance_has_page_location(prescription_image_bytes, check_llm_configured):
    """Every entity must have a page/region location derived from OcrBlock (not from LLM)."""
    entities = extract_from_document(
        document_id=EXPECTED_DOCUMENT_ID,
        document_type="prescription",
        file_bytes=prescription_image_bytes,
    )
    for entity in entities:
        assert entity.source.location is not None, (
            f"Entity {entity.field_name!r} has no source location"
        )
        assert "page:" in entity.source.location, (
            f"Location {entity.source.location!r} should contain 'page:'"
        )


@pytest.mark.live_document_ai
def test_full_pipeline_confidence_is_valid(prescription_image_bytes, check_llm_configured):
    """Confidence scores must be in [0.0, 1.0] and low_confidence_flag must be correct."""
    entities = extract_from_document(
        document_id=EXPECTED_DOCUMENT_ID,
        document_type="prescription",
        file_bytes=prescription_image_bytes,
    )
    for entity in entities:
        assert 0.0 <= entity.confidence <= 1.0
        expected_flag = entity.confidence < LOW_CONFIDENCE_THRESHOLD
        assert entity.low_confidence_flag == expected_flag


@pytest.mark.live_document_ai
def test_full_pipeline_medication_extracted(prescription_image_bytes, check_llm_configured):
    """The medication field must be extracted from the Rahul Das prescription image."""
    entities = extract_from_document(
        document_id=EXPECTED_DOCUMENT_ID,
        document_type="prescription",
        file_bytes=prescription_image_bytes,
    )
    field_names = [e.field_name for e in entities]
    assert "medication" in field_names, (
        f"medication was not extracted from the Rahul Das prescription. "
        f"Extracted: {field_names}"
    )

    med_entity = next(e for e in entities if e.field_name == "medication")
    assert "amoxicillin" in med_entity.value.lower(), (
        f"medication value should contain 'Amoxicillin', got: {med_entity.value!r}"
    )
