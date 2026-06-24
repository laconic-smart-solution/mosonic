"""Backfill embeddings for documents uploaded before vector RAG."""

import sys
from uuid import UUID

from sqlalchemy import select

from app.db.models import FaqDocument, FaqDocumentChunk
from app.db.session import SessionLocal
from app.services.document_embeddings import backfill_document_embeddings


def main() -> None:
    document_id = sys.argv[1] if len(sys.argv) > 1 else None
    db = SessionLocal()
    try:
        if document_id:
            count = backfill_document_embeddings(db, UUID(document_id))
            print(f"Indexed {count} chunks for document {document_id}")
            return

        docs = db.scalars(select(FaqDocument)).all()
        total = 0
        for doc in docs:
            missing = db.scalar(
                select(FaqDocumentChunk.id)
                .where(FaqDocumentChunk.document_id == doc.id)
                .where(FaqDocumentChunk.embedding.is_(None))
                .limit(1)
            )
            if not missing:
                continue
            try:
                count = backfill_document_embeddings(db, doc.id)
                total += count
                print(f"{doc.filename}: indexed {count} chunks")
            except Exception as err:
                print(f"{doc.filename}: failed - {err}")
        print(f"Done. Total chunks indexed: {total}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
