"""Persist a user's selected Tavus face."""
from alembic import op
import sqlalchemy as sa
import sqlmodel

revision = "0010_tavus_face_preference"
down_revision = "0009_liveavatar_consent"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "user",
        sa.Column(
            "tavus_face_id",
            sqlmodel.sql.sqltypes.AutoString(length=64),
            nullable=True,
        ),
    )


def downgrade():
    op.drop_column("user", "tavus_face_id")
