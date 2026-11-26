"""Group newly imported knowledge sections under owned documents.

Revision ID: 0012_document_library
Revises: 0011_private_chat_history
"""
from alembic import op
import sqlalchemy as sa
import sqlmodel

revision = "0012_document_library"
down_revision = "0011_private_chat_history"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "knowledgedocument",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("echo_id", sa.Uuid(), sa.ForeignKey("echo.id"), nullable=False),
        sa.Column("title", sqlmodel.sql.sqltypes.AutoString(length=120), nullable=False),
        sa.Column("visibility", sqlmodel.sql.sqltypes.AutoString(length=12), nullable=False),
        sa.Column("section_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_knowledgedocument_echo_id", "knowledgedocument", ["echo_id"])
    op.add_column("memory", sa.Column("document_id", sa.Uuid(), sa.ForeignKey("knowledgedocument.id"), nullable=True))
    op.create_index("ix_memory_document_id", "memory", ["document_id"])


def downgrade():
    op.drop_index("ix_memory_document_id", table_name="memory")
    op.drop_column("memory", "document_id")
    op.drop_index("ix_knowledgedocument_echo_id", table_name="knowledgedocument")
    op.drop_table("knowledgedocument")
