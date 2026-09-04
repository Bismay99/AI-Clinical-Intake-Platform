"""
tests/test_paddleocr_real.py

REAL LOCAL INFERENCE INTEGRATION TEST for PaddleOCR.
Performs actual neural-network text detection and recognition on a generated test image fixture.
Does NOT use mocks. Does NOT make any network calls.

Marked with @pytest.mark.live_ocr so it does not slow down standard unit test runs,
and @pytest.mark.no_auto_ocr_mock so conftest does not intercept the call.

Run explicitly with:
    pytest tests/test_paddleocr_real.py -m live_ocr
"""

import io
import pytest
from PIL import Image, ImageDraw

from ai_orchestration.services.ocr import extract_text_blocks, OcrBlock


@pytest.mark.live_ocr
@pytest.mark.no_auto_ocr_mock
def test_paddleocr_real_neural_inference():
    """
    Renders clean printed medical text onto an automated image fixture,
    runs REAL PaddleOCR neural-network inference, and verifies the output.
    """
    # 1. Create a clear automated image fixture with prescription text
    # Note: Automated OCR fixture only; not a real patient document.
    img = Image.new("RGB", (600, 200), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Render distinct lines of text
    draw.text((25, 30), "Tab. Atorvastatin 10mg OD", fill=(0, 0, 0))
    draw.text((25, 100), "Date: 12/06/2026", fill=(0, 0, 0))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    real_image_bytes = buf.getvalue()

    # 2. Execute real OCR through the canonical extract_text_blocks pipeline
    blocks = extract_text_blocks(
        file_bytes=real_image_bytes,
        document_type="prescription",
        language_hint="en",
        provider="paddleocr",
    )

    # 3. Verify real inference outputs
    assert len(blocks) >= 2, f"Expected at least 2 text blocks, got {len(blocks)}: {blocks}"

    full_extracted_text = " ".join(b.text for b in blocks)
    assert "Atorvastatin" in full_extracted_text, f"'Atorvastatin' not recognized in: {full_extracted_text}"
    assert "10mg" in full_extracted_text or "OD" in full_extracted_text, f"Dosage not recognized in: {full_extracted_text}"
    assert "2026" in full_extracted_text, f"Date year not recognized in: {full_extracted_text}"

    # 4. Verify contracts, provenance, and confidence
    for b in blocks:
        assert isinstance(b, OcrBlock)
        assert b.page == 1
        assert b.region.startswith("bbox:"), f"Invalid bounding box region: {b.region}"
        assert 0.0 <= b.raw_confidence <= 1.0, f"Confidence out of range: {b.raw_confidence}"
        assert b.metadata.get("provider") == "paddleocr"
        assert not hasattr(b, "verification_status"), "OcrBlock must not have verification_status"
