"""
extraction.py

Ties together raw OCR/ASR text, LLM structured-field guesses, provenance,
and confidence scoring into draft ExtractedEntity objects.

This module is the main assembly point referenced in Architecture Section 4 --
it is deliberately the ONLY place that constructs an ExtractedEntity, so the
safety checks in safety.py have one funnel to validate rather than many.
"""

from typing import List, Optional
from .contracts import ExtractedEntity, VerificationStatus
from .services.ocr import extract_text_blocks, OcrBlock
from .services.llm import extract_structured_fields, RawFieldGuess
from .provenance import attach_document_provenance, attach_intake_provenance
from .confidence import combine_confidence, is_low_confidence
from .safety import validate_draft_batch


DOCUMENT_EXPECTED_FIELDS = {
    "prescription": [
        "patient_name",
        "date",
        "medication",
        "dose",
        "frequency",
        "duration",
    ],
    "lab_report": [
        "test_name",
        "result",
        "unit",
        "reference_range",
        "date",
        "test_result",
    ],
    "discharge_summary": [
        "diagnosis",
        "medication",
        "date",
    ],
}


def _find_best_block_for_guess(guess: RawFieldGuess, blocks: List[OcrBlock]) -> Optional[OcrBlock]:
    """
    Match a RawFieldGuess to the OcrBlock most likely to contain the evidence.

    Strategy (in priority order):
      1. If guess.evidence is set, find the block whose text contains the evidence snippet.
      2. If guess.value appears verbatim in a block, use that block.
      3. Fall back to the first block (guarantees provenance is always document-sourced).

    The LLM MUST NOT generate provenance data -- this function derives it from OCR blocks.
    """
    if not blocks:
        return None

    evidence = (guess.evidence or "").strip()
    value = (guess.value or "").strip()

    # Priority 1: evidence snippet match
    if evidence:
        for block in blocks:
            if evidence.lower() in block.text.lower():
                return block

    # Priority 2: value substring match
    if value:
        for block in blocks:
            if value.lower() in block.text.lower():
                return block

    # Priority 3: first block (fallback — preserves page-level provenance)
    return blocks[0]


def extract_from_document(document_id: str, document_type: str, file_bytes: bytes,
                           language_hint: str = "en") -> List[ExtractedEntity]:
    """
    Full document pipeline: OCR -> LLM extraction -> evidence matching -> provenance ->
    confidence -> safety validation. Returns UNREVIEWED draft entities only.

    The LLM is called once with the concatenated text of all OCR blocks.
    Provenance is then derived by matching each LLM guess back to OCR blocks --
    the LLM NEVER generates page numbers, bounding boxes, or coordinates.
    """
    blocks: List[OcrBlock] = extract_text_blocks(file_bytes, document_type, language_hint)
    expected_fields = DOCUMENT_EXPECTED_FIELDS.get(document_type, [])

    if not blocks:
        return []

    # Concatenate all OCR block texts (preserve order, separate by newline)
    combined_text = "\n".join(b.text for b in blocks if b.text.strip())

    # LLM extraction is called ONCE on the full document text
    guesses: List[RawFieldGuess] = extract_structured_fields(combined_text, expected_fields)

    entities: List[ExtractedEntity] = []
    for guess in guesses:
        # Match each LLM guess to the OcrBlock that contains the evidence
        best_block = _find_best_block_for_guess(guess, blocks)
        if best_block is None:
            continue  # should not happen since blocks is non-empty, but be safe

        ocr_confidence = best_block.raw_confidence
        confidence = combine_confidence(ocr_confidence, guess.model_confidence)
        source = attach_document_provenance(guess, document_id, best_block)
        entities.append(ExtractedEntity(
            field_name=guess.field_name,
            value=guess.value,
            confidence=confidence,
            source=source,
            low_confidence_flag=is_low_confidence(confidence),
            verification_status=VerificationStatus.UNREVIEWED,
        ))

    return validate_draft_batch(entities)


def extract_from_intake_turn(intake_session_id: str, turn_index: int, patient_text: str,
                              expected_fields: List[str],
                              asr_confidence: Optional[float] = None) -> List[ExtractedEntity]:
    """
    Same assembly pattern as extract_from_document, but sourced from a
    patient's spoken/typed intake turn instead of a scanned document.

    If asr_confidence is available, combine ASR confidence with model confidence.
    If asr_confidence is None, use model confidence alone (never fabricate ASR confidence).
    """
    guesses = extract_structured_fields(patient_text, expected_fields)

    entities: List[ExtractedEntity] = []
    for guess in guesses:
        if asr_confidence is not None:
            confidence = combine_confidence(asr_confidence, guess.model_confidence)
        else:
            confidence = combine_confidence(guess.model_confidence, guess.model_confidence)
        source = attach_intake_provenance(guess, intake_session_id, turn_index)
        entities.append(ExtractedEntity(
            field_name=guess.field_name,
            value=guess.value,
            confidence=confidence,
            source=source,
            low_confidence_flag=is_low_confidence(confidence),
            verification_status=VerificationStatus.UNREVIEWED,
        ))

    return validate_draft_batch(entities)
