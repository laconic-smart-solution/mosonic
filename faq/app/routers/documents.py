from uuid import UUID

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import get_created_by, verify_api_key
from app.db.models import Faq, FaqDocument, FaqDocumentStatus
from app.db.session import get_db
from app.schemas.faq import (
    FaqDocumentListResponse,
    FaqDocumentResponse,
    FaqListResponse,
    FaqResponse,
    GenerateFaqsResponse,
    ReindexDocumentResponse,
)
from app.services.document_embeddings import backfill_document_embeddings, build_chunk_rows
from app.services.document_parser import extract_text_from_bytes
from app.services.document_regenerate import regenerate_document_faqs
from app.services.faq_generator import generate_faqs_from_text

router = APIRouter(prefix="/documents", tags=["documents"])


def _document_response(doc: FaqDocument) -> FaqDocumentResponse:
    return FaqDocumentResponse(
        id=doc.id,
        filename=doc.filename,
        content_type=doc.content_type,
        file_size=doc.file_size,
        uploaded_by=doc.uploaded_by,
        status=doc.status.value,
        faq_count=doc.faq_count,
        error_message=doc.error_message,
        storage_path=doc.storage_path,
        created_at=doc.created_at,
    )


@router.get("", response_model=FaqDocumentListResponse)
def list_documents(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
) -> FaqDocumentListResponse:
    count_stmt = select(func.count()).select_from(FaqDocument)
    total = db.scalar(count_stmt) or 0
    offset = (page - 1) * limit
    items = db.scalars(
        select(FaqDocument).order_by(FaqDocument.created_at.desc()).offset(offset).limit(limit)
    ).all()
    return FaqDocumentListResponse(
        items=[_document_response(doc) for doc in items],
        total=total,
        page=page,
        limit=limit,
    )


@router.post(
    "/generate-faqs",
    response_model=GenerateFaqsResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_faqs_from_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
    uploaded_by: str = Depends(get_created_by),
    x_storage_path: str | None = Header(default=None, alias="X-Storage-Path"),
) -> GenerateFaqsResponse:
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Filename is required",
        )

    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file is empty",
        )

    storage_path = x_storage_path.strip() if x_storage_path and x_storage_path.strip() else None

    doc = FaqDocument(
        filename=file.filename,
        content_type=file.content_type,
        file_size=len(content),
        uploaded_by=uploaded_by,
        storage_path=storage_path,
        status=FaqDocumentStatus.processing,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        text = extract_text_from_bytes(file.filename, content)
        if not text.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No extractable text in document",
            )

        chunk_rows = build_chunk_rows(doc, text)
        for row in chunk_rows:
            db.add(row)

        pairs = generate_faqs_from_text(text)
        if not pairs:
            doc.status = FaqDocumentStatus.failed
            doc.error_message = "No FAQ pairs generated from document"
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No FAQ pairs could be generated from document",
            )

        faq_rows: list[Faq] = []
        for pair in pairs:
            faq = Faq(
                question=pair.question,
                answer=pair.answer,
                created_by=uploaded_by,
                source_document_id=doc.id,
            )
            db.add(faq)
            faq_rows.append(faq)

        doc.status = FaqDocumentStatus.completed
        doc.faq_count = len(faq_rows)
        db.commit()
        for faq in faq_rows:
            db.refresh(faq)

        return GenerateFaqsResponse(
            document_id=doc.id,
            faq_count=len(faq_rows),
            faqs=[FaqResponse.model_validate(f) for f in faq_rows],
        )
    except HTTPException:
        raise
    except ValueError as err:
        doc.status = FaqDocumentStatus.failed
        doc.error_message = str(err)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(err),
        ) from err
    except Exception as err:
        doc.status = FaqDocumentStatus.failed
        doc.error_message = str(err)[:2000]
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate FAQs from document",
        ) from err


@router.post("/{document_id}/regenerate-faqs", response_model=GenerateFaqsResponse)
def regenerate_faqs_for_document(
    document_id: UUID,
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
    created_by: str = Depends(get_created_by),
) -> GenerateFaqsResponse:
    try:
        doc, faq_rows = regenerate_document_faqs(
            db, document_id, created_by=created_by
        )
    except ValueError as err:
        message = str(err)
        if message == "Document not found":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=message
            ) from err
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=message
        ) from err
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to regenerate FAQs from document",
        ) from err

    return GenerateFaqsResponse(
        document_id=doc.id,
        faq_count=len(faq_rows),
        faqs=[FaqResponse.model_validate(f) for f in faq_rows],
    )


@router.post("/{document_id}/reindex", response_model=ReindexDocumentResponse)
def reindex_document(
    document_id: UUID,
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
) -> ReindexDocumentResponse:
    doc = db.get(FaqDocument, document_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    try:
        indexed = backfill_document_embeddings(db, document_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(err),
        ) from err
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to reindex document embeddings",
        ) from err
    return ReindexDocumentResponse(document_id=document_id, chunks_indexed=indexed)


@router.get("/{document_id}/faqs", response_model=FaqListResponse)
def list_document_faqs(
    document_id: UUID,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
) -> FaqListResponse:
    doc = db.get(FaqDocument, document_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    base = select(Faq).where(Faq.source_document_id == document_id)
    count_stmt = select(func.count()).select_from(Faq).where(Faq.source_document_id == document_id)
    total = db.scalar(count_stmt) or 0
    offset = (page - 1) * limit
    items = db.scalars(base.order_by(Faq.created_at.asc()).offset(offset).limit(limit)).all()
    return FaqListResponse(
        items=[FaqResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/{document_id}", response_model=FaqDocumentResponse)
def get_document(
    document_id: UUID,
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
) -> FaqDocumentResponse:
    doc = db.get(FaqDocument, document_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return _document_response(doc)
