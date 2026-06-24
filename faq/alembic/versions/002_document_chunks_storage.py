"""document chunks and storage path

Revision ID: 002_document_chunks
Revises: 001_init_faq
Create Date: 2026-06-24

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "002_document_chunks"
down_revision: Union[str, None] = "001_init_faq"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "faq_documents",
        sa.Column("storage_path", sa.String(length=1024), nullable=True),
    )

    op.create_table(
        "faq_document_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["faq_documents.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_faq_document_chunks_document_id_chunk_index",
        "faq_document_chunks",
        ["document_id", "chunk_index"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_faq_document_chunks_document_id_chunk_index",
        table_name="faq_document_chunks",
    )
    op.drop_table("faq_document_chunks")
    op.drop_column("faq_documents", "storage_path")
