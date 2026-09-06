"""
voice_agent/language.py

Language detection and response language selection for CareVoice.

GUARDRAIL ENFORCED:
- Detects Hindi / English / Hinglish from the patient's latest meaningful utterance.
- Selects the appropriate response language.
- NEVER contains a duplicate clinical question engine or clinical decision logic.
- The canonical clinical question comes strictly from FastAPI.
"""

import re
from typing import Optional

# Devanagari Unicode Range: \u0900 - \u097F
_DEVANAGARI_REGEX = re.compile(r"[\u0900-\u097F]")
_LATIN_WORDS_REGEX = re.compile(r"[a-zA-Z]{2,}")

# Transliterated Hindi markers that do not overlap with common English words
_HINDI_UNAMBIGUOUS_MARKERS = {
    "mein", "se", "ko", "ka", "ki", "ke", "hai", "hain", "tha", "thi",
    "dard", "mahine", "saal", "ho", "raha", "rahi", "rahe", "kuch", "bohot",
    "bahut", "bhi", "aur", "mujhe", "mera", "meri", "mere", "hum",
    "kya", "kyun", "kab", "kahan", "nahi", "haan", "accha", "theek", "seene",
    "pet", "bukhar", "khansi", "saans", "takleef", "din", "pehle", "sirf",
    "lag", "batao", "bataiye", "karta", "karti", "karte", "hota", "hoti",
    "hote", "gaya", "gayi", "gaye", "aata", "aati", "aate", "dikkat", "pareshani",
    "zyada", "jyada", "kam", "chalte", "baithte", "subah", "shaam", "raat",
    "bata", "bolo", "boliye", "aaj", "kal", "parso", "ghat",
}

# Overlapping tokens (e.g. Hindi 'the' [were] vs English 'the')
_HINDI_AMBIGUOUS_MARKERS = {"the", "par", "badh"}

_ENGLISH_WORDS_IN_HINGLISH = {
    "chest", "pain", "days", "hours", "fever", "cough", "doctor", "medicine",
    "tablet", "problem", "issue", "hospital", "report", "test", "headache",
    "severe", "mild", "start", "started", "worse", "better", "walking",
    "resting", "breath", "breathing", "shortness", "sweating", "nausea",
    "vomiting", "stomach", "back", "arm", "jaw", "left", "right", "side",
    "activity", "heavy", "heaviness", "bp", "sugar", "heart", "attack",
    "gas", "acidity", "relief", "normal", "high", "low",
}

def detect_conversational_language(text: str, fallback: str = "en") -> str:
    """
    Determines the patient's conversational language from their latest utterance.
    Deterministic rules:
    - Mostly Devanagari Hindi -> 'hi'
    - Mostly Latin English -> 'en'
    - Natural mixture of Hindi + English -> 'hinglish'

    Returns: 'hi', 'hinglish', or 'en'.
    """
    if not text or not text.strip():
        return fallback

    trimmed = text.strip()
    devanagari_chars = len(_DEVANAGARI_REGEX.findall(trimmed))
    latin_chars = len(re.findall(r"[a-zA-Z]", trimmed))
    latin_words = [w.lower() for w in _LATIN_WORDS_REGEX.findall(trimmed)]

    # 1. Mostly Devanagari Hindi
    if devanagari_chars > 0 and devanagari_chars >= latin_chars:
        # Check if user intentionally used English medical words inside their Hindi speech
        # (e.g. 'चलने फिरने से pain बढ़ जाता है')
        # We split by sentence boundaries to avoid false positives if Whisper appends a translation
        parts = re.split(r"[।\.\n]", trimmed)
        first_part = parts[0]
        first_part_latin_words = [w.lower() for w in _LATIN_WORDS_REGEX.findall(first_part)]
        embedded_english = [w for w in first_part_latin_words if w in _ENGLISH_WORDS_IN_HINGLISH]

        if embedded_english:
            return "hinglish"
        return "hi"

    # 2. Latin script text
    unambiguous_hindi = sum(1 for w in latin_words if w in _HINDI_UNAMBIGUOUS_MARKERS)
    ambiguous_hindi = sum(1 for w in latin_words if w in _HINDI_AMBIGUOUS_MARKERS)
    hindi_markers = unambiguous_hindi + (ambiguous_hindi if unambiguous_hindi > 0 else 0)

    if hindi_markers >= 1:
        return "hinglish"

    # 3. Standard English without Hindi markers
    if latin_chars > 0:
        return "en"

    return fallback


def select_tts_voice_and_phrasing(canonical_question: str, detected_lang: str) -> tuple[str, str]:
    """
    Selects the TTS voice language ('hi' or 'en') and adapts phrasing to match
    the patient's active conversational language, preserving English medical terms
    for Hinglish without modifying clinical intent.

    Returns:
        (voiced_text, tts_language_key)
    """
    # Known canonical translations for natural hospital flow
    TRANSLATIONS = {
        "What brings you in today?": {
            "hi": "नमस्ते, आज आपको क्या तकलीफ है या किस वजह से अस्पताल आना हुआ?",
            "hinglish": "नमस्ते, आज आपको क्या प्रॉब्लम या तकलीफ हो रही है?",
            "en": "Hello, what brings you in today?",
        },
        "When did this start?": {
            "hi": "समझ गई। यह दर्द या परेशानी कब से शुरू हुई?",
            "hinglish": "समझ गई। यह दर्द या प्रॉब्लम कब से शुरू हुई?",
            "en": "I understand. When did this start?",
        },
        "Does it get worse with activity?": {
            "hi": "क्या चलने-फिरने या मेहनत का काम करने से यह दर्द और बढ़ जाता है?",
            "hinglish": "क्या कोई एक्टिविटी करने या चलने-फिरने से यह दर्द बढ़ जाता है?",
            "en": "Does it get worse with activity?",
        },
        "Does the pain spread anywhere else, like your arm or jaw?": {
            "hi": "क्या यह दर्द कहीं और भी फैलता है, जैसे आपके हाथ, कंधे या जबड़े में?",
            "hinglish": "क्या यह दर्द कहीं और फैलता है, जैसे आपके आर्म या जबड़े में?",
            "en": "Does the pain spread anywhere else, like your arm or jaw?",
        },
        "Any shortness of breath, sweating, or nausea with it?": {
            "hi": "क्या इसके साथ सांस फूलना, बहुत पसीना आना, या जी मिचलाना जैसी कोई तकलीफ है?",
            "hinglish": "क्या इसके साथ सांस फूलना, स्वेटिंग, या जी मिचलाना महसूस होता है?",
            "en": "Any shortness of breath, sweating, or nausea with it?",
        },
    }

    phrasings = TRANSLATIONS.get(canonical_question.strip())
    if phrasings:
        if detected_lang == "hi":
            return phrasings["hi"], "hi"
        elif detected_lang == "hinglish":
            return phrasings["hinglish"], "hi"  # Piper Hindi model reads Devanagari/Hinglish accurately
        else:
            return phrasings["en"], "en"

    # Dynamic fallback: if an unmapped question comes from backend, preserve question
    if detected_lang in ("hi", "hinglish"):
        return canonical_question, "hi"
    return canonical_question, "en"


def format_closing_statement(detected_lang: str) -> tuple[str, str]:
    """Returns the hospital-appropriate pathway completion statement."""
    if detected_lang == "hi":
        return "आपकी सभी जानकारियां दर्ज कर ली गई हैं और डॉक्टर के रिव्यू के लिए तैयार हैं। धन्यवाद।", "hi"
    elif detected_lang == "hinglish":
        return "आपकी सभी जानकारियां नोट कर ली गई हैं और डॉक्टर के रिव्यू के लिए तैयार हैं। थैंक यू।", "hi"
    return "Your information has been recorded and is ready for doctor review. Thank you.", "en"
