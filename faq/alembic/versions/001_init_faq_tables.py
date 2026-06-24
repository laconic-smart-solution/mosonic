"""init faq tables

Revision ID: 001_init_faq
Revises:
Create Date: 2026-06-19

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001_init_faq"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

faq_document_status = postgresql.ENUM(
    "processing",
    "completed",
    "failed",
    name="faq_document_status",
    create_type=False,
)


def upgrade() -> None:
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE faq_document_status AS ENUM ('processing', 'completed', 'failed');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    faq_document_status = postgresql.ENUM(
        "processing",
        "completed",
        "failed",
        name="faq_document_status",
        create_type=False,
    )

    op.create_table(
        "faq_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("filename", sa.String(length=512), nullable=False),
        sa.Column("content_type", sa.String(length=128), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("uploaded_by", sa.String(length=255), nullable=False),
        sa.Column(
            "status",
            faq_document_status,
            nullable=False,
            server_default="processing",
        ),
        sa.Column("faq_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "faqs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=False),
        sa.Column("updated_by", sa.String(length=255), nullable=True),
        sa.Column("source_document_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["source_document_id"],
            ["faq_documents.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_faqs_created_at", "faqs", ["created_at"], unique=False)
    op.create_index("ix_faqs_source_document_id", "faqs", ["source_document_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_faqs_source_document_id", table_name="faqs")
    op.drop_index("ix_faqs_created_at", table_name="faqs")
    op.drop_table("faqs")
    op.drop_table("faq_documents")
    faq_document_status.drop(op.get_bind(), checkfirst=True)
