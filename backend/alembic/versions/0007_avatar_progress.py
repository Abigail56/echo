"""Store Avatar SDK generation progress."""
from alembic import op
import sqlalchemy as sa

revision = "0007_avatar_progress"
down_revision = "0006_avatar_import"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "avatarprofile",
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("avatarprofile", "progress", server_default=None)


def downgrade():
    op.drop_column("avatarprofile", "progress")
