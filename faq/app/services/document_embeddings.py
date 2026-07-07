from uuid import UUID

from langchain_openai import OpenAIEmbeddings
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import FaqDocument, FaqDocumentChunk, FaqDocumentStatus
from app.services.document_chunks import split_text_into_chunks


def _embeddings_client() -> OpenAIEmbeddings:
    settings = get_settings()
    if not settings.openai_api_key.strip():
        raise ValueError("OPENAI_API_KEY is not set")
    return OpenAIEmbeddings(
        model=settings.openai_embedding_model,
        api_key=settings.openai_api_key,
    )


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    client = _embeddings_client()
    return client.embed_documents(texts)


def embed_query(text: str) -> list[float]:
    client = _embeddings_client()
    return client.embed_query(text)


def build_chunk_rows(
    document: FaqDocument,
    text: str,
) -> list[FaqDocumentChunk]:
    chunk_texts = split_text_into_chunks(text)
    embeddings = embed_texts(chunk_texts)
    rows: list[FaqDocumentChunk] = []
    for index, (chunk_text, vector) in enumerate(zip(chunk_texts, embeddings, strict=True)):
        rows.append(
            FaqDocumentChunk(
                document_id=document.id,
                chunk_index=index,
                text=chunk_text.strip(),
                embedding=vector,
            )
        )
    return rows


def backfill_document_embeddings(db: Session, document_id: UUID) -> int:
    doc = db.get(FaqDocument, document_id)
    if not doc:
        raise ValueError("Document not found")
    if doc.status != FaqDocumentStatus.completed:
        raise ValueError("Document is not in completed status")

    chunks = list(
        db.scalars(
            select(FaqDocumentChunk)
            .where(FaqDocumentChunk.document_id == document_id)
            .order_by(FaqDocumentChunk.chunk_index.asc())
        ).all()
    )
    if not chunks:
        raise ValueError("Document has no chunks to index")

    missing = [chunk for chunk in chunks if chunk.embedding is None]
    if not missing:
        return 0

    vectors = embed_texts([chunk.text for chunk in missing])
    for chunk, vector in zip(missing, vectors, strict=True):
        chunk.embedding = vector

    db.commit()
    return len(missing)


def backfill_missing_embeddings(db: Session) -> int:
    """Index any completed document chunks that lack embeddings."""
    stmt = (
        select(FaqDocumentChunk.document_id)
        .join(FaqDocument, FaqDocumentChunk.document_id == FaqDocument.id)
        .where(FaqDocument.status == FaqDocumentStatus.completed)
        .where(FaqDocumentChunk.embedding.is_(None))
        .distinct()
    )
    document_ids = list(db.scalars(stmt).all())
    total = 0
    for document_id in document_ids:
        total += backfill_document_embeddings(db, document_id)
    return total
