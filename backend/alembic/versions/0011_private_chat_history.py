"""Persist private ECHO owner chat turns.

Revision ID: 0011_private_chat_history
Revises: 0010_tavus_face_preference
"""
from alembic import op
import sqlalchemy as sa
import sqlmodel

revision = "0011_private_chat_history"
down_revision = "0010_tavus_face_preference"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "chatturn",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("echo_id", sa.Uuid(), sa.ForeignKey("echo.id"), nullable=False),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("user_message", sqlmodel.sql.sqltypes.AutoString(length=2000), nullable=False),
        sa.Column("assistant_message", sqlmodel.sql.sqltypes.AutoString(length=8000), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_chatturn_echo_id", "chatturn", ["echo_id"])
    op.create_index("ix_chatturn_owner_id", "chatturn", ["owner_id"])
    op.create_index("ix_chatturn_created_at", "chatturn", ["created_at"])


def downgrade():
    op.drop_index("ix_chatturn_created_at", table_name="chatturn")
    op.drop_index("ix_chatturn_owner_id", table_name="chatturn")
    op.drop_index("ix_chatturn_echo_id", table_name="chatturn")
    op.drop_table("chatturn")
