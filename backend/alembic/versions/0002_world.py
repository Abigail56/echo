"""ECHO Studio memory and ECHO World social foundation."""
from alembic import op
import sqlalchemy as sa
import sqlmodel
revision = '0002_world'
down_revision = '0001_initial'
branch_labels = None
depends_on = None

def upgrade():
    def table(name, fields, indexes=()):
        op.create_table(name, sa.Column('id', sa.Uuid(), primary_key=True, nullable=False), *fields)
        for col in indexes: op.create_index(f'ix_{name}_{col}', name, [col])
    def uid(name): return sa.Column(name, sa.Uuid(), sa.ForeignKey('user.id'), nullable=False)
    def eid(name): return sa.Column(name, sa.Uuid(), sa.ForeignKey('echo.id'), nullable=False)
    def cid(name): return sa.Column(name, sa.Uuid(), sa.ForeignKey('community.id'), nullable=False)
    def s(name, length=None): return sa.Column(name, sqlmodel.sql.sqltypes.AutoString(length=length), nullable=False)
    def dt(): return sa.Column('created_at', sa.DateTime(), nullable=False)
    table('memory', [eid('echo_id'), s('title',120), s('content',5000), s('visibility',12), dt()], ['echo_id'])
    table('connection', [uid('requester_id'), uid('recipient_id'), s('status',12), dt()], ['requester_id','recipient_id'])
    table('community', [uid('owner_id'), s('slug',48), s('name',100), s('description',500), dt()], ['owner_id'])
    op.create_index('ix_community_slug', 'community', ['slug'], unique=True)
    table('membership', [uid('user_id'), cid('community_id'), dt()], ['user_id','community_id'])
    table('post', [uid('user_id'), cid('community_id'), s('content',1500), dt()], ['user_id','community_id'])
    table('conversation', [uid('requester_id'), uid('recipient_id'), eid('requester_echo_id'), eid('recipient_echo_id'), s('status',12), s('transcript'), dt()], ['requester_id','recipient_id'])
    table('usage', [uid('user_id'), s('period',7), sa.Column('chat_count', sa.Integer(), nullable=False), sa.Column('voice_count', sa.Integer(), nullable=False), s('plan',20)], ['user_id'])

def downgrade():
    for name in ('usage','conversation','post','membership','community','connection','memory'): op.drop_table(name)
