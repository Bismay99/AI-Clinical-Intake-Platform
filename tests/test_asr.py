"""
tests/test_asr.py

Offline unit tests for ASR service (Phase 4C).
100% offline -- exercises dataclasses, validation, error hierarchy, MIME detection,
code-switch detection, client factory, and mocked transcription with bounded retry.
"""

from unittest.mock import MagicMock, patch
import pytest

from ai_orchestration.services.asr import (
    AsrError,
    AsrInvalidAudioError,
    AsrConfigError,
    AsrApiError,
    AsrResponseError,
    TranscriptionResult,
    validate_audio_bytes,
    detect_audio_mime_type,
    detect_code_switching,
    get_asr_client,
    transcribe,
    _call_gemini_asr,
    MAX_AUDIO_BYTES,
)


# ---------------------------------------------------------------------------
# 1. Dataclass Contract Tests
# ---------------------------------------------------------------------------

class TestTranscriptionResultContract:
    def test_transcription_result_fields(self):
        res = TranscriptionResult(
            text="I have chest pain",
            language="en",
            detected_language="en-IN",
            raw_confidence=None,
            provider="gemini",
            model="gemini-3.5-transcribe",
            metadata={"sample_rate": 16000},
        )
        assert res.text == "I have chest pain"
        assert res.language == "en"
        assert res.detected_language == "en-IN"
        assert res.raw_confidence is None
        assert res.provider == "gemini"
        assert res.model == "gemini-3.5-transcribe"
        assert res.metadata == {"sample_rate": 16000}

    def test_raw_confidence_defaults_to_none(self):
        """Strictly verifies raw_confidence is not fabricated by default."""
        res = TranscriptionResult(text="fever", language="hi")
        assert res.raw_confidence is None

    def test_raw_confidence_preserves_explicit_value_when_available(self):
        res = TranscriptionResult(text="cough", language="en", raw_confidence=0.88)
        assert res.raw_confidence == 0.88


# ---------------------------------------------------------------------------
# 2. Exception Hierarchy Tests
# ---------------------------------------------------------------------------

class TestExceptionHierarchy:
    def test_asr_error_is_exception(self):
        assert issubclass(AsrError, Exception)

    def test_all_custom_errors_inherit_from_asr_error(self):
        for exc_cls in [
            AsrInvalidAudioError,
            AsrConfigError,
            AsrApiError,
            AsrResponseError,
        ]:
            assert issubclass(exc_cls, AsrError)
            assert issubclass(exc_cls, Exception)


# ---------------------------------------------------------------------------
# 3. Audio Validation Tests
# ---------------------------------------------------------------------------

class TestAudioValidation:
    def test_valid_audio_bytes_pass(self):
        sample = b"RIFF....WAVEfmt " + b"\x00" * 32
        validate_audio_bytes(sample)

    def test_rejects_non_bytes(self):
        with pytest.raises(AsrInvalidAudioError, match="must be bytes"):
            validate_audio_bytes("not bytes")

    def test_rejects_none(self):
        with pytest.raises(AsrInvalidAudioError, match="must be bytes"):
            validate_audio_bytes(None)

    def test_rejects_empty_bytes(self):
        with pytest.raises(AsrInvalidAudioError, match="cannot be empty"):
            validate_audio_bytes(b"")

    def test_rejects_too_short_bytes(self):
        with pytest.raises(AsrInvalidAudioError, match="too short"):
            validate_audio_bytes(b"123")

    def test_rejects_oversized_audio(self):
        oversized = b"A" * (MAX_AUDIO_BYTES + 1)
        with pytest.raises(AsrInvalidAudioError, match="exceeds maximum size"):
            validate_audio_bytes(oversized)


# ---------------------------------------------------------------------------
# 4. MIME Detection Tests
# ---------------------------------------------------------------------------

class TestMimeDetection:
    def test_detects_wav(self):
        data = b"RIFF\x24\x00\x00\x00WAVEfmt "
        assert detect_audio_mime_type(data) == "audio/wav"

    def test_detects_mp3_id3(self):
        data = b"ID3\x03\x00\x00\x00\x00\x00"
        assert detect_audio_mime_type(data) == "audio/mp3"

    def test_detects_mp3_sync_frame(self):
        data = b"\xff\xfb\x90\x44"
        assert detect_audio_mime_type(data) == "audio/mp3"

    def test_detects_ogg(self):
        data = b"OggS\x00\x02\x00"
        assert detect_audio_mime_type(data) == "audio/ogg"

    def test_detects_webm(self):
        data = b"\x1a\x45\xdf\xa3\x9f\x42"
        assert detect_audio_mime_type(data) == "audio/webm"

    def test_detects_flac(self):
        data = b"fLaC\x00\x00\x00"
        assert detect_audio_mime_type(data) == "audio/flac"

    def test_detects_m4a_ftyp(self):
        data = b"\x00\x00\x00\x20ftypM4A "
        assert detect_audio_mime_type(data) == "audio/mp4"

    def test_filename_hint_takes_precedence(self):
        assert detect_audio_mime_type(b"\x00"*20, filename_hint="voice.webm") == "audio/webm"
        assert detect_audio_mime_type(b"\x00"*20, filename_hint="audio.ogg") == "audio/ogg"
        assert detect_audio_mime_type(b"\x00"*20, filename_hint="rec.mp3") == "audio/mp3"

    def test_permissive_fallback_to_wav(self):
        """Browser audio without recognizable header defaults to audio/wav without rejecting."""
        data = b"\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f"
        assert detect_audio_mime_type(data) == "audio/wav"


# ---------------------------------------------------------------------------
# 5. Code-Switching & Language Detection Tests
# ---------------------------------------------------------------------------

class TestCodeSwitchDetection:
    def test_detects_devanagari_hindi(self):
        text = "मुझे तीन दिन से सीने में दर्द है।"
        assert detect_code_switching(text) == "hi"

    def test_detects_devanagari_plus_latin_as_mixed(self):
        text = "मुझे 2 days से chest pain हो रहा है"
        assert detect_code_switching(text) == "mixed"

    def test_detects_transliterated_hinglish_as_mixed(self):
        text = "Mujhe two days se chest mein pain ho raha hai"
        assert detect_code_switching(text) == "mixed"

    def test_plain_english_returns_none(self):
        text = "I have had chest pain for the last three days"
        assert detect_code_switching(text) is None


# ---------------------------------------------------------------------------
# 6. Client Factory Tests
# ---------------------------------------------------------------------------

class TestClientFactory:
    def test_unsupported_provider_raises_config_error(self):
        with pytest.raises(AsrConfigError, match="Unsupported ASR provider"):
            get_asr_client(provider="unsupported_provider")

    def test_missing_api_key_raises_config_error(self, monkeypatch):
        for k in ["ASR_API_KEY", "LLM_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"]:
            monkeypatch.delenv(k, raising=False)
        with pytest.raises(AsrConfigError, match="No API key found for Gemini ASR"):
            get_asr_client(provider="gemini")


# ---------------------------------------------------------------------------
# 7. Mocked Provider Call Tests (Retry, Fallback, Silence)
# ---------------------------------------------------------------------------

class TestMockedGeminiCall:
    def test_extracts_transcription_object_text(self):
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_part = MagicMock()
        mock_transcription = MagicMock()
        mock_transcription.text = "I have a mild fever"
        mock_transcription.language_code = "en-IN"
        mock_part.audio_transcription = mock_transcription
        mock_response.candidates = [MagicMock(content=MagicMock(parts=[mock_part]))]
        mock_response.text = None

        mock_client.models.generate_content.return_value = mock_response

        dummy_audio = b"RIFF....WAVE" + b"\x00" * 32
        res = _call_gemini_asr(
            client=mock_client,
            model="gemini-3.5-transcribe",
            audio_bytes=dummy_audio,
            mime_type="audio/wav",
            language_hint="en",
        )
        assert res.text == "I have a mild fever"
        assert res.detected_language == "en-IN"
        assert res.raw_confidence is None
        assert res.model == "gemini-3.5-transcribe"

    def test_fallback_to_response_text(self):
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.candidates = []
        mock_response.text = "Mujhe chest mein pain hai"

        mock_client.models.generate_content.return_value = mock_response

        dummy_audio = b"RIFF....WAVE" + b"\x00" * 32
        res = _call_gemini_asr(
            client=mock_client,
            model="gemini-3.8-flash",
            audio_bytes=dummy_audio,
            mime_type="audio/wav",
            language_hint="auto",
        )
        assert res.text == "Mujhe chest mein pain hai"
        assert res.detected_language == "mixed"

    def test_silence_cleans_to_empty_string(self):
        for silence_val in ["No speech", "[silence]", "NONE", "no speech detected."]:
            mock_client = MagicMock()
            mock_response = MagicMock()
            mock_response.candidates = []
            mock_response.text = silence_val
            mock_client.models.generate_content.return_value = mock_response

            dummy_audio = b"RIFF....WAVE" + b"\x00" * 32
            res = _call_gemini_asr(
                client=mock_client,
                model="gemini-3.5-transcribe",
                audio_bytes=dummy_audio,
                mime_type="audio/wav",
            )
            assert res.text == "", f"Expected empty text for silence indicator '{silence_val}'"

    def test_retry_on_transient_503_and_succeeds(self):
        mock_client = MagicMock()
        err_503 = Exception("503 UNAVAILABLE. Model experiencing high demand.")
        setattr(err_503, "status_code", 503)

        success_response = MagicMock()
        success_response.candidates = []
        success_response.text = "Recovered after retry"

        # First call raises 503, second call succeeds
        mock_client.models.generate_content.side_effect = [err_503, success_response]

        dummy_audio = b"RIFF....WAVE" + b"\x00" * 32
        with patch("time.sleep", return_value=None):
            res = _call_gemini_asr(
                client=mock_client,
                model="gemini-3.5-transcribe",
                audio_bytes=dummy_audio,
                mime_type="audio/wav",
            )
        assert res.text == "Recovered after retry"
        assert mock_client.models.generate_content.call_count == 2

    def test_permanent_400_error_fails_immediately_without_retry(self):
        mock_client = MagicMock()
        err_400 = Exception("400 INVALID_ARGUMENT. Bad request.")
        setattr(err_400, "status_code", 400)
        mock_client.models.generate_content.side_effect = err_400

        dummy_audio = b"RIFF....WAVE" + b"\x00" * 32
        with patch("time.sleep", return_value=None) as mock_sleep:
            with pytest.raises(AsrApiError, match="Gemini ASR API error"):
                _call_gemini_asr(
                    client=mock_client,
                    model="gemini-3.5-transcribe",
                    audio_bytes=dummy_audio,
                    mime_type="audio/wav",
                )
            assert mock_client.models.generate_content.call_count == 1
            mock_sleep.assert_not_called()
