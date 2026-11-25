"""Persist LiveAvatar consent and ECHO context references."""
from alembic import op
import sqlalchemy as sa
import sqlmodel

revision = "0009_liveavatar_consent"
down_revision = "0008_live_avatar"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "echo",
        sa.Column(
            "liveavatar_context_id",
            sqlmodel.sql.sqltypes.AutoString(length=64),
            nullable=True,
        ),
    )
    op.add_column(
        "avatarproviderasset",
        sa.Column("consent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "avatarproviderasset",
        sa.Column(
            "consent_scope",
            sqlmodel.sql.sqltypes.AutoString(length=64),
            nullable=True,
        ),
    )
    op.add_column(
        "avatarlivesession",
        sa.Column("echo_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_avatarlivesession_echo_id_echo",
        "avatarlivesession",
        "echo",
        ["echo_id"],
        ["id"],
    )
    op.add_column(
        "avatarlivesession",
        sa.Column(
            "knowledge_scope",
            sqlmodel.sql.sqltypes.AutoString(length=16),
            nullable=True,
        ),
    )
    op.add_column(
        "avatarlivesession",
        sa.Column("knowledge_consent_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_column("avatarlivesession", "knowledge_consent_at")
    op.drop_column("avatarlivesession", "knowledge_scope")
    op.drop_constraint(
        "fk_avatarlivesession_echo_id_echo",
        "avatarlivesession",
        type_="foreignkey",
    )
    op.drop_column("avatarlivesession", "echo_id")
    op.drop_column("avatarproviderasset", "consent_scope")
    op.drop_column("avatarproviderasset", "consent_at")
    op.drop_column("echo", "liveavatar_context_id")
