"""Initial user and echo tables."""
from alembic import op
import sqlalchemy as sa
import sqlmodel
revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('user',
        sa.Column('id', sa.Uuid(), primary_key=True, nullable=False),
        sa.Column('email', sqlmodel.sql.sqltypes.AutoString(length=254), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('password_hash', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False))
    op.create_index('ix_user_email', 'user', ['email'], unique=True)
    op.create_table('echo',
        sa.Column('id', sa.Uuid(), primary_key=True, nullable=False),
        sa.Column('owner_id', sa.Uuid(), sa.ForeignKey('user.id'), nullable=False),
        sa.Column('handle', sqlmodel.sql.sqltypes.AutoString(length=40), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=80), nullable=False),
        sa.Column('tagline', sqlmodel.sql.sqltypes.AutoString(length=180), nullable=False),
        sa.Column('personality', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
        sa.Column('private_knowledge', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('public_knowledge', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('avatar_color', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('avatar_style', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('is_public', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False))
    op.create_index('ix_echo_handle', 'echo', ['handle'], unique=True)
    op.create_index('ix_echo_owner_id', 'echo', ['owner_id'])

def downgrade():
    op.drop_index('ix_echo_owner_id', table_name='echo')
    op.drop_index('ix_echo_handle', table_name='echo')
    op.drop_table('echo')
    op.drop_index('ix_user_email', table_name='user')
    op.drop_table('user')
