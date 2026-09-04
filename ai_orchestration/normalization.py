"""
normalization.py

The missing layer between raw ASR/touch input and structured extraction
(PRD Section 6: "ASR output must be normalized before being mapped into
clinical fields — raw transcription is not treated as a structured fact").

Pipeline this module implements:
    ASR text -----------\
                          >--- combine (voice + touch confirmation/correction)
    Touch text ----------/
            |
            v
    language normalization (cleanup, script/spelling normalization)
            |
            v
    clinical term mapping (colloquial/regional phrasing -> clinical terms)
            |
            v
    normalized_text  --> handed to extraction.py for schema-driven field extraction

This is intentionally rule-based and inspectable (a lookup table), NOT an
LLM freely rewriting the patient's statement — the LLM is still only used
downstream, inside services/llm.py, for structured-field extraction over
this already-normalized text.
"""

import re
from typing import Optional

# Small illustrative lookup — a production version would load a much larger,
# clinically-reviewed, multilingual glossary rather than a hard-coded dict.
_CLINICAL_TERM_MAP = {
    "seene mein dard": "chest pain",
    "pet mein dard": "abdominal pain",
    "bukhar": "fever",
    "khansi": "cough",
    "saans lene mein takleef": "shortness of breath",
    "3 din se": "for 3 days",
    "haan": "yes",
    "nahi": "no",
}


def combine_intake_input(voice_text: Optional[str], touch_text: Optional[str]) -> str:
    """
    Combines a voice answer with a touch confirmation/correction instead of
    letting one silently overwrite the other (PRD Section 3 / patient workflow
    step 8: patient may review/confirm extracted information).

    Example: patient says "haan, 3 din se" by voice, then confirms
    "Duration: 3 days" by touch -> both are preserved for extraction context,
    with the touch answer treated as the confirmed/corrected value.
    """
    voice_text = (voice_text or "").strip()
    touch_text = (touch_text or "").strip()

    if voice_text and touch_text:
        return f"{voice_text} (confirmed: {touch_text})"
    return touch_text or voice_text


def normalize_language(text: str) -> str:
    """
    Basic language-level cleanup: lowercasing, whitespace collapsing.
    Real Hindi/Hinglish normalization (script mixing, transliteration
    variance) belongs behind services/asr.py's provider or a dedicated
    normalization model — this stays intentionally simple as a scaffold.
    """
    cleaned = text.strip().lower()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def map_to_clinical_terms(text: str) -> str:
    """
    Maps known colloquial/regional phrases to clinical terminology before
    extraction. Longest-phrase-first so multi-word phrases aren't shadowed
    by shorter substrings.
    """
    result = text
    for phrase in sorted(_CLINICAL_TERM_MAP, key=len, reverse=True):
        if phrase in result:
            result = result.replace(phrase, _CLINICAL_TERM_MAP[phrase])
    return result


def normalize_intake_text(voice_text: Optional[str], touch_text: Optional[str]) -> str:
    """
    Full normalization pipeline entrypoint used by brain.py:
        combine -> language normalize -> clinical term mapping
    """
    combined = combine_intake_input(voice_text, touch_text)
    language_normalized = normalize_language(combined)
    clinically_mapped = map_to_clinical_terms(language_normalized)
    return clinically_mapped
