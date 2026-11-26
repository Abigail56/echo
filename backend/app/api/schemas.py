from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, ConfigDict

class Register(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=10, max_length=128)
class Login(BaseModel):
    email: EmailStr
    password: str
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: EmailStr
    name: str
class EchoCreate(BaseModel):
    handle: str = Field(pattern=r"^[a-z0-9-]{3,40}$")
    name: str = Field(min_length=2, max_length=80)
    tagline: str = Field(default="", max_length=180)
    personality: str = Field(default="Friendly, helpful and professional", max_length=500)
    private_knowledge: str = Field(default="", max_length=12000)
    public_knowledge: str = Field(default="", max_length=12000)
    avatar_color: str = Field(default="cyan", pattern="^(cyan|violet|pink|emerald)$")
    avatar_style: str = Field(default="orb", pattern="^(orb|robot|star)$")
    is_public: bool = False
class EchoUpdate(BaseModel):
    handle: str | None = Field(default=None, pattern=r"^[a-z0-9-]{3,40}$")
    name: str | None = Field(default=None, min_length=2, max_length=80)
    tagline: str | None = Field(default=None, max_length=180)
    personality: str | None = Field(default=None, max_length=500)
    private_knowledge: str | None = Field(default=None, max_length=12000)
    public_knowledge: str | None = Field(default=None, max_length=12000)
    avatar_color: str | None = Field(default=None, pattern="^(cyan|violet|pink|emerald)$")
    avatar_style: str | None = Field(default=None, pattern="^(orb|robot|star)$")
    is_public: bool | None = None
class EchoOut(EchoCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    owner_id: UUID
class PublicEcho(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    handle: str
    name: str
    tagline: str
    avatar_color: str
    avatar_style: str
class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=2000)
class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=12)
class KnowledgeSourceOut(BaseModel):
    id: UUID
    title: str

class ChatResponse(BaseModel):
    reply: str
    demo: bool
    # These records were included in context, not independently verified citations.
    sources: list[KnowledgeSourceOut] = Field(default_factory=list)
