"""Add live-avatar assets, sessions and user avatar selection."""
from alembic import op
import sqlalchemy as sa
import sqlmodel

revision = "0008_live_avatar"
down_revision = "0007_avatar_progress"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "user",
        sa.Column("liveavatar_avatar_id", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=True),
    )
    op.create_table(
        "avatarproviderasset",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("provider", sqlmodel.sql.sqltypes.AutoString(length=16), nullable=False),
        sa.Column("external_id", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=120), nullable=False),
        sa.Column("status", sqlmodel.sql.sqltypes.AutoString(length=24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_avatarproviderasset_owner_id", "avatarproviderasset", ["owner_id"])
    op.create_index("ix_avatarproviderasset_external_id", "avatarproviderasset", ["external_id"], unique=True)
    op.create_table(
        "avatarlivesession",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("provider", sqlmodel.sql.sqltypes.AutoString(length=16), nullable=False),
        sa.Column("external_id", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
        sa.Column("avatar_id", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
        sa.Column("mode", sqlmodel.sql.sqltypes.AutoString(length=16), nullable=False),
        sa.Column("status", sqlmodel.sql.sqltypes.AutoString(length=24), nullable=False),
        sa.Column("sandbox", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_avatarlivesession_owner_id", "avatarlivesession", ["owner_id"])
    op.create_index("ix_avatarlivesession_external_id", "avatarlivesession", ["external_id"], unique=True)


def downgrade():
    op.drop_index("ix_avatarlivesession_external_id", table_name="avatarlivesession")
    op.drop_index("ix_avatarlivesession_owner_id", table_name="avatarlivesession")
    op.drop_table("avatarlivesession")
    op.drop_index("ix_avatarproviderasset_external_id", table_name="avatarproviderasset")
    op.drop_index("ix_avatarproviderasset_owner_id", table_name="avatarproviderasset")
    op.drop_table("avatarproviderasset")
    op.drop_column("user", "liveavatar_avatar_id")
