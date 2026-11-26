from datetime import datetime, timezone
from uuid import UUID, uuid4
from sqlmodel import SQLModel, Field

def now(): return datetime.now(timezone.utc)

class User(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    email: str = Field(index=True, unique=True, max_length=254)
    name: str = Field(max_length=100)
    password_hash: str
    session_version: int = Field(default=0)
    liveavatar_avatar_id: str | None = Field(default=None, max_length=64)
    tavus_face_id: str | None = Field(default=None, max_length=64)
    created_at: datetime = Field(default_factory=now)

class Echo(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    owner_id: UUID = Field(foreign_key="user.id", index=True)
    handle: str = Field(index=True, unique=True, max_length=40)
    name: str = Field(max_length=80)
    tagline: str = Field(default="", max_length=180)
    personality: str = Field(default="Friendly, helpful and professional", max_length=500)
    private_knowledge: str = Field(default="")
    public_knowledge: str = Field(default="")
    avatar_color: str = Field(default="cyan", max_length=20)
    avatar_style: str = Field(default="orb", max_length=20)
    is_public: bool = Field(default=False)
    liveavatar_context_id: str | None = Field(default=None, max_length=64)
    created_at: datetime = Field(default_factory=now)


class KnowledgeDocument(SQLModel, table=True):
    """Owned metadata for an imported document; original file is not retained."""
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    echo_id: UUID = Field(foreign_key="echo.id", index=True)
    title: str = Field(max_length=120)
    visibility: str = Field(default="private", max_length=12)
    section_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=now)


class Memory(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    echo_id: UUID = Field(foreign_key="echo.id", index=True)
    document_id: UUID | None = Field(default=None, foreign_key="knowledgedocument.id", index=True)
    title: str = Field(max_length=120)
    content: str = Field(max_length=5000)
    visibility: str = Field(default="private", max_length=12)
    created_at: datetime = Field(default_factory=now)

class ChatTurn(SQLModel, table=True):
    """A successfully completed, private owner/ECHO exchange."""
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    echo_id: UUID = Field(foreign_key="echo.id", index=True)
    owner_id: UUID = Field(foreign_key="user.id", index=True)
    user_message: str = Field(max_length=2000)
    assistant_message: str = Field(max_length=8000)
    created_at: datetime = Field(default_factory=now, index=True)


class Connection(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    requester_id: UUID = Field(foreign_key="user.id", index=True)
    recipient_id: UUID = Field(foreign_key="user.id", index=True)
    status: str = Field(default="pending", max_length=12)
    created_at: datetime = Field(default_factory=now)

class Community(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    owner_id: UUID = Field(foreign_key="user.id", index=True)
    slug: str = Field(unique=True, index=True, max_length=48)
    name: str = Field(max_length=100)
    description: str = Field(default="", max_length=500)
    created_at: datetime = Field(default_factory=now)

class Membership(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)
    community_id: UUID = Field(foreign_key="community.id", index=True)
    created_at: datetime = Field(default_factory=now)

class Post(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)
    community_id: UUID = Field(foreign_key="community.id", index=True)
    content: str = Field(max_length=1500)
    created_at: datetime = Field(default_factory=now)

class Conversation(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    requester_id: UUID = Field(foreign_key="user.id", index=True)
    recipient_id: UUID = Field(foreign_key="user.id", index=True)
    requester_echo_id: UUID = Field(foreign_key="echo.id")
    recipient_echo_id: UUID = Field(foreign_key="echo.id")
    status: str = Field(default="pending", max_length=12)
    transcript: str = Field(default="")
    created_at: datetime = Field(default_factory=now)

class Usage(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)
    period: str = Field(max_length=7)
    chat_count: int = Field(default=0)
    voice_count: int = Field(default=0)
    plan: str = Field(default="free", max_length=20)

class AvatarProfile(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    owner_id: UUID = Field(foreign_key="user.id", index=True, unique=True)
    provider_code: str = Field(unique=True, max_length=64)
    status: str = Field(default="Queued", max_length=24)
    progress: int = Field(default=0, ge=0, le=100)
    model_path: str | None = Field(default=None, max_length=500)
    consent_at: datetime | None = None
    source: str = Field(default="avatarsdk", max_length=16)
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class AvatarProviderAsset(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    owner_id: UUID = Field(foreign_key="user.id", index=True)
    provider: str = Field(max_length=16)
    external_id: str = Field(unique=True, max_length=64)
    name: str = Field(max_length=120)
    status: str = Field(default="INIT", max_length=24)
    consent_at: datetime | None = None
    consent_scope: str | None = Field(default=None, max_length=64)
    created_at: datetime = Field(default_factory=now)


class AvatarLiveSession(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    owner_id: UUID = Field(foreign_key="user.id", index=True)
    provider: str = Field(max_length=16)
    external_id: str = Field(unique=True, max_length=64)
    avatar_id: str = Field(max_length=64)
    echo_id: UUID | None = Field(default=None, foreign_key="echo.id")
    mode: str = Field(max_length=16)
    status: str = Field(default="starting", max_length=24)
    sandbox: bool = Field(default=False)
    knowledge_scope: str | None = Field(default=None, max_length=16)
    knowledge_consent_at: datetime | None = None
    created_at: datetime = Field(default_factory=now)
    ended_at: datetime | None = None


class WorldRoom(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    owner_id: UUID = Field(foreign_key="user.id", index=True)
    name: str = Field(max_length=100)
    access_code: str = Field(index=True, unique=True, max_length=20)
    created_at: datetime = Field(default_factory=now)
