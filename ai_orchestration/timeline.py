"""
timeline.py

Normalizes dates and event types from extracted entities into a chronological
timeline (PRD Section 10). Uncertain dates stay explicitly marked as
uncertain rather than being guessed into a fixed date.
"""

import re
from datetime import datetime
from typing import List, Optional
from .contracts import ExtractedEntity, TimelineEvent

DATE_FIELD_NAMES = {"date"}
EVENT_TYPE_BY_FIELD = {
    "medication": "medication",
    "test_result": "investigation",
    "diagnosis": "diagnosis",
}

_DATE_PATTERNS = [
    "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d",
]


def _try_parse_date(raw: str) -> Optional[str]:
    for pattern in _DATE_PATTERNS:
        try:
            return datetime.strptime(raw.strip(), pattern).date().isoformat()
        except ValueError:
            continue
    return None


def build_timeline(entities: List[ExtractedEntity]) -> List[TimelineEvent]:
    """
    Pairs date-bearing entities with adjacent clinical entities from the
    same source document/session. MVP heuristic: same source_id => same event.
    A production version would group more precisely using document structure.
    """
    events: List[TimelineEvent] = []

    dated_by_source = {
        e.source.source_id: e for e in entities if e.field_name in DATE_FIELD_NAMES
    }

    for entity in entities:
        event_type = EVENT_TYPE_BY_FIELD.get(entity.field_name)
        if not event_type:
            continue

        date_entity = dated_by_source.get(entity.source.source_id)
        if date_entity is None:
            events.append(TimelineEvent(
                event_type=event_type, date=None, date_confidence=0.0,
                date_uncertain=True, source_entity_field=entity.field_name,
            ))
            continue

        parsed = _try_parse_date(date_entity.value)
        uncertain = parsed is None or date_entity.low_confidence_flag
        events.append(TimelineEvent(
            event_type=event_type,
            date=parsed,
            date_confidence=date_entity.confidence,
            date_uncertain=uncertain,
            source_entity_field=entity.field_name,
        ))

    # Sort resolvable dates chronologically; push uncertain-date events to the end.
    events.sort(key=lambda e: (e.date is None, e.date or ""))
    return events
