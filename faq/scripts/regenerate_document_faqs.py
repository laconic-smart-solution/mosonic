"""Delete and regenerate FAQs (+ reindex chunks) for an existing document."""

import sys
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.session import engine
from app.services.document_regenerate import regenerate_document_faqs


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python scripts/regenerate_document_faqs.py <document_id>")
        sys.exit(1)

    document_id = UUID(sys.argv[1])
    with Session(engine) as db:
        doc, faqs = regenerate_document_faqs(db, document_id)
        print(f"Regenerated {len(faqs)} FAQs for {doc.filename} ({doc.id})")


if __name__ == "__main__":
    main()
