"""
confidence.py

Confidence scoring and low-confidence flagging (PRD Section 7 / Section 15).
Ambiguous or low-quality extractions must be flagged, never silently
normalized into a confident-looking fact.
"""

LOW_CONFIDENCE_THRESHOLD = 0.65


def combine_confidence(source_confidence: float, model_confidence: float) -> float:
    """
    MVP heuristic: weight the upstream (OCR/ASR) signal and the model's own
    confidence equally. Replace with a calibrated approach once real
    provider confidence distributions are available.
    """
    combined = (source_confidence + model_confidence) / 2.0
    return max(0.0, min(1.0, combined))


def is_low_confidence(confidence: float) -> bool:
    return confidence < LOW_CONFIDENCE_THRESHOLD
