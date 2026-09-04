"""
tests/conftest.py

Shared pytest fixtures for the PS47 test suite.

Key design choices:
  - Uses SQLite in-memory database -- no PostgreSQL required for tests.
  - Overrides DATABASE_URL via monkeypatching settings BEFORE the app imports
    the engine, so the test DB is used everywhere.
  - Each test function gets a function-scoped session that rolls back after
    the test, keeping tests isolated.
  - The TestClient's get_db dependency is overridden to use the same session.
  - All tests that don't opt out get automatic OCR + LLM mocks so that:
      * Dummy file bytes (e.g. b"fake-prescription-bytes") don't hit real APIs.
      * Normal test execution requires no API keys, internet access, or billing.
  - Tests marked @pytest.mark.live_ocr bypass the OCR mock.
  - Tests marked @pytest.mark.live_llm bypass the LLM mock.
  - Tests marked @pytest.mark.no_auto_ocr_mock bypass both mocks.
"""

import os
import pytest
from dotenv import load_dotenv

# -- Load project .env for live tests (e.g. LLM_API_KEY, LLM_PROVIDER, LLM_MODEL) -
load_dotenv()

# -- Set test env vars BEFORE any backend module is imported -----------------
# This must happen at module load time (not inside a fixture) so that
# pydantic-settings picks them up when Settings() is first constructed.
os.environ["DATABASE_URL"] = "sqlite:///./test_ps47.db"
os.environ["APP_ENV"] = "test"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-tests-only-not-real"


# -- Now import backend modules (they will read the env vars above) -----------
from sqlalchemy import create_engine                     # noqa: E402
from sqlalchemy.orm import sessionmaker, Session         # noqa: E402
from fastapi.testclient import TestClient                # noqa: E402

from backend.config import settings                      # noqa: E402
from backend.database import Base, get_db                # noqa: E402
from backend.main import app                             # noqa: E402

# Patch settings object in-process (belt-and-suspenders for pydantic-settings caching)
settings.database_url = "sqlite:///./test_ps47.db"
settings.app_env = "test"

# -- SQLite test engine ------------------------------------------------------
TEST_DATABASE_URL = "sqlite:///./test_ps47.db"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="session", autouse=True)
def create_test_tables():
    """Create all tables once per test session, drop them at the end."""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)
    if os.path.exists("test_ps47.db"):
        try:
            os.remove("test_ps47.db")
        except PermissionError:
            pass  # Windows may hold a lock; acceptable for dev


@pytest.fixture(scope="function")
def db() -> Session:
    """
    Function-scoped database session.
    Uses a savepoint so each test can rollback cleanly without dropping tables.
    """
    connection = test_engine.connect()
    transaction = connection.begin()
    session = TestSessionLocal(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(scope="function")
def client(db: Session) -> TestClient:
    """
    FastAPI TestClient with the get_db dependency overridden to use the
    per-test session (which rolls back after the test finishes).
    """
    def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def mock_vision_ocr_for_existing_tests(monkeypatch, request):
    """
    Ensures that existing tests with dummy file bytes do not make real Google API calls
    or real LLM provider calls.

    Bypass markers:
      @pytest.mark.no_auto_ocr_mock  -- bypass both OCR and LLM mocks
      @pytest.mark.live_ocr          -- bypass OCR mock only (LLM is still mocked)
      @pytest.mark.live_llm          -- bypass LLM mock only (OCR is still mocked)
      @pytest.mark.live_document_ai  -- bypass both mocks (full live pipeline)
    """
    is_no_mock = "no_auto_ocr_mock" in request.keywords
    is_live_doc = "live_document_ai" in request.keywords
    is_live_ocr = "live_ocr" in request.keywords or is_no_mock or is_live_doc
    is_live_llm = "live_llm" in request.keywords or is_no_mock or is_live_doc

    from ai_orchestration.services.ocr import OcrBlock

    class DummyVertex:
        def __init__(self, x, y):
            self.x = x
            self.y = y

    class DummyBoundingBox:
        def __init__(self, vertices):
            self.vertices = vertices

    class DummySymbol:
        def __init__(self, text):
            self.text = text

    class DummyWord:
        def __init__(self, text, confidence=0.9):
            self.symbols = [DummySymbol(ch) for ch in text]
            self.text = text
            self.confidence = confidence

    class DummyParagraph:
        def __init__(self, text, confidence=0.9):
            self.words = [DummyWord(w, confidence=confidence) for w in text.split()]

    class DummyBlock:
        def __init__(self, text, confidence=0.9, block_type=1, bbox=((10, 20), (100, 20), (100, 80), (10, 80))):
            self.paragraphs = [DummyParagraph(p, confidence=confidence) for p in text.split("\n")]
            self.confidence = confidence
            self.block_type = block_type
            self.bounding_box = DummyBoundingBox([DummyVertex(x, y) for x, y in bbox])

    class DummyPage:
        def __init__(self, blocks):
            self.blocks = blocks

    class DummyAnnotation:
        def __init__(self, pages):
            self.pages = pages

    class DummyResponse:
        def __init__(self, annotation, error=None):
            self.full_text_annotation = annotation
            self.error = error

    class MockVisionClient:
        def document_text_detection(self, image=None, image_context=None):
            # Inspect image bytes or content to provide realistic structured response
            content = getattr(image, "content", b"") if image else b""
            if not content:
                return DummyResponse(DummyAnnotation([]))

            content_str = str(content).lower()
            # If lab report
            if b"lab" in content or "lab" in content_str:
                blocks = [
                    DummyBlock("LDL Cholesterol: 142 mg/dL", confidence=0.92, bbox=((10, 10), (200, 10), (200, 40), (10, 40))),
                ]
            else:
                # Default/prescription: provides medication and date blocks
                blocks = [
                    DummyBlock("Tab. Atorvastatin 10mg OD", confidence=0.90, bbox=((10, 10), (300, 10), (300, 50), (10, 50))),
                    DummyBlock("Date: 12/06/2026", confidence=0.60, bbox=((10, 60), (150, 60), (150, 90), (10, 90))),
                ]

            return DummyResponse(DummyAnnotation([DummyPage(blocks)]))

    class MockPaddleOCRClient:
        def ocr(self, img_np):
            # Return PaddleOCR 3.x dict-like result structure
            return [{
                "rec_texts": ["Tab. Atorvastatin 10mg OD", "Date: 12/06/2026"],
                "rec_scores": [0.90, 0.60],
                "rec_polys": [
                    [[10, 10], [300, 10], [300, 50], [10, 50]],
                    [[10, 60], [150, 60], [150, 90], [10, 90]],
                ],
            }]

    # For existing test suites that upload dummy non-image bytes (e.g. b"fake-prescription-bytes"),
    # mock extract_text_blocks or mock the clients cleanly:
    def _mock_extract_text_blocks(file_bytes, document_type="document", language_hint="en", client=None, provider=None):
        if not file_bytes or (isinstance(file_bytes, (bytes, bytearray)) and len(file_bytes.strip()) == 0):
            from ai_orchestration.services.ocr import OcrInvalidInputError
            raise OcrInvalidInputError("Cannot process empty document bytes.")

        content_str = str(file_bytes).lower()
        if b"lab" in file_bytes or "lab" in content_str or document_type == "lab_report":
            return [
                OcrBlock(
                    text="LDL Cholesterol: 142 mg/dL",
                    page=1,
                    region="bbox:(10,10),(200,10),(200,40),(10,40)",
                    raw_confidence=0.92,
                    metadata={"document_type": document_type},
                )
            ]
        elif (
            b"no-med" in file_bytes
            or b"no_med" in file_bytes
            or (
                b"date:" in file_bytes.lower()
                and b"atorvastatin" not in file_bytes.lower()
                and b"tab" not in file_bytes.lower()
                and b"fake" not in file_bytes.lower()
                and b"bytes" not in file_bytes.lower()
            )
        ):
            return [
                OcrBlock(
                    text="Date: 12/06/2026",
                    page=1,
                    region="bbox:(10,60),(150,60),(150,90),(10,90)",
                    raw_confidence=0.60,
                    metadata={"document_type": document_type},
                ),
            ]
        else:
            return [
                OcrBlock(
                    text="Tab. Atorvastatin 10mg OD",
                    page=1,
                    region="bbox:(10,10),(300,10),(300,50),(10,50)",
                    raw_confidence=0.90,
                    metadata={"document_type": document_type},
                ),
                OcrBlock(
                    text="Date: 12/06/2026",
                    page=1,
                    region="bbox:(10,60),(150,60),(150,90),(10,90)",
                    raw_confidence=0.60,
                    metadata={"document_type": document_type},
                ),
            ]

    from ai_orchestration.services.llm import RawFieldGuess

    def _mock_extract_structured_fields(raw_text, expected_fields, client=None, provider=None, model=None):
        """
        Deterministic LLM mock for the normal test suite.
        Returns guesses based on OCR text content; respects expected_fields filtering.
        Does NOT fabricate fields not present in the text.
        """
        guesses = []
        lowered = raw_text.lower()

        # medication
        if "medication" in expected_fields:
            for keyword in ["atorvastatin", "amoxicillin", "tab.", "tablet"]:
                if keyword in lowered:
                    # Find the line containing the keyword
                    for line in raw_text.splitlines():
                        if keyword in line.lower():
                            guesses.append(RawFieldGuess(
                                field_name="medication",
                                value=line.strip(),
                                model_confidence=0.88,
                                evidence=line.strip(),
                            ))
                            break
                    break

        # date (keep model_confidence=0.55 so combined with OCR 0.60 it yields ~0.575, below 0.65 threshold)
        if "date" in expected_fields and "date:" in lowered:
            for line in raw_text.splitlines():
                if "date:" in line.lower():
                    value = line.split(":", 1)[-1].strip() if ":" in line else line.strip()
                    guesses.append(RawFieldGuess(
                        field_name="date",
                        value=value,
                        model_confidence=0.55,
                        evidence=line.strip(),
                    ))
                    break

        # test_result / lab report
        if "test_result" in expected_fields and "ldl" in lowered:
            for line in raw_text.splitlines():
                if "ldl" in line.lower():
                    guesses.append(RawFieldGuess(
                        field_name="test_result",
                        value=line.strip(),
                        model_confidence=0.90,
                        evidence=line.strip(),
                    ))
                    break

        # diagnosis
        if "diagnosis" in expected_fields and "diagnosis" in lowered:
            for line in raw_text.splitlines():
                if "diagnosis" in line.lower():
                    value = line.split(":", 1)[-1].strip() if ":" in line else line.strip()
                    guesses.append(RawFieldGuess(
                        field_name="diagnosis",
                        value=value,
                        model_confidence=0.85,
                        evidence=line.strip(),
                    ))
                    break

        # intake: chief_complaint
        if "chief_complaint" in expected_fields and "pain" in lowered:
            guesses.append(RawFieldGuess(
                field_name="chief_complaint",
                value="chest pain",
                model_confidence=0.80,
                evidence=raw_text[:80],
            ))

        # intake: onset
        if "onset" in expected_fields:
            import re
            match = re.search(r"for (\d+) days?", lowered)
            if match:
                guesses.append(RawFieldGuess(
                    field_name="onset",
                    value=match.group(0),
                    model_confidence=0.75,
                    evidence=match.group(0),
                ))

        return guesses

    # -- Apply OCR mocks (unless live_ocr) -----------------------------------
    if not is_live_ocr:
        monkeypatch.setattr(
            "ai_orchestration.services.ocr.extract_text_blocks",
            _mock_extract_text_blocks,
        )
        monkeypatch.setattr(
            "ai_orchestration.extraction.extract_text_blocks",
            _mock_extract_text_blocks,
        )
        monkeypatch.setattr(
            "backend.services.ocr.extract_text_blocks",
            _mock_extract_text_blocks,
        )
        monkeypatch.setattr(
            "ai_orchestration.services.ocr.get_vision_client",
            lambda: MockVisionClient(),
        )
        monkeypatch.setattr(
            "ai_orchestration.services.ocr.get_paddle_ocr_client",
            lambda lang="en": MockPaddleOCRClient(),
        )

    # -- Apply LLM mock (unless live_llm) ------------------------------------
    if not is_live_llm:
        monkeypatch.setattr(
            "ai_orchestration.services.llm.extract_structured_fields",
            _mock_extract_structured_fields,
        )
        monkeypatch.setattr(
            "ai_orchestration.extraction.extract_structured_fields",
            _mock_extract_structured_fields,
        )
