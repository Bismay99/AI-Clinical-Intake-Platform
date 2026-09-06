"""
tests/test_voice_agent_language.py

Unit tests for CareVoice language detection, TTS voice selection,
and conversational phrasing without violating clinical boundaries.
"""

import pytest
from voice_agent.language import (
    detect_conversational_language,
    select_tts_voice_and_phrasing,
    format_closing_statement,
)


def test_detect_pure_hindi():
    # Pure Devanagari Hindi utterances
    assert detect_conversational_language("मुझे तीन दिन से सीने में दर्द हो रहा है।") == "hi"
    assert detect_conversational_language("जी हां, चलने पर सांस फूलती है।") == "hi"
    assert detect_conversational_language("कल रात से बुखार बहुत तेज है।") == "hi"


def test_detect_hinglish():
    # Roman script Indian Hinglish
    assert detect_conversational_language("Mujhe 3 days se chest mein pain ho raha hai.") == "hinglish"
    assert detect_conversational_language("Doctor saab, chalne pe breathing problem hoti hai.") == "hinglish"
    assert detect_conversational_language("Yeh pain left arm mein bhi radiate hota hai.") == "hinglish"
    assert detect_conversational_language("Nahi koi fever nahi hai.") == "hinglish"


def test_detect_english():
    # Pure English clinical utterances
    assert detect_conversational_language("I have had severe chest pain for three days.") == "en"
    assert detect_conversational_language("The pain gets worse whenever I walk up stairs.") == "en"
    assert detect_conversational_language("No nausea or shortness of breath.") == "en"


def test_fallback_on_empty():
    assert detect_conversational_language("", fallback="hi") == "hi"
    assert detect_conversational_language("   ", fallback="en") == "en"


def test_select_tts_voice_and_phrasing_hindi():
    canonical = "What brings you in today?"
    spoken, lang = select_tts_voice_and_phrasing(canonical, "hi")
    assert lang == "hi"
    assert "तकलीफ" in spoken or "अस्पताल" in spoken


def test_select_tts_voice_and_phrasing_hinglish():
    canonical = "When did this start?"
    spoken, lang = select_tts_voice_and_phrasing(canonical, "hinglish")
    assert lang == "hi"  # Synthesized with Hindi voice model for natural Indian accent
    assert "प्रॉब्लम" in spoken or "start" in spoken.lower()


def test_select_tts_voice_and_phrasing_english():
    canonical = "What brings you in today?"
    spoken, lang = select_tts_voice_and_phrasing(canonical, "en")
    assert lang == "en"
    assert "what brings you in today?" in spoken.lower()


def test_format_closing_statement():
    hi_text, hi_lang = format_closing_statement("hi")
    assert hi_lang == "hi"
    assert "डॉक्टर" in hi_text

    hinglish_text, hinglish_lang = format_closing_statement("hinglish")
    assert hinglish_lang == "hi"
    assert "रिव्यू" in hinglish_text or "review" in hinglish_text.lower()

    en_text, en_lang = format_closing_statement("en")
    assert en_lang == "en"
    assert "doctor" in en_text.lower()
