"""Persist extracted text uploads separately from grouped document memories.\n\nRevision ID: 0013_uploaded_documents\nRevises: 0012_document_library\n"""
from alembic import op
import sqlalchemy as sa
import sqlmodel

revision = "0013_uploaded_documents"
down_revision = "0012_document_library"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "uploadeddocument",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("echo_id", sa.Uuid(), sa.ForeignKey("echo.id"), nullable=False),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("filename", sqlmodel.sql.sqltypes.AutoString(length=180), nullable=False),
        sa.Column("visibility", sqlmodel.sql.sqltypes.AutoString(length=12), nullable=False),
        sa.Column("content_type", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column("extracted_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_uploadeddocument_echo_id", "uploadeddocument", ["echo_id"])
    op.create_index("ix_uploadeddocument_owner_id", "uploadeddocument", ["owner_id"])

def downgrade():
    op.drop_index("ix_uploadeddocument_owner_id", table_name="uploadeddocument")
    op.drop_index("ix_uploadeddocument_echo_id", table_name="uploadeddocument")
    op.drop_table("uploadeddocument")
