"""
question_engine.py

Adaptive next-question selection (PRD Section 8 / Architecture Section 4).
The LLM (services/llm.py) may be used to naturalize phrasing, but THIS module
decides which field is asked next — never the LLM freewheeling a conversation.

Tracking contract (per audit): which field a turn answers is carried
explicitly as IntakeTurn.field_name, set by brain.py from the prior
IntakeResponse.next_question_field_name. This module never reverse-engineers
a field from question text — that was a fragile MVP heuristic and has been
removed.
"""

from typing import List, Optional, Set
from .clinical_schema import ClinicalSchema, SchemaField, get_schema
from .contracts import IntakeTurn


def _answered_fields(history: List[IntakeTurn]) -> Set[str]:
    return {turn.field_name for turn in history if turn.field_name}


def _dependency_satisfied(field: SchemaField, answered: Set[str], history: List[IntakeTurn]) -> bool:
    if field.depends_on is None:
        return True
    if field.depends_on not in answered:
        return False
    if field.trigger_value is None:
        return True
    # Optional gating: only ask if the dependency's answer matched trigger_value.
    for turn in history:
        if turn.field_name == field.depends_on:
            return field.trigger_value.lower() in turn.patient_response_text.lower()
    return False


def _is_eligible(field: SchemaField, answered: Set[str], history: List[IntakeTurn]) -> bool:
    if field.field_name in answered:
        return False
    return _dependency_satisfied(field, answered, history)


def select_next_field(schema_id: str, history: List[IntakeTurn]) -> Optional[SchemaField]:
    """
    Returns the next SchemaField to ask about, or None if the pathway is
    complete. Pure function over (schema, history) — no side effects, no
    hidden state.
    """
    schema = get_schema(schema_id)
    answered = _answered_fields(history)

    for field in schema.fields:
        if _is_eligible(field, answered, history):
            return field

    return None  # pathway complete


def select_next_question(schema_id: str, history: List[IntakeTurn]) -> Optional[str]:
    field = select_next_field(schema_id, history)
    return field.prompt if field else None


def is_pathway_complete(schema_id: str, history: List[IntakeTurn]) -> bool:
    return select_next_field(schema_id, history) is None
