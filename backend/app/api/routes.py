from uuid import UUID
from datetime import datetime, timezone
import shutil
import subprocess
import tempfile
from pathlib import Path
from pydantic import BaseModel, Field, field_validator
from fastapi.responses import Response as FastAPIResponse
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlmodel import Session, select
from app.core.db import session_dep
from app.core.auth import current_user, hash_password, verify_password, token_for
from app.core.config import settings
from app.core.limit import limit
from app.core.ai import reply
from app.core.knowledge import relevant_memory_context, relevant_document_context
from app.models.entities import User, Echo, Memory, Usage, Conversation, ChatTurn, KnowledgeDocument
from app.api.schemas import Register, Login, UserOut, EchoCreate, EchoUpdate, EchoOut, PublicEcho, ChatRequest, ChatResponse

router = APIRouter()

class SpeechIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    voice: str = Field(default="en-us", pattern="^(en-us|en-gb|en-sc)$")

    @field_validator("text")
    @classmethod
    def require_spoken_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Text cannot be blank")
        return value

@router.post("/avatar/speech")
def avatar_speech(body: SpeechIn, request: Request, user: User = Depends(current_user)):
    limit(request, f"avatar-speech:{user.id}", 10, 60)
    espeak = shutil.which("espeak-ng")
    if not espeak:
        raise HTTPException(status_code=503, detail="Text-to-speech engine unavailable")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as output:
        output_path = output.name
    try:
        subprocess.run(
            [espeak, "-v", body.voice, "-s", "155", "-p", "48", "-w", output_path, "--stdin"],
            check=True,
            capture_output=True,
            timeout=15,
            input=body.text,
            text=True,
        )
        with open(output_path, "rb") as audio:
            return FastAPIResponse(content=audio.read(), media_type="audio/wav")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Speech generation timed out")
    except subprocess.CalledProcessError:
        raise HTTPException(status_code=500, detail="Speech generation failed")
    finally:
        Path(output_path).unlink(missing_ok=True)
def set_cookie(response: Response, user: User):
    response.set_cookie("echo_session", token_for(user), httponly=True, secure=settings().COOKIE_SECURE,
        samesite="lax", max_age=604800, path="/")

@router.post("/auth/register", response_model=UserOut, status_code=201)
def register(body: Register, response: Response, request: Request, db: Session = Depends(session_dep)):
    limit(request, "register", 8, 3600)
    email = str(body.email).lower()
    if db.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password))
    db.add(user)
    try: db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=409, detail="Account already exists")
    db.refresh(user)
    set_cookie(response, user)
    return user

@router.post("/auth/login", response_model=UserOut)
def login(body: Login, response: Response, request: Request, db: Session = Depends(session_dep)):
    limit(request, "login", 12, 900)
    user = db.exec(select(User).where(User.email == str(body.email).lower())).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    set_cookie(response, user)
    return user

@router.post("/auth/logout")
def logout(response: Response, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    user.session_version += 1
    db.add(user); db.commit()
    response.delete_cookie("echo_session", path="/")
    return {"ok": True}

@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(current_user)): return user

@router.get("/diagnostics")
def diagnostics(user: User = Depends(current_user)):
    config = settings()
    return {
        "backend": "healthy",
        "authentication": "authenticated",
        "provider_credentials": {
            "avatar_sdk": bool(config.AVATAR_SDK_ENABLED and config.AVATAR_SDK_CLIENT_ID and config.AVATAR_SDK_CLIENT_SECRET),
            "liveavatar": bool(config.LIVEAVATAR_ENABLED and config.LIVEAVATAR_API_KEY),
            "tavus": bool(config.TAVUS_API_KEY),
        },
        "capabilities": {
            "avatar_sdk_rigged_3d": config.AVATAR_SDK_ENABLED,
            "photorealistic_video": config.LIVEAVATAR_ENABLED and bool(config.LIVEAVATAR_API_KEY),
            "native_webrtc": True,
            "virtual_camera": False,
            "external_meeting_attendance": False,
            "autonomous_meeting_participation": False,
        },
        "network": {"api": "reachable"},
    }

def owned(echo_id: UUID, user: User, db: Session) -> Echo:
    echo = db.get(Echo, echo_id)
    if not echo or echo.owner_id != user.id: raise HTTPException(status_code=404, detail="ECHO not found")
    return echo

@router.get("/echoes", response_model=list[EchoOut])
def list_echoes(user: User = Depends(current_user), db: Session = Depends(session_dep)):
    return db.exec(select(Echo).where(Echo.owner_id == user.id).order_by(Echo.created_at.desc())).all()

@router.post("/echoes", response_model=EchoOut, status_code=201)
def create_echo(body: EchoCreate, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    if db.exec(select(Echo).where(Echo.handle == body.handle)).first():
        raise HTTPException(status_code=409, detail="Handle is already taken")
    echo = Echo(**body.model_dump(), owner_id=user.id)
    db.add(echo)
    try: db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=409, detail="Handle is already taken")
    db.refresh(echo)
    return echo

@router.get("/echoes/{echo_id}", response_model=EchoOut)
def get_echo(echo_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    return owned(echo_id, user, db)

@router.patch("/echoes/{echo_id}", response_model=EchoOut)
def update_echo(echo_id: UUID, body: EchoUpdate, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    echo = owned(echo_id, user, db)
    changes = body.model_dump(exclude_unset=True)
    if "handle" in changes and changes["handle"] != echo.handle:
        if db.exec(select(Echo).where(Echo.handle == changes["handle"])).first():
            raise HTTPException(status_code=409, detail="Handle is already taken")
    for key, value in changes.items():
        if value is not None: setattr(echo, key, value)
    db.add(echo)
    try: db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=409, detail="Handle is already taken")
    db.refresh(echo)
    return echo

@router.delete("/echoes/{echo_id}", status_code=204)
def delete_echo(echo_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    echo = owned(echo_id, user, db)
    # Remove dependent records before deleting the identity.
    for memory in db.exec(select(Memory).where(Memory.echo_id == echo_id)).all(): db.delete(memory)
    for document in db.exec(select(KnowledgeDocument).where(KnowledgeDocument.echo_id == echo_id)).all(): db.delete(document)
    for turn in db.exec(select(ChatTurn).where(ChatTurn.echo_id == echo_id)).all(): db.delete(turn)
    for convo in db.exec(select(Conversation).where((Conversation.requester_echo_id == echo_id) | (Conversation.recipient_echo_id == echo_id))).all(): db.delete(convo)
    db.delete(echo); db.commit()

@router.get("/public/{handle}", response_model=PublicEcho)
def public_echo(handle: str, db: Session = Depends(session_dep)):
    echo = db.exec(select(Echo).where(Echo.handle == handle, Echo.is_public == True)).first()
    if not echo: raise HTTPException(status_code=404, detail="Public ECHO not found")
    return echo

@router.get("/echoes/{echo_id}/chat/history")
def owner_chat_history(echo_id: UUID, user: User = Depends(current_user),
                       db: Session = Depends(session_dep)):
    owned(echo_id, user, db)
    turns = db.exec(
        select(ChatTurn)
        .where(ChatTurn.echo_id == echo_id, ChatTurn.owner_id == user.id)
        .order_by(ChatTurn.created_at.desc(), ChatTurn.id.desc())
        .limit(100)
    ).all()
    return [turn.model_dump(mode="json") for turn in reversed(turns)]


@router.delete("/echoes/{echo_id}/chat/history", status_code=204)
def clear_owner_chat_history(echo_id: UUID, user: User = Depends(current_user),
                             db: Session = Depends(session_dep)):
    owned(echo_id, user, db)
    for turn in db.exec(select(ChatTurn).where(ChatTurn.echo_id == echo_id, ChatTurn.owner_id == user.id)).all():
        db.delete(turn)
    db.commit()


@router.post("/echoes/{echo_id}/chat", response_model=ChatResponse)
async def private_chat(echo_id: UUID, body: ChatRequest, request: Request,
    user: User = Depends(current_user), db: Session = Depends(session_dep)):
    limit(request, "chat-private", 30, 3600)
    echo = owned(echo_id, user, db)
    period = datetime.now(timezone.utc).strftime('%Y-%m')
    usage = db.exec(select(Usage).where(Usage.user_id == user.id, Usage.period == period)).first()
    if usage and usage.chat_count >= 100: raise HTTPException(429, 'Monthly free chat limit reached')
    approved = db.exec(select(Memory).where(Memory.echo_id == echo_id)).all()
    context = relevant_memory_context(approved, body.message, public=False)
    documents = db.exec(select(KnowledgeDocument).where(KnowledgeDocument.echo_id == echo_id, KnowledgeDocument.owner_id == user.id)).all()
    context += '\\n' + relevant_document_context(documents, body.message, public=False)
    # Use persisted owner history instead of untrusted client-authored assistant turns.
    previous = db.exec(
        select(ChatTurn).where(ChatTurn.echo_id == echo_id, ChatTurn.owner_id == user.id)
        .order_by(ChatTurn.created_at.desc(), ChatTurn.id.desc()).limit(4)
    ).all()
    trusted_history = []
    for turn in reversed(previous):
        trusted_history.extend([
            {"role": "user", "content": turn.user_message},
            {"role": "assistant", "content": turn.assistant_message[:2000]},
        ])
    response = await reply(
        echo, ChatRequest(message=body.message, history=trusted_history),
        public=False, additional_knowledge=context,
    )
    if not usage: usage = Usage(user_id=user.id, period=period)
    usage.chat_count += 1
    db.add(usage)
    db.add(ChatTurn(
        echo_id=echo_id, owner_id=user.id,
        user_message=body.message, assistant_message=response.reply[:8000],
    ))
    db.flush()
    # Retain at most 100 completed exchanges for this owner and ECHO.
    old_turns = db.exec(
        select(ChatTurn).where(ChatTurn.echo_id == echo_id, ChatTurn.owner_id == user.id)
        .order_by(ChatTurn.created_at.desc(), ChatTurn.id.desc()).offset(100)
    ).all()
    for old_turn in old_turns:
        db.delete(old_turn)
    db.commit()
    return response


@router.post("/public/{handle}/chat", response_model=ChatResponse)
async def public_chat(handle: str, body: ChatRequest, request: Request, db: Session = Depends(session_dep)):
    limit(request, "chat-public", 20, 3600)
    echo = db.exec(select(Echo).where(Echo.handle == handle, Echo.is_public == True)).first()
    if not echo: raise HTTPException(status_code=404, detail="Public ECHO not found")
    approved = db.exec(select(Memory).where(Memory.echo_id == echo.id, Memory.visibility == 'public')).all()
    context = relevant_memory_context(approved, body.message, public=True)
    documents = db.exec(select(KnowledgeDocument).where(KnowledgeDocument.echo_id == echo.id, KnowledgeDocument.visibility == 'public')).all()
    context += '\\n' + relevant_document_context(documents, body.message, public=True)
    return await reply(echo, body, public=True, additional_knowledge=context)
