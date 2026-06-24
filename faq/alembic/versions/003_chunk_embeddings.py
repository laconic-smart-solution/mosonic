"""Add embeddings to document chunks (JSONB — no pgvector extension required)

Revision ID: 003_chunk_embeddings
Revises: 002_document_chunks
Create Date: 2026-06-24

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003_chunk_embeddings"
down_revision: Union[str, None] = "002_document_chunks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "faq_document_chunks",
        sa.Column("embedding", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("faq_document_chunks", "embedding")
