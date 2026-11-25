"""Store one provider-generated avatar profile per user."""
from alembic import op
import sqlalchemy as sa
import sqlmodel

revision = "0005_avatar_profile"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "avatarprofile",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("provider_code", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
        sa.Column("status", sqlmodel.sql.sqltypes.AutoString(length=24), nullable=False),
        sa.Column("model_path", sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
        sa.Column("consent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_avatarprofile_owner_id", "avatarprofile", ["owner_id"], unique=True)
    op.create_index("ix_avatarprofile_provider_code", "avatarprofile", ["provider_code"], unique=True)


def downgrade():
    op.drop_index("ix_avatarprofile_provider_code", table_name="avatarprofile")
    op.drop_index("ix_avatarprofile_owner_id", table_name="avatarprofile")
    op.drop_table("avatarprofile")
