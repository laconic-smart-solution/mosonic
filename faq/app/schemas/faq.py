from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class FaqCreate(BaseModel):
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)


class FaqUpdate(BaseModel):
    question: str | None = Field(default=None, min_length=1)
    answer: str | None = Field(default=None, min_length=1)
    is_active: bool | None = None


class FaqResponse(BaseModel):
    id: UUID
    question: str
    answer: str
    created_by: str
    updated_by: str | None
    source_document_id: UUID | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FaqListResponse(BaseModel):
    items: list[FaqResponse]
    total: int
    page: int
    limit: int


class FaqDocumentResponse(BaseModel):
    id: UUID
    filename: str
    content_type: str | None
    file_size: int
    uploaded_by: str
    status: str
    faq_count: int
    error_message: str | None
    storage_path: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class FaqDocumentListResponse(BaseModel):
    items: list[FaqDocumentResponse]
    total: int
    page: int
    limit: int


class GenerateFaqsResponse(BaseModel):
    document_id: UUID
    faq_count: int
    faqs: list[FaqResponse]


class ReindexDocumentResponse(BaseModel):
    document_id: UUID
    chunks_indexed: int


class FaqAskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    top_k: int | None = Field(default=None, ge=1, le=10)


class FaqCitation(BaseModel):
    document_id: UUID
    filename: str
    chunk_index: int
    excerpt: str


class FaqAskResponse(BaseModel):
    answer: str
    source: Literal["faq", "llm", "no_match"]
    confidence: float | None
    matched_sources: list[FaqCitation]
