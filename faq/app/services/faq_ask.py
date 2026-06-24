import math
from dataclasses import dataclass

from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config import get_settings
from app.db.models import Faq, FaqDocument, FaqDocumentChunk, FaqDocumentStatus
from app.schemas.faq import FaqAskResponse, FaqCitation
from app.services.document_embeddings import (
    backfill_missing_embeddings,
    embed_query,
    embed_texts,
)

NO_MATCH_MESSAGE = (
    "I couldn't find an answer to that in our documentation. "
    "Try rephrasing your question or contact support."
)

ASK_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You answer user questions using ONLY the document excerpts provided. "
            "When the excerpts include numbered steps or procedures, include those steps in your answer. "
            "Write clearly and concisely. Do NOT paste or quote excerpt text verbatim. "
            "If the excerpts truly lack the requested information, say you don't know.",
        ),
        (
            "human",
            "User question: {question}\n\nDocument excerpts:\n{chunk_context}",
        ),
    ]
)


class AskLlmOutput(BaseModel):
    answer: str = Field(min_length=1)
    cited_chunk_indexes: list[int] = Field(default_factory=list)


@dataclass
class RetrievedChunk:
    chunk: FaqDocumentChunk
    document: FaqDocument
    distance: float


def _cosine_distance(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        return 1.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 1.0
    similarity = dot / (norm_a * norm_b)
    return 1.0 - similarity


def _truncate(text: str, max_chars: int) -> str:
    text = text.strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3].rstrip() + "..."


def _to_citation(chunk: FaqDocumentChunk, document: FaqDocument, max_chars: int) -> FaqCitation:
    return FaqCitation(
        document_id=document.id,
        filename=document.filename,
        chunk_index=chunk.chunk_index,
        excerpt=_truncate(chunk.text, max_chars),
    )


def _try_match_generated_faq(db: Session, question: str) -> tuple[Faq, float] | None:
    settings = get_settings()
    faqs = list(
        db.scalars(
            select(Faq)
            .where(Faq.is_active.is_(True))
            .options(joinedload(Faq.source_document))
        ).all()
    )
    if not faqs:
        return None

    query_vec = embed_query(question)
    vectors = embed_texts([faq.question for faq in faqs])

    best_faq: Faq | None = None
    best_distance = 1.0
    for faq, vector in zip(faqs, vectors, strict=True):
        distance = _cosine_distance(query_vec, vector)
        if distance < best_distance:
            best_distance = distance
            best_faq = faq

    if best_faq is None or best_distance > settings.faq_ask_faq_match_max_distance:
        return None
    return best_faq, best_distance


def _retrieve_vector(
    db: Session,
    question: str,
    top_k: int,
) -> list[RetrievedChunk]:
    query_vec = embed_query(question)

    stmt = (
        select(FaqDocumentChunk, FaqDocument)
        .join(FaqDocument, FaqDocumentChunk.document_id == FaqDocument.id)
        .where(FaqDocument.status == FaqDocumentStatus.completed)
        .where(FaqDocumentChunk.embedding.isnot(None))
    )
    rows = db.execute(stmt).all()

    scored: list[RetrievedChunk] = []
    for chunk, doc in rows:
        if not chunk.embedding:
            continue
        distance = _cosine_distance(query_vec, chunk.embedding)
        scored.append(RetrievedChunk(chunk=chunk, document=doc, distance=distance))

    scored.sort(key=lambda item: item.distance)
    return scored[:top_k]


def _build_chunk_context(retrieved: list[RetrievedChunk], max_answer_chars: int) -> str:
    lines: list[str] = []
    for idx, item in enumerate(retrieved, start=1):
        excerpt = _truncate(item.chunk.text, max_answer_chars)
        lines.append(
            f"{idx}. [{item.document.filename} #{item.chunk.chunk_index}]\n   {excerpt}"
        )
    return "\n".join(lines)


def _answer_with_llm(question: str, retrieved: list[RetrievedChunk]) -> AskLlmOutput:
    settings = get_settings()
    if not settings.openai_api_key.strip():
        raise ValueError("OPENAI_API_KEY is not set")

    llm = ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        temperature=0,
        max_tokens=400,
    )
    structured = llm.with_structured_output(AskLlmOutput)
    chain = ASK_PROMPT | structured
    context = _build_chunk_context(retrieved, settings.faq_ask_max_context_chars)
    return chain.invoke({"question": question, "chunk_context": context})


def ask_faq(db: Session, question: str, top_k: int | None = None) -> FaqAskResponse:
    settings = get_settings()
    k = top_k if top_k is not None else settings.faq_ask_top_k

    backfill_missing_embeddings(db)

    faq_match = _try_match_generated_faq(db, question)
    if faq_match:
        matched_faq, distance = faq_match
        citations: list[FaqCitation] = []
        if matched_faq.source_document:
            citations.append(
                FaqCitation(
                    document_id=matched_faq.source_document.id,
                    filename=matched_faq.source_document.filename,
                    chunk_index=0,
                    excerpt=_truncate(
                        matched_faq.answer, settings.faq_ask_max_answer_chars
                    ),
                )
            )
        return FaqAskResponse(
            answer=matched_faq.answer.strip(),
            source="faq",
            confidence=round(max(0.0, 1.0 - distance), 2),
            matched_sources=citations,
        )

    retrieved = _retrieve_vector(db, question, k)

    if not retrieved or retrieved[0].distance > settings.faq_ask_max_distance:
        return FaqAskResponse(
            answer=NO_MATCH_MESSAGE,
            source="no_match",
            confidence=None,
            matched_sources=[],
        )

    citations = [
        _to_citation(item.chunk, item.document, settings.faq_ask_max_answer_chars)
        for item in retrieved
    ]

    llm_result = _answer_with_llm(question, retrieved)

    cited: list[FaqCitation] = []
    for index in llm_result.cited_chunk_indexes:
        if 1 <= index <= len(retrieved):
            item = retrieved[index - 1]
            cited.append(
                _to_citation(item.chunk, item.document, settings.faq_ask_max_answer_chars)
            )

    confidence = round(max(0.0, 1.0 - retrieved[0].distance), 2)

    return FaqAskResponse(
        answer=llm_result.answer.strip(),
        source="llm",
        confidence=confidence,
        matched_sources=cited if cited else citations[:1],
    )
