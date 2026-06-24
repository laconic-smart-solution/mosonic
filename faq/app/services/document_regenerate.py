from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import Faq, FaqDocument, FaqDocumentChunk, FaqDocumentStatus
from app.services.document_embeddings import build_chunk_rows
from app.services.faq_generator import generate_faqs_from_text


def reconstruct_text_from_chunks(chunks: list[FaqDocumentChunk]) -> str:
    ordered = sorted(chunks, key=lambda chunk: chunk.chunk_index)
    return "\n\n".join(chunk.text.strip() for chunk in ordered if chunk.text.strip())


def regenerate_document_faqs(
    db: Session,
    document_id: UUID,
    *,
    created_by: str = "system",
) -> tuple[FaqDocument, list[Faq]]:
    doc = db.get(FaqDocument, document_id)
    if not doc:
        raise ValueError("Document not found")

    chunks = list(
        db.scalars(
            select(FaqDocumentChunk)
            .where(FaqDocumentChunk.document_id == document_id)
            .order_by(FaqDocumentChunk.chunk_index.asc())
        ).all()
    )
    if not chunks:
        raise ValueError("Document has no indexed text to regenerate from")

    text = reconstruct_text_from_chunks(chunks)
    if not text.strip():
        raise ValueError("Document text is empty")

    doc.status = FaqDocumentStatus.processing
    doc.error_message = None
    db.commit()

    try:
        db.execute(delete(Faq).where(Faq.source_document_id == document_id))
        db.execute(delete(FaqDocumentChunk).where(FaqDocumentChunk.document_id == document_id))
        db.flush()

        for row in build_chunk_rows(doc, text):
            db.add(row)

        pairs = generate_faqs_from_text(text)
        if not pairs:
            doc.status = FaqDocumentStatus.failed
            doc.faq_count = 0
            doc.error_message = "No FAQ pairs generated from document"
            db.commit()
            raise ValueError("No FAQ pairs could be generated from document")

        faq_rows: list[Faq] = []
        for pair in pairs:
            faq = Faq(
                question=pair.question,
                answer=pair.answer,
                created_by=created_by,
                source_document_id=doc.id,
            )
            db.add(faq)
            faq_rows.append(faq)

        doc.status = FaqDocumentStatus.completed
        doc.faq_count = len(faq_rows)
        doc.error_message = None
        db.commit()
        for faq in faq_rows:
            db.refresh(faq)
        return doc, faq_rows
    except ValueError:
        raise
    except Exception as err:
        doc.status = FaqDocumentStatus.failed
        doc.error_message = str(err)[:2000]
        db.commit()
        raise
