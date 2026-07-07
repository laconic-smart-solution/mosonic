"""Tests for POST /faqs/ask (vector RAG + LLM)."""

import uuid
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.faq import FaqAskResponse, FaqCitation
from app.services.faq_ask import RetrievedChunk, ask_faq

client = TestClient(app)


def _make_retrieved(text: str, distance: float = 0.2) -> RetrievedChunk:
    from app.db.models import FaqDocument, FaqDocumentChunk, FaqDocumentStatus

    doc = FaqDocument(
        filename="guide.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        file_size=100,
        uploaded_by="test",
        status=FaqDocumentStatus.completed,
    )
    doc.id = uuid.uuid4()
    chunk = FaqDocumentChunk(
        document_id=doc.id,
        chunk_index=0,
        text=text,
        embedding=[0.1] * 1536,
    )
    chunk.id = uuid.uuid4()
    return RetrievedChunk(chunk=chunk, document=doc, distance=distance)


def test_ask_no_match_when_no_chunks():
    db = MagicMock()
    with (
        patch("app.services.faq_ask.backfill_missing_embeddings"),
        patch("app.services.faq_ask._try_match_generated_faq", return_value=None),
        patch("app.services.faq_ask._retrieve_vector", return_value=[]),
    ):
        result = ask_faq(db, "quantum entanglement pricing model")

    assert result.source == "no_match"
    assert result.matched_sources == []


def test_ask_no_match_when_distance_too_high():
    db = MagicMock()
    with (
        patch("app.services.faq_ask.backfill_missing_embeddings"),
        patch("app.services.faq_ask._try_match_generated_faq", return_value=None),
        patch(
            "app.services.faq_ask._retrieve_vector",
            return_value=[_make_retrieved("unrelated text", distance=0.9)],
        ),
    ):
        result = ask_faq(db, "quantum entanglement")

    assert result.source == "no_match"


def test_ask_uses_llm_not_raw_chunk():
    db = MagicMock()
    retrieved = [_make_retrieved("Mosonic is an AI-powered platform for marketing.", 0.15)]
    llm_output = type(
        "AskLlmOutput",
        (),
        {
            "answer": "Mosonic is an AI-powered platform for marketing and social media.",
            "cited_chunk_indexes": [1],
        },
    )()

    with (
        patch("app.services.faq_ask.backfill_missing_embeddings"),
        patch("app.services.faq_ask._try_match_generated_faq", return_value=None),
        patch("app.services.faq_ask._retrieve_vector", return_value=retrieved),
        patch("app.services.faq_ask._answer_with_llm", return_value=llm_output),
    ):
        result = ask_faq(db, "What is Mosonic?")

    assert result.source == "llm"
    assert result.answer.startswith("Mosonic is an AI-powered")
    assert "AI-powered platform for marketing and social media" in result.answer
    assert len(result.matched_sources) == 1


def test_ask_uses_generated_faq_when_question_matches():
    from app.db.models import Faq, FaqDocument, FaqDocumentStatus

    db = MagicMock()
    doc = FaqDocument(
        filename="guide.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        file_size=100,
        uploaded_by="test",
        status=FaqDocumentStatus.completed,
    )
    doc.id = uuid.uuid4()
    faq = Faq(
        question="How do I create a new account on Mosonic?",
        answer="Go to the login page and click Create one.",
        source_document_id=doc.id,
        source_document=doc,
    )
    faq.id = uuid.uuid4()

    with (
        patch("app.services.faq_ask.backfill_missing_embeddings"),
        patch(
            "app.services.faq_ask._try_match_generated_faq",
            return_value=(faq, 0.08),
        ),
    ):
        result = ask_faq(db, "How can I create a new account on Mosonic?")

    assert result.source == "faq"
    assert "Create one" in result.answer
    assert result.confidence == 0.92


def test_ask_endpoint_returns_service_result():
    mock_response = FaqAskResponse(
        answer="Test answer",
        source="llm",
        confidence=0.85,
        matched_sources=[
            FaqCitation(
                document_id=uuid.uuid4(),
                filename="guide.docx",
                chunk_index=0,
                excerpt="Test excerpt",
            )
        ],
    )
    with patch("app.routers.faqs.ask_faq", return_value=mock_response):
        response = client.post("/faqs/ask", json={"question": "Q?"})

    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "llm"
    assert data["answer"] == "Test answer"


def test_ask_endpoint_requires_question():
    response = client.post("/faqs/ask", json={"question": ""})
    assert response.status_code == 422
