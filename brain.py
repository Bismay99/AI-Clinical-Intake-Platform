"""
brain.py

THE AI Orchestration Service entrypoint for PS 47.

This is the single boundary the Core Backend talks to (per
PS47_System_Architecture.md, Sections 3.5 and 4). It routes each request to
the right pipeline stage and enforces call order — it never lets a stage
skip provenance/confidence tagging, and it never marks anything "final."

Responsibilities implemented here, per PRD Sections 5-15:
    - Adaptive intake turn handling (ASR -> question_engine -> draft entities)
    - Document processing (OCR -> extraction -> provenance -> confidence)
    - Timeline construction
    - Clinical summary generation
    - Safety validation on every draft leaving this service

brain.py has NO direct database access. It is a pure request/response
orchestrator. Persistence and verification-state transitions belong
exclusively to the Core Backend (see backend/verification.py in the
architecture doc).
"""

from typing import List

from .contracts import (
    IntakeRequest, IntakeResponse, IntakeTurn,
    DocumentRequest, DocumentResponse,
    SummaryRequest, SummaryResponse,
    ExtractedEntity, TimelineEvent,
)
from .services.asr import transcribe
from .question_engine import select_next_field, is_pathway_complete
from .clinical_schema import get_schema
from .normalization import normalize_intake_text
from .extraction import extract_from_document, extract_from_intake_turn
from .timeline import build_timeline
from .summary import build_summary
from .safety import validate_draft_batch


def handle_intake_turn(request: IntakeRequest) -> IntakeResponse:
    """
    Handles one turn of the adaptive patient intake conversation.

    Flow (PRD Section 5, corrected per audit):
        voice text + touch confirmation
            -> combine (normalization.combine_intake_input)
            -> language normalization
            -> clinical term mapping
            -> schema-driven extraction (expected fields come from the
               ACTIVE schema, never a hard-coded list — this is what makes
               allopathic <-> AYUSH a config change, not a code change)
            -> adaptive question selection, tracked by field_name (not by
               re-matching question text — see question_engine.py)

    Field tracking contract: request.answering_field_name tells this turn
    which schema field the incoming answer responds to. It comes from the
    PRIOR call's IntakeResponse.next_question_field_name. The caller (Core
    Backend) is responsible for round-tripping that value; brain.py never
    guesses it from question text.
    """
    voice_text = None
    if request.audio_bytes:
        voice_text = transcribe(request.audio_bytes, request.language).text

    # Voice and touch are combined, not one silently overwriting the other —
    # e.g. patient says "haan, 3 din se" then confirms "Duration: 3 days".
    normalized_text = normalize_intake_text(voice_text, request.touch_answer)

    schema = get_schema(request.schema_id)  # expected fields always come from the schema

    turn_index = len(request.history)
    draft_entities: List[ExtractedEntity] = []
    if normalized_text:
        draft_entities = extract_from_intake_turn(
            intake_session_id=request.encounter_id,
            turn_index=turn_index,
            patient_text=normalized_text,
            expected_fields=schema.required_fields,
        )

    updated_history = request.history + [
        IntakeTurn(
            question=request.history[-1].question if request.history else "",
            patient_response_text=normalized_text,
            language=request.language,
            field_name=request.answering_field_name,
        )
    ] if normalized_text else request.history

    next_field = select_next_field(request.schema_id, updated_history)
    complete = next_field is None

    return IntakeResponse(
        next_question=next_field.prompt if next_field else None,
        next_question_field_name=next_field.field_name if next_field else None,
        draft_entities=validate_draft_batch(draft_entities),
        pathway_complete=complete,
    )


def handle_document(request: DocumentRequest) -> DocumentResponse:
    """
    Handles one uploaded/scanned document.

    Explicit pipeline (per audit — every stage below is visible here, not
    just buried inside extraction.py, so the Core Backend/reviewers can see
    the full chain a document goes through before anything is returned):

        OCR -> extraction -> normalization -> provenance validation
            -> confidence validation -> safety validation -> return draft

    extract_from_document() already performs OCR, structured extraction,
    provenance attachment, and confidence scoring internally (see
    extraction.py). The explicit validate_draft_batch() call below is a
    deliberate, idempotent second gate: nothing leaves this function without
    every entity re-confirmed to carry a source_ref and a valid confidence
    score, per PRD Section 15's non-negotiable safety rule.
    """
    entities = extract_from_document(
        document_id=request.document_id,
        document_type=request.document_type,
        file_bytes=request.file_bytes,
        language_hint=request.language_hint or "en",
    )
    validated_entities = validate_draft_batch(entities)  # explicit safety gate, not implicit
    return DocumentResponse(draft_entities=validated_entities)


def handle_timeline(entities: List[ExtractedEntity]) -> List[TimelineEvent]:
    """
    Builds the chronological timeline from a set of already-extracted entities
    (PRD Section 10). Pure pass-through to timeline.py, kept here so the Core
    Backend has one entrypoint module to call regardless of pipeline stage.
    """
    return build_timeline(entities)


def handle_summary(request: SummaryRequest) -> SummaryResponse:
    """
    Generates the physician-ready summary (PRD Section 5 / Section 15).
    Will raise safety.SafetyViolation if any input entity lacks provenance
    or confidence — this is intentional; a summary must never be built on
    unverifiable input.
    """
    return build_summary(request)


def is_intake_pathway_complete(schema_id: str, history: List[IntakeTurn]) -> bool:
    return is_pathway_complete(schema_id, history)


# ---------------------------------------------------------------------------
# Minimal runnable demo — exercises the full pipeline end to end with the
# placeholder providers, so the scaffold is verifiable before real ASR/OCR/LLM
# integrations are wired in. Mirrors the PRD's Ramesh Kumar demo scenario.
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=== PS47 brain.py — pipeline smoke test ===\n")

    # 1. Document processing (prescription)
    doc_response = handle_document(DocumentRequest(
        encounter_id="enc_001",
        document_id="doc_prescription_001",
        document_type="prescription",
        file_bytes=b"fake-scanned-bytes",
    ))
    print("Draft entities from prescription:")
    for e in doc_response.draft_entities:
        flag = " (LOW CONFIDENCE)" if e.low_confidence_flag else ""
        print(f"  - {e.field_name}: {e.value} [conf={e.confidence:.2f}]{flag} "
              f"source={e.source.source_type.value}:{e.source.source_id}:{e.source.location}")

    # 2. Timeline construction
    timeline = handle_timeline(doc_response.draft_entities)
    print("\nTimeline:")
    for ev in timeline:
        uncertainty = " (UNCERTAIN DATE)" if ev.date_uncertain else ""
        print(f"  - {ev.event_type} on {ev.date}{uncertainty}")

    # 3. Summary generation
    summary = handle_summary(SummaryRequest(
        encounter_id="enc_001",
        entities=doc_response.draft_entities,
        timeline=timeline,
    ))
    print("\nGenerated summary:\n" + summary.summary_text)

    # 4. Adaptive intake turn (allopathic chest-pain pathway) — Hinglish voice
    #    input combined with a touch confirmation, exercising the
    #    normalization layer AND field_name-based question tracking end to end.
    intake_req = IntakeRequest(
        encounter_id="enc_001",
        schema_id="allopathic_chest_pain_v1",
        language="hi",
        touch_answer="for 3 days",
        history=[],
        answering_field_name="chief_complaint",  # answering the pathway's first field
    )
    # Simulate ASR having transcribed "seene mein dard, 3 din se" from audio.
    # (Patches the module-global `transcribe` name that handle_intake_turn
    # actually calls — patching services.asr.transcribe alone does NOT work
    # here because `from .services.asr import transcribe` already bound a
    # separate reference in this module's namespace.)
    global transcribe
    _original_transcribe = transcribe
    from .services.asr import TranscriptionResult as _TranscriptionResult
    transcribe = lambda audio_bytes, language_hint: _TranscriptionResult(
        text="seene mein dard, 3 din se", language=language_hint, raw_confidence=0.8,
    )
    intake_req.audio_bytes = b"fake-audio-bytes"
    intake_resp = handle_intake_turn(intake_req)
    transcribe = _original_transcribe  # restore

    print("\nIntake turn 1 (Hinglish voice + touch confirmation, answering 'chief_complaint'):")
    for e in intake_resp.draft_entities:
        print(f"  - {e.field_name}: {e.value} [conf={e.confidence:.2f}] "
              f"source={e.source.source_type.value}:{e.source.location}")
    print(f"Next question: {intake_resp.next_question}  (field_name={intake_resp.next_question_field_name})")

    # 4b. Second turn — proves field_name tracking actually advances the
    #     pathway (not text-matching): we answer whatever field_name the
    #     PRIOR response said was next, without needing to know its prompt text.
    intake_req_2 = IntakeRequest(
        encounter_id="enc_001",
        schema_id="allopathic_chest_pain_v1",
        language="en",
        touch_answer="Yes, it gets worse when I walk",
        history=[IntakeTurn(
            question=intake_req.touch_answer,  # not actually used for matching anymore
            patient_response_text="chest pain, for 3 days (confirmed: for 3 days)",
            language="hi",
            field_name="chief_complaint",
        )],
        answering_field_name=intake_resp.next_question_field_name,  # e.g. "onset"
    )
    intake_resp_2 = handle_intake_turn(intake_req_2)
    print(f"\nIntake turn 2 (answering '{intake_req_2.answering_field_name}'):")
    for e in intake_resp_2.draft_entities:
        print(f"  - {e.field_name}: {e.value} [conf={e.confidence:.2f}]")
    print(f"Next question: {intake_resp_2.next_question}  (field_name={intake_resp_2.next_question_field_name})")
    print(f"Pathway complete: {intake_resp_2.pathway_complete}")

    # 5. Schema-switch proof: same pipeline, AYUSH schema instead of allopathic.
    #    Also proves Samprapti is now present in the schema's full field list.
    ayush_req = IntakeRequest(
        encounter_id="enc_002",
        schema_id="ayush_general_v1",
        language="en",
        touch_answer="I have a mild fever",
        history=[],
        answering_field_name="chief_complaint",
    )
    ayush_resp = handle_intake_turn(ayush_req)
    print(f"\nAYUSH schema required_fields: {get_schema('ayush_general_v1').required_fields}")
    print(f"\nAYUSH schema next question: {ayush_resp.next_question}")
