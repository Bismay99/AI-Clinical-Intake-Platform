"""
tests/test_ocr.py

Comprehensive unit tests for the Google Cloud Vision OCR integration
(ai_orchestration.services.ocr and backend.services.ocr).

Ensures:
  1. No real Google Cloud API calls are ever made during testing (all mocked).
  2. extract_text_blocks parses full text, page numbers, regions/bounding boxes,
     and confidence accurately.
  3. Proper typed exceptions are raised for invalid credentials, API failure,
     empty document, unsupported input, and malformed OCR responses.
  4. OCR layer does not emit clinical entities or finalized statuses.
  5. backend.services.ocr is a clean re-export of ai_orchestration.services.ocr.
"""

import os
import pytest
from unittest.mock import MagicMock
from google.api_core.exceptions import GoogleAPICallError

from ai_orchestration.services.ocr import (
    extract_text_blocks,
    get_vision_client,
    OcrBlock,
    OcrError,
    OcrCredentialError,
    OcrApiError,
    OcrInvalidInputError,
    OcrResponseError,
)
import backend.services.ocr as backend_ocr


# ---------------------------------------------------------------------------
# Helpers for mock Google Vision responses
# ---------------------------------------------------------------------------
class MockVertex:
    def __init__(self, x: int, y: int):
        self.x = x
        self.y = y


class MockBoundingBox:
    def __init__(self, vertices):
        self.vertices = vertices


class MockSymbol:
    def __init__(self, text: str):
        self.text = text


class MockWord:
    def __init__(self, text: str, confidence: float = 0.95):
        self.symbols = [MockSymbol(c) for c in text]
        self.text = text
        self.confidence = confidence


class MockParagraph:
    def __init__(self, words_text: list[str], confidence: float = 0.95):
        self.words = [MockWord(w, confidence=confidence) for w in words_text]


class MockBlock:
    def __init__(self, paragraphs, confidence: float = 0.92, block_type: int = 1, bbox=None):
        self.paragraphs = paragraphs
        self.confidence = confidence
        self.block_type = block_type
        if bbox is None:
            bbox = [(10, 20), (200, 20), (200, 80), (10, 80)]
        self.bounding_box = MockBoundingBox([MockVertex(x, y) for x, y in bbox])


class MockPage:
    def __init__(self, blocks):
        self.blocks = blocks


class MockFullTextAnnotation:
    def __init__(self, pages):
        self.pages = pages


class MockVisionResponse:
    def __init__(self, pages=None, error=None):
        self.full_text_annotation = MockFullTextAnnotation(pages or []) if pages is not None else None
        self.error = error


# ---------------------------------------------------------------------------
# 1. Google Vision Adapter Mock Unit Tests
# ---------------------------------------------------------------------------
@pytest.mark.no_auto_ocr_mock
def test_extract_text_blocks_success():
    """Verify that structured document text is accurately extracted into OcrBlock objects."""
    p1 = MockParagraph(["Rx", "Paracetamol", "500mg"], confidence=0.96)
    p2 = MockParagraph(["Take", "twice", "daily"], confidence=0.90)
    block1 = MockBlock([p1, p2], confidence=0.93, bbox=[(10, 20), (100, 20), (100, 50), (10, 50)])

    p3 = MockParagraph(["Date:", "15/08/2026"], confidence=0.88)
    block2 = MockBlock([p3], confidence=0.88, bbox=[(10, 60), (80, 60), (80, 90), (10, 90)])

    page1 = MockPage([block1, block2])
    mock_response = MockVisionResponse(pages=[page1])

    mock_client = MagicMock()
    mock_client.document_text_detection.return_value = mock_response

    blocks = extract_text_blocks(
        file_bytes=b"sample-valid-image-bytes",
        document_type="prescription",
        language_hint="en",
        client=mock_client,
        provider="google_vision",
    )

    assert len(blocks) == 2
    b1 = blocks[0]
    assert b1.page == 1
    assert "Rx Paracetamol 500mg" in b1.text
    assert "Take twice daily" in b1.text
    assert b1.raw_confidence == pytest.approx(0.93, rel=1e-2)
    assert b1.region == "bbox:(10,20),(100,20),(100,50),(10,50)"
    assert b1.metadata["document_type"] == "prescription"
    assert b1.metadata["block_index"] == 1

    b2 = blocks[1]
    assert b2.page == 1
    assert b2.text == "Date: 15/08/2026"
    assert b2.raw_confidence == pytest.approx(0.88, rel=1e-2)
    assert b2.region == "bbox:(10,60),(80,60),(80,90),(10,90)"


@pytest.mark.no_auto_ocr_mock
def test_extract_text_blocks_word_confidence_fallback():
    """When block confidence is absent/zero, average of word confidences should be computed."""
    p = MockParagraph(["Test", "Result"], confidence=0.80)
    # Block confidence = 0.0, word confidences = 0.80
    block = MockBlock([p], confidence=0.0)
    mock_response = MockVisionResponse(pages=[MockPage([block])])

    mock_client = MagicMock()
    mock_client.document_text_detection.return_value = mock_response

    blocks = extract_text_blocks(
        file_bytes=b"sample-bytes",
        document_type="lab_report",
        client=mock_client,
        provider="google_vision",
    )

    assert len(blocks) == 1
    assert blocks[0].raw_confidence == pytest.approx(0.80, rel=1e-2)


# ---------------------------------------------------------------------------
# 2. Input Validation & Empty Documents
# ---------------------------------------------------------------------------
@pytest.mark.no_auto_ocr_mock
def test_extract_text_blocks_empty_bytes_raises_error():
    """Empty or whitespace-only bytes must raise OcrInvalidInputError."""
    with pytest.raises(OcrInvalidInputError, match="empty document"):
        extract_text_blocks(b"")

    with pytest.raises(OcrInvalidInputError, match="empty document"):
        extract_text_blocks(b"   ")


@pytest.mark.no_auto_ocr_mock
def test_extract_text_blocks_invalid_type_raises_error():
    """Passing non-bytes input must raise OcrInvalidInputError."""
    with pytest.raises(OcrInvalidInputError, match="must be bytes or bytearray"):
        extract_text_blocks("not bytes string")  # type: ignore


@pytest.mark.no_auto_ocr_mock
def test_extract_text_blocks_blank_document_returns_empty_list():
    """When document has no detectable text (blank page), return empty list cleanly."""
    mock_response = MockVisionResponse(pages=[])
    mock_client = MagicMock()
    mock_client.document_text_detection.return_value = mock_response

    blocks = extract_text_blocks(
        b"valid-image-blank-page",
        client=mock_client,
        provider="google_vision",
    )
    assert blocks == []


# ---------------------------------------------------------------------------
# 3. Credentials & Client Initialization Errors
# ---------------------------------------------------------------------------
@pytest.mark.no_auto_ocr_mock
def test_get_vision_client_missing_env_var(monkeypatch):
    """When GOOGLE_APPLICATION_CREDENTIALS is not set, raise OcrCredentialError."""
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    with pytest.raises(OcrCredentialError, match="GOOGLE_APPLICATION_CREDENTIALS environment variable is not set"):
        get_vision_client()


@pytest.mark.no_auto_ocr_mock
def test_get_vision_client_nonexistent_file(monkeypatch):
    """When GOOGLE_APPLICATION_CREDENTIALS points to nonexistent file, raise OcrCredentialError."""
    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS", "./non_existent_key_file.json")
    with pytest.raises(OcrCredentialError, match="credentials file not found"):
        get_vision_client()


# ---------------------------------------------------------------------------
# 4. Vision API Failure & Response Errors
# ---------------------------------------------------------------------------
@pytest.mark.no_auto_ocr_mock
def test_extract_text_blocks_api_call_error():
    """When Google Vision API raises GoogleAPICallError, raise OcrApiError."""
    mock_client = MagicMock()
    mock_client.document_text_detection.side_effect = GoogleAPICallError("Network timeout connecting to Vision API")

    with pytest.raises(OcrApiError, match="Google Cloud Vision API call failed"):
        extract_text_blocks(
            b"image-bytes",
            client=mock_client,
            provider="google_vision",
        )


@pytest.mark.no_auto_ocr_mock
def test_extract_text_blocks_response_error_payload():
    """When Vision API response object contains an error message, raise OcrApiError."""
    mock_client = MagicMock()
    error_mock = MagicMock()
    error_mock.message = "Bad image format"
    error_mock.code = 3
    mock_response = MagicMock()
    mock_response.error = error_mock
    mock_client.document_text_detection.return_value = mock_response

    with pytest.raises(OcrApiError, match="Google Cloud Vision returned an error"):
        extract_text_blocks(
            b"corrupted-bytes",
            client=mock_client,
            provider="google_vision",
        )


@pytest.mark.no_auto_ocr_mock
def test_extract_text_blocks_malformed_response_structure():
    """When response full_text_annotation is malformed, raise OcrResponseError."""
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.error = None
    # Simulate broken structure where iterating pages triggers AttributeError
    mock_page = MagicMock()
    del mock_page.blocks
    mock_response.full_text_annotation.pages = [mock_page]
    mock_client.document_text_detection.return_value = mock_response

    with pytest.raises(OcrResponseError, match="Failed to parse"):
        extract_text_blocks(
            b"some-bytes",
            client=mock_client,
            provider="google_vision",
        )


# ---------------------------------------------------------------------------
# 5. PaddleOCR Adapter Mock Unit Tests
# ---------------------------------------------------------------------------
def _create_test_image_bytes():
    """Generates a small valid in-memory PNG byte string for image-decoding unit tests."""
    import io
    from PIL import Image
    img = Image.new("RGB", (200, 100), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.no_auto_ocr_mock
def test_paddleocr_adapter_success():
    """Test PaddleOCR adapter with mocked PaddleOCR client returning 3.x result structure."""
    mock_client = MagicMock()
    mock_client.ocr.return_value = [{
        "rec_texts": ["Tab. Metformin 500mg", "OD for 30 days"],
        "rec_scores": [0.97, 0.89],
        "rec_polys": [
            [[10, 20], [150, 20], [150, 45], [10, 45]],
            [[10, 50], [120, 50], [120, 75], [10, 75]],
        ],
    }]

    test_bytes = _create_test_image_bytes()
    blocks = extract_text_blocks(
        file_bytes=test_bytes,
        document_type="prescription",
        language_hint="en",
        client=mock_client,
        provider="paddleocr",
    )

    assert len(blocks) == 2
    assert blocks[0].text == "Tab. Metformin 500mg"
    assert blocks[0].raw_confidence == pytest.approx(0.97, rel=1e-2)
    assert blocks[0].region == "bbox:(10,20),(150,20),(150,45),(10,45)"
    assert blocks[0].metadata["provider"] == "paddleocr"
    assert blocks[0].metadata["document_type"] == "prescription"

    assert blocks[1].text == "OD for 30 days"
    assert blocks[1].raw_confidence == pytest.approx(0.89, rel=1e-2)
    assert blocks[1].region == "bbox:(10,50),(120,50),(120,75),(10,75)"


@pytest.mark.no_auto_ocr_mock
def test_paddleocr_adapter_empty_results():
    """Test PaddleOCR when no text is detected (returns empty list)."""
    mock_client = MagicMock()
    mock_client.ocr.return_value = [{
        "rec_texts": [],
        "rec_scores": [],
        "rec_polys": [],
    }]

    test_bytes = _create_test_image_bytes()
    blocks = extract_text_blocks(
        file_bytes=test_bytes,
        client=mock_client,
        provider="paddleocr",
    )
    assert blocks == []


@pytest.mark.no_auto_ocr_mock
def test_paddleocr_corrupted_image_bytes():
    """Corrupted non-image bytes passed to PaddleOCR adapter must raise OcrInvalidInputError."""
    with pytest.raises(OcrInvalidInputError, match="Failed to decode document bytes as a valid image"):
        extract_text_blocks(
            file_bytes=b"this is totally not an image file byte sequence",
            provider="paddleocr",
        )


@pytest.mark.no_auto_ocr_mock
def test_paddleocr_inference_failure():
    """PaddleOCR engine inference exceptions must raise OcrApiError."""
    mock_client = MagicMock()
    mock_client.ocr.side_effect = RuntimeError("Paddle internal execution fault")

    test_bytes = _create_test_image_bytes()
    with pytest.raises(OcrApiError, match="PaddleOCR inference failed"):
        extract_text_blocks(
            file_bytes=test_bytes,
            client=mock_client,
            provider="paddleocr",
        )


@pytest.mark.no_auto_ocr_mock
def test_paddleocr_malformed_response_structure():
    """When response structure triggers an unhandled parse error, raise OcrResponseError."""
    mock_client = MagicMock()
    mock_client.ocr.return_value = ["completely invalid output structure string"]

    test_bytes = _create_test_image_bytes()
    with pytest.raises(OcrResponseError, match="Unexpected PaddleOCR page result type"):
        extract_text_blocks(
            file_bytes=test_bytes,
            client=mock_client,
            provider="paddleocr",
        )


# ---------------------------------------------------------------------------
# 6. Provider Switching & Unsupported Provider
# ---------------------------------------------------------------------------
@pytest.mark.no_auto_ocr_mock
def test_provider_selection_via_env(monkeypatch):
    """Test that OCR_PROVIDER environment variable selects the proper engine."""
    monkeypatch.setenv("OCR_PROVIDER", "paddleocr")
    mock_paddle = MagicMock()
    mock_paddle.ocr.return_value = [{"rec_texts": ["Paddle Text"], "rec_scores": [0.95], "rec_polys": [[[0,0],[1,0],[1,1],[0,1]]]}]

    monkeypatch.setattr("ai_orchestration.services.ocr.get_paddle_ocr_client", lambda lang="en": mock_paddle)
    test_bytes = _create_test_image_bytes()
    blocks = extract_text_blocks(file_bytes=test_bytes)
    assert len(blocks) == 1
    assert blocks[0].metadata["provider"] == "paddleocr"


@pytest.mark.no_auto_ocr_mock
def test_unsupported_provider_raises_error():
    """Passing an unknown provider name raises OcrError."""
    test_bytes = _create_test_image_bytes()
    with pytest.raises(OcrError, match="Unsupported OCR provider"):
        extract_text_blocks(test_bytes, provider="unknown_engine")


# ---------------------------------------------------------------------------
# 7. Architecture & Re-Export Verification
# ---------------------------------------------------------------------------
@pytest.mark.no_auto_ocr_mock
def test_backend_services_ocr_is_reexport():
    """
    Verify backend/services/ocr.py exposes the exact same objects as
    ai_orchestration/services/ocr.py without duplicating logic.
    """
    assert backend_ocr.OcrBlock is OcrBlock
    assert backend_ocr.extract_text_blocks is extract_text_blocks
    assert backend_ocr.OcrError is OcrError
    assert backend_ocr.OcrCredentialError is OcrCredentialError
    assert backend_ocr.OcrApiError is OcrApiError
    assert backend_ocr.OcrInvalidInputError is OcrInvalidInputError
    assert backend_ocr.OcrResponseError is OcrResponseError


def test_ocr_does_not_create_finalized_entities():
    """
    Verify OcrBlock does not contain clinical verification status
    (ACCEPTED / EDITED / REJECTED) or treat itself as a clinical entity.
    """
    block = OcrBlock(
        text="Tab. Metformin 500mg",
        page=1,
        region="bbox:(0,0),(10,0),(10,10),(0,10)",
        raw_confidence=0.95,
    )
    assert not hasattr(block, "verification_status")
    assert not hasattr(block, "accepted")
    assert not hasattr(block, "edited")
    assert not hasattr(block, "rejected")
    assert block.raw_confidence == 0.95
