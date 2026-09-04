"""
provenance.py

Attaches a SourceRef to every raw field guess before it's allowed to become
an ExtractedEntity. This is the concrete implementation of PRD Section 9's
rule: "every extracted field is always linked to its source."
"""

from .contracts import SourceRef, SourceType
from .services.llm import RawFieldGuess
from .services.ocr import OcrBlock


def attach_document_provenance(guess: RawFieldGuess, document_id: str, block: OcrBlock) -> SourceRef:
    return SourceRef(
        source_type=SourceType.DOCUMENT,
        source_id=document_id,
        location=f"page:{block.page}/{block.region}",
    )


def attach_intake_provenance(guess: RawFieldGuess, intake_session_id: str, turn_index: int) -> SourceRef:
    return SourceRef(
        source_type=SourceType.INTAKE_SESSION,
        source_id=intake_session_id,
        location=f"turn:{turn_index}",
    )
