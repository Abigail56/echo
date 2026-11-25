"""Shared world rooms."""
from alembic import op
import sqlalchemy as sa
import sqlmodel
revision = '0003_rooms'
down_revision = '0002_world'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('worldroom', sa.Column('id', sa.Uuid(), primary_key=True), sa.Column('owner_id', sa.Uuid(), sa.ForeignKey('user.id'), nullable=False), sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False), sa.Column('access_code', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False), sa.Column('created_at', sa.DateTime(), nullable=False))
    op.create_index('ix_worldroom_owner_id', 'worldroom', ['owner_id'])
    op.create_index('ix_worldroom_access_code', 'worldroom', ['access_code'], unique=True)

def downgrade():
    op.drop_table('worldroom')
