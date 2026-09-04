"""
summary.py

Generates the physician-ready clinical summary (PRD Section 5 / Section 15).
Composed ONLY from evidence-linked, confidence-scored entities — never
free-standing AI prose treated as fact. Low-confidence fields are explicitly
labeled in the summary text rather than smoothed over.
"""

from typing import List
from .contracts import ExtractedEntity, SummaryRequest, SummaryResponse
from .services.llm import generate_summary_text
from .safety import assert_summary_inputs_are_safe


def build_summary(request: SummaryRequest) -> SummaryResponse:
    assert_summary_inputs_are_safe(request.entities)

    lines: List[str] = []
    used_fields: List[str] = []
    for entity in request.entities:
        flag = " [LOW CONFIDENCE — needs review]" if entity.low_confidence_flag else ""
        lines.append(f"{entity.field_name}: {entity.value}{flag}")
        used_fields.append(entity.field_name)

    summary_text = generate_summary_text(lines)
    return SummaryResponse(summary_text=summary_text, used_entity_fields=used_fields)
