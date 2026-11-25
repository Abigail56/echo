"""Support imported GLB avatar models without photo consent."""
from alembic import op
import sqlalchemy as sa
import sqlmodel

revision = "0006_avatar_import"
down_revision = "0005_avatar_profile"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("avatarprofile", "consent_at", nullable=True)
    op.add_column(
        "avatarprofile",
        sa.Column("source", sqlmodel.sql.sqltypes.AutoString(length=16), nullable=False, server_default="avatarsdk"),
    )
    op.alter_column("avatarprofile", "source", server_default=None)


def downgrade():
    has_imported_profiles_without_photo_consent = op.get_bind().execute(
        sa.text("SELECT 1 FROM avatarprofile WHERE consent_at IS NULL LIMIT 1")
    ).first()
    if has_imported_profiles_without_photo_consent:
        raise RuntimeError("Cannot downgrade while imported avatars without photo consent exist.")
    op.drop_column("avatarprofile", "source")
    op.alter_column("avatarprofile", "consent_at", nullable=False)
