from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth.deps import get_created_by, verify_api_key
from app.db.models import Faq
from app.db.session import get_db
from app.schemas.faq import (
    FaqAskRequest,
    FaqAskResponse,
    FaqCreate,
    FaqListResponse,
    FaqResponse,
    FaqUpdate,
)
from app.services.faq_ask import ask_faq

router = APIRouter(prefix="/faqs", tags=["faqs"])


@router.get("", response_model=FaqListResponse)
def list_faqs(
    q: str | None = Query(default=None, description="Search question/answer"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    active_only: bool = Query(default=True),
    db: Session = Depends(get_db),
) -> FaqListResponse:
    stmt = select(Faq)
    count_stmt = select(func.count()).select_from(Faq)

    if active_only:
        stmt = stmt.where(Faq.is_active.is_(True))
        count_stmt = count_stmt.where(Faq.is_active.is_(True))

    if q and q.strip():
        pattern = f"%{q.strip()}%"
        filter_expr = or_(Faq.question.ilike(pattern), Faq.answer.ilike(pattern))
        stmt = stmt.where(filter_expr)
        count_stmt = count_stmt.where(filter_expr)

    total = db.scalar(count_stmt) or 0
    offset = (page - 1) * limit
    items = db.scalars(
        stmt.order_by(Faq.created_at.desc()).offset(offset).limit(limit)
    ).all()

    return FaqListResponse(
        items=[FaqResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        limit=limit,
    )


@router.post("/ask", response_model=FaqAskResponse)
def ask_faqs(
    body: FaqAskRequest,
    db: Session = Depends(get_db),
) -> FaqAskResponse:
    try:
        return ask_faq(db, body.question.strip(), body.top_k)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(err),
        ) from err


@router.get("/{faq_id}", response_model=FaqResponse)
def get_faq(faq_id: UUID, db: Session = Depends(get_db)) -> FaqResponse:
    faq = db.get(Faq, faq_id)
    if not faq:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found")
    return FaqResponse.model_validate(faq)


@router.post("", response_model=FaqResponse, status_code=status.HTTP_201_CREATED)
def create_faq(
    body: FaqCreate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
    created_by: str = Depends(get_created_by),
) -> FaqResponse:
    faq = Faq(
        question=body.question.strip(),
        answer=body.answer.strip(),
        created_by=created_by,
    )
    db.add(faq)
    db.commit()
    db.refresh(faq)
    return FaqResponse.model_validate(faq)


@router.patch("/{faq_id}", response_model=FaqResponse)
def update_faq(
    faq_id: UUID,
    body: FaqUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
    updated_by: str = Depends(get_created_by),
) -> FaqResponse:
    faq = db.get(Faq, faq_id)
    if not faq:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found")

    if body.question is not None:
        faq.question = body.question.strip()
    if body.answer is not None:
        faq.answer = body.answer.strip()
    if body.is_active is not None:
        faq.is_active = body.is_active
    faq.updated_by = updated_by

    db.commit()
    db.refresh(faq)
    return FaqResponse.model_validate(faq)


@router.delete("/{faq_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_faq(
    faq_id: UUID,
    hard: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
    updated_by: str = Depends(get_created_by),
) -> None:
    faq = db.get(Faq, faq_id)
    if not faq:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found")

    if hard:
        db.delete(faq)
    else:
        faq.is_active = False
        faq.updated_by = updated_by
    db.commit()
