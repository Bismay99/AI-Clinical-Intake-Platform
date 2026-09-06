"""
ai_orchestration/services/ocr.py

Canonical OCR adapter supporting:
  - Local PaddleOCR (default for development/hackathon, zero-cost, runs locally)
  - Google Cloud Vision (optional cloud OCR provider)

Single source of truth for:
  - OcrBlock data contract
  - OCR client initialization (PaddleOCR & Google Vision)
  - OCR inference & output parsing
  - Bounding-box and region provenance calculation
  - Confidence normalization
  - OCR exception hierarchy

Returns raw OCR blocks with position/provenance metadata — NOT clinical entities.
Downstream extraction and normalization happen in extraction.py.
"""

import io
import os
from dataclasses import dataclass, field
from typing import List, Optional, Any, Dict, Tuple

from google.cloud import vision
from google.api_core.exceptions import GoogleAPICallError, PermissionDenied, Unauthenticated


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------
class OcrError(Exception):
    """Base exception for all OCR errors."""
    pass


class OcrCredentialError(OcrError):
    """Raised when required credentials (e.g. for Google Vision) are missing or invalid."""
    pass


class OcrApiError(OcrError):
    """Raised when an OCR engine / API fails or encounters an internal execution error."""
    pass


class OcrInvalidInputError(OcrError):
    """Raised when the document input is empty, non-bytes, corrupted, or unsupported."""
    pass


class OcrResponseError(OcrError):
    """Raised when the OCR provider returns a malformed or unparseable response."""
    pass


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------
@dataclass
class OcrBlock:
    """
    One detected unit of text from the OCR provider with location and confidence.
    Retains page, text, bounding-box region, and confidence for provenance tracking.
    """
    text: str
    page: int
    region: str          # e.g. bounding-box coordinates or region id — used for provenance
    raw_confidence: float
    metadata: Dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Google Vision Client & Provider Logic
# ---------------------------------------------------------------------------
def get_vision_client() -> vision.ImageAnnotatorClient:
    """
    Initializes and returns a Google Cloud Vision ImageAnnotatorClient
    using GOOGLE_APPLICATION_CREDENTIALS.
    """
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not cred_path:
        raise OcrCredentialError(
            "GOOGLE_APPLICATION_CREDENTIALS environment variable is not set. "
            "Please specify the path to your Google Cloud service account JSON file."
        )

    normalized_path = os.path.abspath(cred_path) if not os.path.isabs(cred_path) else cred_path

    if not os.path.isfile(normalized_path):
        raise OcrCredentialError(
            f"Google Cloud credentials file not found at: '{cred_path}' (resolved to '{normalized_path}')"
        )

    try:
        return vision.ImageAnnotatorClient.from_service_account_json(normalized_path)
    except Exception as exc:
        raise OcrCredentialError(f"Failed to initialize Google Vision client from '{normalized_path}': {exc}") from exc


def _format_bounding_poly(vertices) -> str:
    """
    Formats bounding polygon vertices into a standardized region string for provenance.
    e.g. 'bbox:(10,20),(100,20),(100,80),(10,80)'
    """
    if not vertices:
        return "bbox:unknown"
    coords = [f"({int(getattr(v, 'x', 0))},{int(getattr(v, 'y', 0))})" for v in vertices]
    return f"bbox:{','.join(coords)}"


def _extract_with_google_vision(
    file_bytes: bytes,
    document_type: str = "document",
    language_hint: str = "en",
    client: Optional[vision.ImageAnnotatorClient] = None,
) -> List[OcrBlock]:
    """Runs OCR inference via Google Cloud Vision document_text_detection."""
    ocr_client = client or get_vision_client()

    try:
        image = vision.Image(content=bytes(file_bytes))
        image_context = vision.ImageContext()
        if language_hint:
            image_context.language_hints = [language_hint]

        response = ocr_client.document_text_detection(
            image=image,
            image_context=image_context,
        )
    except (PermissionDenied, Unauthenticated) as auth_err:
        raise OcrCredentialError(f"Google Cloud Vision authentication failed: {auth_err}") from auth_err
    except GoogleAPICallError as api_err:
        raise OcrApiError(f"Google Cloud Vision API call failed: {api_err}") from api_err
    except Exception as exc:
        raise OcrApiError(f"Unexpected error calling Google Cloud Vision API: {exc}") from exc

    if getattr(response, "error", None) and response.error.message:
        raise OcrApiError(f"Google Cloud Vision returned an error: {response.error.message} (code={response.error.code})")

    annotation = getattr(response, "full_text_annotation", None)
    if not annotation or not annotation.pages:
        return []

    ocr_blocks: List[OcrBlock] = []

    try:
        for page_idx, page in enumerate(annotation.pages, start=1):
            for block_idx, block in enumerate(page.blocks, start=1):
                paragraph_texts: List[str] = []
                word_confidences: List[float] = []

                for paragraph in block.paragraphs:
                    paragraph_words: List[str] = []
                    for word in paragraph.words:
                        word_text = "".join(getattr(s, "text", "") for s in getattr(word, "symbols", []))
                        if not word_text and hasattr(word, "text"):
                            word_text = word.text
                        if word_text:
                            paragraph_words.append(word_text)

                        word_conf = getattr(word, "confidence", None)
                        if word_conf is not None and word_conf > 0.0:
                            word_confidences.append(float(word_conf))

                    if paragraph_words:
                        paragraph_texts.append(" ".join(paragraph_words))

                block_text = "\n".join(paragraph_texts).strip()
                if not block_text:
                    continue

                block_conf = getattr(block, "confidence", None)
                if block_conf is not None and block_conf > 0.0:
                    raw_confidence = float(block_conf)
                elif word_confidences:
                    raw_confidence = sum(word_confidences) / len(word_confidences)
                else:
                    raw_confidence = 0.8

                raw_confidence = max(0.0, min(1.0, raw_confidence))

                vertices = getattr(getattr(block, "bounding_box", None), "vertices", [])
                region_str = _format_bounding_poly(vertices)
                if region_str == "bbox:unknown":
                    region_str = f"page:{page_idx}/block:{block_idx}"

                ocr_blocks.append(
                    OcrBlock(
                        text=block_text,
                        page=page_idx,
                        region=region_str,
                        raw_confidence=raw_confidence,
                        metadata={
                            "provider": "google_vision",
                            "document_type": document_type,
                            "block_index": block_idx,
                            "block_type": getattr(block, "block_type", None),
                        },
                    )
                )

        return ocr_blocks

    except Exception as exc:
        raise OcrResponseError(f"Failed to parse Google Cloud Vision response: {exc}") from exc


# ---------------------------------------------------------------------------
# PaddleOCR Client & Provider Logic (Local Zero-Cost)
# ---------------------------------------------------------------------------
_PADDLE_OCR_INSTANCE = None


def get_paddle_ocr_client(lang: str = "en"):
    """
    Returns a cached instance of PaddleOCR configured for CPU inference.
    Uses enable_mkldnn=False to ensure stable execution across Windows CPU architectures.
    """
    global _PADDLE_OCR_INSTANCE
    if _PADDLE_OCR_INSTANCE is None:
        try:
            from paddleocr import PaddleOCR
            _PADDLE_OCR_INSTANCE = PaddleOCR(
                use_textline_orientation=True,
                lang=lang,
                enable_mkldnn=False,
            )
        except Exception as exc:
            raise OcrApiError(f"Failed to initialize local PaddleOCR engine: {exc}") from exc
    return _PADDLE_OCR_INSTANCE


def _format_paddle_poly(poly) -> str:
    """
    Formats a 4-point polygon [[x1,y1],[x2,y2],[x3,y3],[x4,y4]] into:
    'bbox:(x1,y1),(x2,y2),(x3,y3),(x4,y4)'
    """
    try:
        points = poly.tolist() if hasattr(poly, "tolist") else list(poly)
        coords = [f"({int(pt[0])},{int(pt[1])})" for pt in points]
        return f"bbox:{','.join(coords)}"
    except Exception:
        return "bbox:unknown"


def _extract_with_paddleocr(
    file_bytes: bytes,
    document_type: str = "document",
    language_hint: str = "en",
    client: Optional[Any] = None,
) -> List[OcrBlock]:
    """
    Runs real OCR inference via local PaddleOCR.
    Processes image bytes, executes text detection and recognition,
    and returns OcrBlock items preserving full text, bounding boxes, and confidence.
    """
    # 1. Decode bytes to numpy images (handling both PDF and standard images)
    try:
        from PIL import Image
        import numpy as np

        images_np: List[Tuple[int, np.ndarray]] = []
        if file_bytes.startswith(b"%PDF") or b"%PDF" in file_bytes[:1024]:
            import pypdfium2 as pdfium

            pdf = pdfium.PdfDocument(file_bytes)
            for page_idx, page in enumerate(pdf, start=1):
                # Render page at 2x resolution (144 dpi) for high-accuracy OCR
                pil_page = page.render(scale=2).to_pil().convert("RGB")
                images_np.append((page_idx, np.array(pil_page)))
            pdf.close()
        else:
            pil_image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
            images_np.append((1, np.array(pil_image)))
    except Exception as exc:
        raise OcrInvalidInputError(f"Failed to decode document bytes as a valid image or PDF: {exc}") from exc

    if not images_np:
        return []

    # 2. Run inference across all pages
    ocr_engine = client or get_paddle_ocr_client(lang=language_hint or "en")
    ocr_blocks: List[OcrBlock] = []

    try:
        for page_idx, img_np in images_np:
            raw_results = ocr_engine.ocr(img_np)
            if not raw_results:
                continue

            for res_idx, page_res in enumerate(raw_results, start=1):
                if page_res is None:
                    continue

                # Support both PaddleOCR 3.x OCRResult / dict and older 2.x list format
                if isinstance(page_res, dict) or hasattr(page_res, "get"):
                    rec_texts = page_res.get("rec_texts", [])
                    rec_scores = page_res.get("rec_scores", [])
                    rec_polys = page_res.get("rec_polys", [])

                    for block_idx, (text, score) in enumerate(zip(rec_texts, rec_scores), start=1):
                        text_clean = str(text).strip()
                        if not text_clean:
                            continue

                        poly = rec_polys[block_idx - 1] if block_idx - 1 < len(rec_polys) else None
                        region_str = _format_paddle_poly(poly) if poly is not None else f"page:{page_idx}/block:{block_idx}"
                        confidence = max(0.0, min(1.0, float(score)))

                        ocr_blocks.append(
                            OcrBlock(
                                text=text_clean,
                                page=page_idx,
                                region=region_str,
                                raw_confidence=confidence,
                                metadata={
                                    "provider": "paddleocr",
                                    "document_type": document_type,
                                    "block_index": block_idx,
                                },
                            )
                        )

                elif isinstance(page_res, list):
                    # Older PaddleOCR format: list of [[ [x,y], ... ], (text, score)]
                    for block_idx, line in enumerate(page_res, start=1):
                        if not line or len(line) < 2:
                            continue
                        poly, (text, score) = line[0], line[1]
                        text_clean = str(text).strip()
                        if not text_clean:
                            continue

                        region_str = _format_paddle_poly(poly)
                        confidence = max(0.0, min(1.0, float(score)))

                        ocr_blocks.append(
                            OcrBlock(
                                text=text_clean,
                                page=page_idx,
                                region=region_str,
                                raw_confidence=confidence,
                                metadata={
                                    "provider": "paddleocr",
                                    "document_type": document_type,
                                    "block_index": block_idx,
                                },
                            )
                        )
                else:
                    raise OcrResponseError(f"Unexpected PaddleOCR page result type: {type(page_res).__name__}")

        return ocr_blocks

    except OcrResponseError:
        raise
    except Exception as exc:
        raise OcrApiError(f"PaddleOCR inference failed: {exc}") from exc



# ---------------------------------------------------------------------------
# Main Unified Entrypoint
# ---------------------------------------------------------------------------
def extract_text_blocks(
    file_bytes: bytes,
    document_type: str = "document",
    language_hint: str = "en",
    client: Optional[Any] = None,
    provider: Optional[str] = None,
) -> List[OcrBlock]:
    """
    Extracts structured text blocks from document bytes.

    Providers:
      - 'paddleocr' (default): Local zero-cost neural OCR engine
      - 'google_vision': Google Cloud Vision document_text_detection

    Preserves:
      - full extracted text
      - 1-based page number
      - bounding-box position for provenance linking
      - raw provider confidence (0.0 to 1.0)

    Does NOT create clinical entities (this is handled downstream by extraction.py).
    Raises typed OcrError subclasses on failure; does NOT silently return fake data.
    """
    if not file_bytes or (isinstance(file_bytes, (bytes, bytearray)) and len(file_bytes.strip()) == 0):
        raise OcrInvalidInputError("Cannot process empty document bytes.")

    if not isinstance(file_bytes, (bytes, bytearray)):
        raise OcrInvalidInputError(f"file_bytes must be bytes or bytearray, got {type(file_bytes).__name__}")

    chosen_provider = (provider or os.environ.get("OCR_PROVIDER", "paddleocr")).strip().lower()

    if chosen_provider in ("paddleocr", "paddle"):
        return _extract_with_paddleocr(
            file_bytes=bytes(file_bytes),
            document_type=document_type,
            language_hint=language_hint,
            client=client,
        )
    elif chosen_provider in ("google_vision", "google", "vision"):
        return _extract_with_google_vision(
            file_bytes=bytes(file_bytes),
            document_type=document_type,
            language_hint=language_hint,
            client=client,
        )
    else:
        raise OcrError(
            f"Unsupported OCR provider '{chosen_provider}'. Must be 'paddleocr' or 'google_vision'."
        )

