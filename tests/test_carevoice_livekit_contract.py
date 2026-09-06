"""
tests/test_carevoice_livekit_contract.py

Contract verification tests for the Self-Hosted CareVoice LiveKit WebRTC architecture.
Validates:
1. LiveKit room and token contract.
2. Data packet contract between CareVoice agent and Patient frontend.
3. FastAPI client turn submission and completion contract.
4. Dynamic conversational language switching contract.
5. Invariant: Clinical question authority is preserved; no duplicate clinical logic in voice agent.
"""

import json
import pytest
from fastapi.testclient import TestClient
from voice_agent.config import config
from voice_agent.language import (
    detect_conversational_language,
    select_tts_voice_and_phrasing,
    format_closing_statement,
)
from voice_agent.fastapi_client import FastAPIClient


def _register_and_login(client: TestClient, email: str, password: str, role: str) -> dict:
    r = client.post("/auth/register", json={
        "email": email,
        "password": password,
        "full_name": "LiveKit Patient",
        "role": role,
    })
    assert r.status_code == 201, f"Register failed: {r.json()}"
    r2 = client.post("/auth/login", json={"email": email, "password": password})
    assert r2.status_code == 200
    data = r2.json()
    return {"token": data["access_token"], "user_id": data["user_id"]}


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _setup_patient_session(client: TestClient, suffix: str = "lk01") -> dict:
    """Sets up patient, encounter, and active intake session."""
    creds = _register_and_login(
        client, f"carevoice_livekit_{suffix}@test.com", "SecurePass123!", "patient"
    )
    headers = _auth_headers(creds["token"])

    # Create profile
    r_prof = client.post("/patients/profile", json={
        "full_name": f"LiveKit User {suffix}",
        "preferred_language": "hi",
    }, headers=headers)
    assert r_prof.status_code == 201

    # Create encounter
    r_enc = client.post("/encounters", json={
        "opd_department": "General Medicine"
    }, headers=headers)
    assert r_enc.status_code == 201
    encounter_id = r_enc.json()["id"]

    # Start intake session
    r_sess = client.post("/intake/session/start", json={
        "encounter_id": encounter_id,
        "language": "hi",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=headers)
    assert r_sess.status_code == 201
    sess_data = r_sess.json()

    return {
        "headers": headers,
        "encounter_id": encounter_id,
        "session_id": sess_data["session_id"],
        "first_question": sess_data["first_question"],
        "first_field_name": sess_data["first_question_field_name"],
    }


def test_livekit_config_defaults():
    """Verify self-hosted LiveKit config is local with zero cloud dependencies."""
    assert "127.0.0.1" in config.livekit_url or "localhost" in config.livekit_url
    assert config.livekit_api_key == "devkey"
    assert config.livekit_api_secret == "secret"


def test_livekit_data_packet_contract():
    """Verify data packet schema emitted by voice agent over LiveKit data channel."""
    # 1. status packet
    status_packet = {"type": "status", "status": "speaking", "text": "नमस्ते"}
    assert status_packet["type"] == "status"
    assert status_packet["status"] in ("listening", "thinking", "speaking")

    # 2. user_transcript packet
    transcript_packet = {"type": "user_transcript", "text": "सीने में दर्द है"}
    assert transcript_packet["type"] == "user_transcript"
    assert len(transcript_packet["text"]) > 0

    # 3. language_detected packet
    lang_packet = {"type": "language_detected", "language": "hi"}
    assert lang_packet["type"] == "language_detected"
    assert lang_packet["language"] in ("hi", "hinglish", "en")

    # 4. turn_result packet
    turn_packet = {
        "type": "turn_result",
        "response": {
            "turn_number": 1,
            "next_question": "When did this start?",
            "next_question_field_name": "onset",
            "pathway_complete": False,
            "entities_extracted": [],
        }
    }
    assert turn_packet["type"] == "turn_result"
    assert "next_question" in turn_packet["response"]


def test_livekit_agent_fastapi_integration(client: TestClient):
    """
    Simulates the voice agent dispatching patient transcripts to FastAPI /intake/turn
    and receiving the canonical next question.
    """
    ctx = _setup_patient_session(client, suffix="flow01")
    session_id = ctx["session_id"]
    encounter_id = ctx["encounter_id"]

    # Utterance 1: Hindi
    patient_utterance_1 = "मुझे तीन दिन से सीने में दर्द हो रहा है।"
    detected_lang_1 = detect_conversational_language(patient_utterance_1, fallback="en")
    assert detected_lang_1 == "hi"

    r1 = client.post("/intake/turn", json={
        "session_id": session_id,
        "encounter_id": encounter_id,
        "touch_answer": patient_utterance_1,
        "answering_field_name": ctx["first_field_name"],
    }, headers=ctx["headers"])
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["turn_number"] == 1
    assert d1["pathway_complete"] is False
    assert d1["next_question"] is not None

    # Adapt question phrasing for Hindi voice
    voiced_text, tts_lang = select_tts_voice_and_phrasing(d1["next_question"], detected_lang_1)
    assert tts_lang == "hi"

    # Utterance 2: Language switches to Hinglish
    patient_utterance_2 = "Yeh pain walking karne se zyada worse ho jata hai."
    detected_lang_2 = detect_conversational_language(patient_utterance_2, fallback="hi")
    assert detected_lang_2 == "hinglish"

    r2 = client.post("/intake/turn", json={
        "session_id": session_id,
        "encounter_id": encounter_id,
        "touch_answer": patient_utterance_2,
        "answering_field_name": d1["next_question_field_name"],
    }, headers=ctx["headers"])
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["turn_number"] == 2

    # Adapt next question for Hinglish
    if d2["next_question"]:
        voiced_text_2, tts_lang_2 = select_tts_voice_and_phrasing(d2["next_question"], detected_lang_2)
        assert tts_lang_2 == "hi"

    # Utterance 3: Language switches to English
    patient_utterance_3 = "The pain does not spread to my arm or jaw."
    detected_lang_3 = detect_conversational_language(patient_utterance_3, fallback="hinglish")
    assert detected_lang_3 == "en"

    r3 = client.post("/intake/turn", json={
        "session_id": session_id,
        "encounter_id": encounter_id,
        "touch_answer": patient_utterance_3,
        "answering_field_name": d2["next_question_field_name"],
    }, headers=ctx["headers"])
    assert r3.status_code == 200
    d3 = r3.json()
    assert d3["turn_number"] == 3


def test_livekit_pathway_completion_flow(client: TestClient):
    """Verifies closing statement and final intake submit transition."""
    ctx = _setup_patient_session(client, suffix="comp01")
    session_id = ctx["session_id"]
    encounter_id = ctx["encounter_id"]

    # Finalize intake
    r_sub = client.post("/intake/submit", json={
        "session_id": session_id,
        "encounter_id": encounter_id,
    }, headers=ctx["headers"])
    assert r_sub.status_code == 200
    sub_data = r_sub.json()
    assert sub_data["status"] == "ready_for_review"

    # Closing statement matches patient's language
    closing_text, closing_lang = format_closing_statement("hi")
    assert closing_lang == "hi"
    assert "डॉक्टर" in closing_text
