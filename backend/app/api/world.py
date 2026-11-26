from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, Query
from pydantic import BaseModel, Field
from sqlmodel import Session, select, or_
from app.core.db import session_dep
from app.core.auth import current_user
from app.core.limit import limit
from app.core.document_import import MAX_UPLOAD_BYTES, document_title, extract_document_full, split_document_sections
from app.core.knowledge_search import search_memories
from app.models.entities import User, Echo, Memory, Connection, Community, Membership, Post, Conversation, Usage, KnowledgeDocument
from app.core.ai import reply

router = APIRouter()

class MemoryIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    content: str = Field(min_length=2, max_length=5000)
    visibility: str = Field(default="private", pattern="^(private|public)$")
class MemoryUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=120)
    content: str | None = Field(default=None, min_length=2, max_length=5000)
    visibility: str | None = Field(default=None, pattern="^(private|public)$")

class DocumentVisibilityUpdate(BaseModel):
    visibility: str = Field(pattern="^(private|public)$")
    allow_public: bool = False


class CommunityIn(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9-]{3,48}$")
    name: str = Field(min_length=3, max_length=100)
    description: str = Field(default="", max_length=500)
class PostIn(BaseModel):
    content: str = Field(min_length=1, max_length=1500)
class ConnectionIn(BaseModel):
    recipient_id: UUID
class ConversationIn(BaseModel):
    recipient_echo_id: UUID
    requester_echo_id: UUID

def own_echo(db, user, echo_id):
    e = db.get(Echo, echo_id)
    if not e or e.owner_id != user.id: raise HTTPException(404, "ECHO not found")
    return e

def serialize(obj): return obj.model_dump(mode="json")

@router.get('/studio/{echo_id}/memories')
def memories(echo_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    own_echo(db, user, echo_id)
    return [serialize(x) for x in db.exec(select(Memory).where(Memory.echo_id == echo_id).order_by(Memory.created_at.desc())).all()]

@router.get('/studio/{echo_id}/knowledge/search')
def search_knowledge(
    echo_id: UUID,
    q: str = Query(default='', max_length=120),
    visibility: str = Query(default='all'),
    origin: str = Query(default='all'),
    user: User = Depends(current_user),
    db: Session = Depends(session_dep),
):
    own_echo(db, user, echo_id)
    if visibility not in ('all', 'private', 'public') or origin not in ('all', 'document', 'manual'):
        raise HTTPException(422, 'Invalid knowledge search filter')
    if not q.strip():
        return []
    rows = db.exec(select(Memory).where(Memory.echo_id == echo_id)).all()
    hits = search_memories(rows, q, visibility=visibility, origin=origin)
    return [
        {
            'id': str(hit.id), 'title': hit.title, 'visibility': hit.visibility,
            'document_id': str(hit.document_id) if hit.document_id else None,
            'snippet': hit.snippet,
        }
        for hit in hits
    ]


@router.get('/studio/{echo_id}/documents')
def documents(echo_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    own_echo(db, user, echo_id)
    groups = db.exec(
        select(KnowledgeDocument).where(KnowledgeDocument.echo_id == echo_id)
        .order_by(KnowledgeDocument.created_at.desc(), KnowledgeDocument.id.desc())
    ).all()
    return [serialize(group) for group in groups]


@router.patch('/studio/{echo_id}/documents/{document_id}')
def update_document_visibility(
    echo_id: UUID,
    document_id: UUID,
    body: DocumentVisibilityUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(session_dep),
):
    own_echo(db, user, echo_id)
    document = db.get(KnowledgeDocument, document_id)
    if not document or document.echo_id != echo_id:
        raise HTTPException(404, 'Document not found')
    if body.visibility == 'public' and not body.allow_public:
        raise HTTPException(422, 'Public document sharing requires explicit confirmation.')
    sections = db.exec(
        select(Memory).where(Memory.echo_id == echo_id, Memory.document_id == document_id)
    ).all()
    document.visibility = body.visibility
    for section in sections:
        section.visibility = body.visibility
        db.add(section)
    db.add(document)
    db.commit()
    db.refresh(document)
    return serialize(document)


@router.delete('/studio/{echo_id}/documents/{document_id}', status_code=204)
def delete_document(
    echo_id: UUID,
    document_id: UUID,
    user: User = Depends(current_user),
    db: Session = Depends(session_dep),
):
    own_echo(db, user, echo_id)
    document = db.get(KnowledgeDocument, document_id)
    if not document or document.echo_id != echo_id:
        raise HTTPException(404, 'Document not found')
    sections = db.exec(
        select(Memory).where(Memory.echo_id == echo_id, Memory.document_id == document_id)
    ).all()
    for section in sections:
        db.delete(section)
    db.delete(document)
    db.commit()


@router.post('/studio/{echo_id}/memories', status_code=201)
def add_memory(echo_id: UUID, body: MemoryIn, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    own_echo(db, user, echo_id)
    if len(db.exec(select(Memory).where(Memory.echo_id == echo_id)).all()) >= 100:
        raise HTTPException(403, 'Memory limit reached')
    memory = Memory(echo_id=echo_id, **body.model_dump())
    db.add(memory); db.commit(); db.refresh(memory)
    return serialize(memory)

@router.post('/studio/{echo_id}/documents/import', status_code=201)
async def import_document(
    echo_id: UUID,
    request: Request,
    file: UploadFile = File(...),
    visibility: str = Form("private", pattern="^(private|public)$"),
    allow_public: bool = Form(False),
    user: User = Depends(current_user),
    db: Session = Depends(session_dep),
):
    own_echo(db, user, echo_id)
    limit(request, f"document-import:{user.id}", 10, 3600)
    if visibility == "public" and not allow_public:
        raise HTTPException(422, "Public document sharing requires explicit confirmation.")
    title, _ = document_title(file.filename or "")
    try:
        raw = await file.read(MAX_UPLOAD_BYTES + 1)
    finally:
        await file.close()
    content, truncated = extract_document_full(raw, file.filename or "")
    sections = split_document_sections(content)

    # Reserve all memory slots before writing any section; commit together so
    # a capacity error cannot leave behind a partially imported document.
    count = len(db.exec(select(Memory.id).where(Memory.echo_id == echo_id)).all())
    if count + len(sections) > 100:
        raise HTTPException(
            403,
            f"Import requires {len(sections)} memory slots but only {100 - count} remain.",
        )
    document = KnowledgeDocument(
        echo_id=echo_id, title=title, visibility=visibility,
        section_count=len(sections),
    )
    db.add(document)
    db.flush()
    records = []
    for number, section in enumerate(sections, start=1):
        part_title = (f"{title} · part {number}/{len(sections)}"
                      if len(sections) > 1 else title)
        memory = Memory(
            echo_id=echo_id, document_id=document.id, title=part_title,
            content=section, visibility=visibility,
        )
        records.append(memory)
        db.add(memory)
    db.commit()
    db.refresh(document)
    # Returning exact newly created objects avoids timestamp and naming races.
    for memory in records:
        db.refresh(memory)
    return {
        "memory": serialize(records[0]),
        "document": serialize(document),
        "sections": len(sections),
        "truncated": truncated,
        "notice": (
            f"Saved {len(sections)} searchable memory sections. "
            + ("Only the first 30,000 characters were imported. " if truncated else "")
            + "Review imported knowledge and privacy settings before using it."
        ),
    }


@router.patch('/studio/{echo_id}/memories/{memory_id}')
def update_memory(echo_id: UUID, memory_id: UUID, body: MemoryUpdate,
                  user: User = Depends(current_user), db: Session = Depends(session_dep)):
    own_echo(db, user, echo_id)
    memory = db.get(Memory, memory_id)
    if not memory or memory.echo_id != echo_id:
        raise HTTPException(404, 'Memory not found')
    if memory.document_id and body.visibility is not None:
        document = db.get(KnowledgeDocument, memory.document_id)
        if document and body.visibility != document.visibility:
            raise HTTPException(409, 'Change visibility for the whole document in Document Library.')
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(memory, key, value)
    db.add(memory)
    db.commit()
    db.refresh(memory)
    return serialize(memory)

@router.delete('/studio/{echo_id}/memories/{memory_id}', status_code=204)
def remove_memory(echo_id: UUID, memory_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    own_echo(db, user, echo_id)
    memory = db.get(Memory, memory_id)
    if not memory or memory.echo_id != echo_id: raise HTTPException(404, 'Memory not found')
    document = db.get(KnowledgeDocument, memory.document_id) if memory.document_id else None
    db.delete(memory)
    if document:
        remaining = db.exec(
            select(Memory.id).where(
                Memory.echo_id == echo_id, Memory.document_id == document.id,
                Memory.id != memory_id,
            )
        ).all()
        if remaining:
            document.section_count = len(remaining)
            db.add(document)
        else:
            db.delete(document)
    db.commit()

@router.get('/world/discover')
def discover(q: str = '', db: Session = Depends(session_dep)):
    q = q.strip()[:60]
    stmt = select(Echo).where(Echo.is_public == True)
    if q: stmt = stmt.where(or_(Echo.name.ilike(f'%{q}%'), Echo.tagline.ilike(f'%{q}%')))
    return [{'id': str(e.id), 'handle': e.handle, 'name': e.name, 'tagline': e.tagline, 'avatar_color': e.avatar_color, 'avatar_style': e.avatar_style} for e in db.exec(stmt.limit(40)).all()]

@router.post('/world/connections', status_code=201)
def connect(body: ConnectionIn, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    if body.recipient_id == user.id: raise HTTPException(400, 'Cannot connect with yourself')
    if not db.get(User, body.recipient_id): raise HTTPException(404, 'User not found')
    exists = db.exec(select(Connection).where(or_(
        (Connection.requester_id == user.id) & (Connection.recipient_id == body.recipient_id),
        (Connection.requester_id == body.recipient_id) & (Connection.recipient_id == user.id)
    ))).first()
    if exists: raise HTTPException(409, 'Connection already exists')
    c = Connection(requester_id=user.id, recipient_id=body.recipient_id)
    db.add(c); db.commit(); db.refresh(c); return serialize(c)

@router.get('/world/connections')
def connections(user: User = Depends(current_user), db: Session = Depends(session_dep)):
    rows = db.exec(select(Connection).where(or_(Connection.requester_id == user.id, Connection.recipient_id == user.id))).all()
    return [{**serialize(c), 'other_name': db.get(User, c.recipient_id if c.requester_id == user.id else c.requester_id).name} for c in rows]

@router.post('/world/connections/{connection_id}/accept')
def accept(connection_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    c = db.get(Connection, connection_id)
    if not c or c.recipient_id != user.id or c.status != 'pending': raise HTTPException(404, 'Pending invitation not found')
    c.status = 'accepted'; db.add(c); db.commit(); return serialize(c)

@router.delete('/world/connections/{connection_id}', status_code=204)
def disconnect(connection_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    c = db.get(Connection, connection_id)
    if not c or user.id not in (c.requester_id, c.recipient_id): raise HTTPException(404, 'Connection not found')
    db.delete(c); db.commit()

@router.get('/world/communities')
def communities(db: Session = Depends(session_dep)):
    return [serialize(x) for x in db.exec(select(Community).order_by(Community.created_at.desc()).limit(60)).all()]

@router.post('/world/communities', status_code=201)
def create_community(body: CommunityIn, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    if db.exec(select(Community).where(Community.slug == body.slug)).first(): raise HTTPException(409, 'Slug taken')
    c = Community(owner_id=user.id, **body.model_dump()); db.add(c); db.flush()
    db.add(Membership(user_id=user.id, community_id=c.id)); db.commit(); db.refresh(c); return serialize(c)

@router.post('/world/communities/{community_id}/join')
def join(community_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    if not db.get(Community, community_id): raise HTTPException(404, 'Community not found')
    existing = db.exec(select(Membership).where(Membership.community_id == community_id, Membership.user_id == user.id)).first()
    if existing: return {'joined': True}
    db.add(Membership(community_id=community_id, user_id=user.id)); db.commit(); return {'joined': True}

@router.get('/world/communities/{community_id}/posts')
def posts(community_id: UUID, db: Session = Depends(session_dep)):
    if not db.get(Community, community_id): raise HTTPException(404, 'Community not found')
    rows = db.exec(select(Post).where(Post.community_id == community_id).order_by(Post.created_at.desc()).limit(100)).all()
    return [{**serialize(p), 'author': db.get(User, p.user_id).name} for p in rows]

@router.post('/world/communities/{community_id}/posts', status_code=201)
def create_post(community_id: UUID, body: PostIn, request: Request, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    limit(request, 'community-post', 20, 3600)
    if not db.exec(select(Membership).where(Membership.user_id == user.id, Membership.community_id == community_id)).first():
        raise HTTPException(403, 'Join this community first')
    post = Post(user_id=user.id, community_id=community_id, content=body.content)
    db.add(post); db.commit(); db.refresh(post); return serialize(post)

@router.post('/world/agent-introductions', status_code=201)
def propose_introduction(body: ConversationIn, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    own_echo(db, user, body.requester_echo_id)
    target = db.get(Echo, body.recipient_echo_id)
    if target and target.owner_id == user.id:
        raise HTTPException(400, 'You cannot request an introduction to your own ECHO.')
    if not target or not target.is_public: raise HTTPException(404, 'Target ECHO not found')
    c = Conversation(requester_id=user.id, recipient_id=target.owner_id, requester_echo_id=body.requester_echo_id, recipient_echo_id=target.id)
    db.add(c); db.commit(); db.refresh(c); return serialize(c)

@router.get('/world/agent-introductions')
def introductions(user: User = Depends(current_user), db: Session = Depends(session_dep)):
    rows = db.exec(select(Conversation).where(or_(Conversation.requester_id == user.id, Conversation.recipient_id == user.id)).order_by(Conversation.created_at.desc())).all()
    return [serialize(c) for c in rows]

@router.post('/world/agent-introductions/{conversation_id}/approve')
def approve_intro(conversation_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    c = db.get(Conversation, conversation_id)
    if not c or c.recipient_id != user.id or c.status != 'pending': raise HTTPException(404, 'Invitation not found')
    c.status = 'approved'; db.add(c); db.commit(); return serialize(c)

@router.post('/world/agent-introductions/{conversation_id}/run')
def run_intro(conversation_id: UUID, request: Request, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    limit(request, 'intro', 5, 3600)
    c = db.get(Conversation, conversation_id)
    if not c or user.id not in (c.requester_id, c.recipient_id) or c.status != 'approved':
        raise HTTPException(403, 'Both parties must approve before the agents can talk')
    if c.transcript: return serialize(c)
    a, b = db.get(Echo, c.requester_echo_id), db.get(Echo, c.recipient_echo_id)
    # Safe introduction summary: no private knowledge, no autonomous commitments.
    c.transcript = (f'{a.name}: Hello! I am an AI representative. {a.tagline}\n'
                    f'{b.name}: Hello! I am an AI representative. {b.tagline}\n'
                    'ECHO: Your owners can decide whether to continue this introduction.')
    c.status = 'completed'; db.add(c); db.commit(); return serialize(c)

@router.get('/billing/overview')
def billing(user: User = Depends(current_user), db: Session = Depends(session_dep)):
    period = datetime.now(timezone.utc).strftime('%Y-%m')
    u = db.exec(select(Usage).where(Usage.user_id == user.id, Usage.period == period)).first()
    return {'plan': 'free', 'chat_count': u.chat_count if u else 0, 'chat_limit': 100, 'period': period,
            'billing_enabled': False, 'message': 'Billing provider not configured; paid plans are not available.'}
),
    origin: str = Query(default='all', pattern='^(all|document|manual)
def documents(echo_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    own_echo(db, user, echo_id)
    groups = db.exec(
        select(KnowledgeDocument).where(KnowledgeDocument.echo_id == echo_id)
        .order_by(KnowledgeDocument.created_at.desc(), KnowledgeDocument.id.desc())
    ).all()
    return [serialize(group) for group in groups]


@router.patch('/studio/{echo_id}/documents/{document_id}')
def update_document_visibility(
    echo_id: UUID,
    document_id: UUID,
    body: DocumentVisibilityUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(session_dep),
):
    own_echo(db, user, echo_id)
    document = db.get(KnowledgeDocument, document_id)
    if not document or document.echo_id != echo_id:
        raise HTTPException(404, 'Document not found')
    if body.visibility == 'public' and not body.allow_public:
        raise HTTPException(422, 'Public document sharing requires explicit confirmation.')
    sections = db.exec(
        select(Memory).where(Memory.echo_id == echo_id, Memory.document_id == document_id)
    ).all()
    document.visibility = body.visibility
    for section in sections:
        section.visibility = body.visibility
        db.add(section)
    db.add(document)
    db.commit()
    db.refresh(document)
    return serialize(document)


@router.delete('/studio/{echo_id}/documents/{document_id}', status_code=204)
def delete_document(
    echo_id: UUID,
    document_id: UUID,
    user: User = Depends(current_user),
    db: Session = Depends(session_dep),
):
    own_echo(db, user, echo_id)
    document = db.get(KnowledgeDocument, document_id)
    if not document or document.echo_id != echo_id:
        raise HTTPException(404, 'Document not found')
    sections = db.exec(
        select(Memory).where(Memory.echo_id == echo_id, Memory.document_id == document_id)
    ).all()
    for section in sections:
        db.delete(section)
    db.delete(document)
    db.commit()


@router.post('/studio/{echo_id}/memories', status_code=201)
def add_memory(echo_id: UUID, body: MemoryIn, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    own_echo(db, user, echo_id)
    if len(db.exec(select(Memory).where(Memory.echo_id == echo_id)).all()) >= 100:
        raise HTTPException(403, 'Memory limit reached')
    memory = Memory(echo_id=echo_id, **body.model_dump())
    db.add(memory); db.commit(); db.refresh(memory)
    return serialize(memory)

@router.post('/studio/{echo_id}/documents/import', status_code=201)
async def import_document(
    echo_id: UUID,
    request: Request,
    file: UploadFile = File(...),
    visibility: str = Form("private", pattern="^(private|public)$"),
    allow_public: bool = Form(False),
    user: User = Depends(current_user),
    db: Session = Depends(session_dep),
):
    own_echo(db, user, echo_id)
    limit(request, f"document-import:{user.id}", 10, 3600)
    if visibility == "public" and not allow_public:
        raise HTTPException(422, "Public document sharing requires explicit confirmation.")
    title, _ = document_title(file.filename or "")
    try:
        raw = await file.read(MAX_UPLOAD_BYTES + 1)
    finally:
        await file.close()
    content, truncated = extract_document_full(raw, file.filename or "")
    sections = split_document_sections(content)

    # Reserve all memory slots before writing any section; commit together so
    # a capacity error cannot leave behind a partially imported document.
    count = len(db.exec(select(Memory.id).where(Memory.echo_id == echo_id)).all())
    if count + len(sections) > 100:
        raise HTTPException(
            403,
            f"Import requires {len(sections)} memory slots but only {100 - count} remain.",
        )
    document = KnowledgeDocument(
        echo_id=echo_id, title=title, visibility=visibility,
        section_count=len(sections),
    )
    db.add(document)
    db.flush()
    records = []
    for number, section in enumerate(sections, start=1):
        part_title = (f"{title} · part {number}/{len(sections)}"
                      if len(sections) > 1 else title)
        memory = Memory(
            echo_id=echo_id, document_id=document.id, title=part_title,
            content=section, visibility=visibility,
        )
        records.append(memory)
        db.add(memory)
    db.commit()
    db.refresh(document)
    # Returning exact newly created objects avoids timestamp and naming races.
    for memory in records:
        db.refresh(memory)
    return {
        "memory": serialize(records[0]),
        "document": serialize(document),
        "sections": len(sections),
        "truncated": truncated,
        "notice": (
            f"Saved {len(sections)} searchable memory sections. "
            + ("Only the first 30,000 characters were imported. " if truncated else "")
            + "Review imported knowledge and privacy settings before using it."
        ),
    }


@router.patch('/studio/{echo_id}/memories/{memory_id}')
def update_memory(echo_id: UUID, memory_id: UUID, body: MemoryUpdate,
                  user: User = Depends(current_user), db: Session = Depends(session_dep)):
    own_echo(db, user, echo_id)
    memory = db.get(Memory, memory_id)
    if not memory or memory.echo_id != echo_id:
        raise HTTPException(404, 'Memory not found')
    if memory.document_id and body.visibility is not None:
        document = db.get(KnowledgeDocument, memory.document_id)
        if document and body.visibility != document.visibility:
            raise HTTPException(409, 'Change visibility for the whole document in Document Library.')
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(memory, key, value)
    db.add(memory)
    db.commit()
    db.refresh(memory)
    return serialize(memory)

@router.delete('/studio/{echo_id}/memories/{memory_id}', status_code=204)
def remove_memory(echo_id: UUID, memory_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    own_echo(db, user, echo_id)
    memory = db.get(Memory, memory_id)
    if not memory or memory.echo_id != echo_id: raise HTTPException(404, 'Memory not found')
    document = db.get(KnowledgeDocument, memory.document_id) if memory.document_id else None
    db.delete(memory)
    if document:
        remaining = db.exec(
            select(Memory.id).where(
                Memory.echo_id == echo_id, Memory.document_id == document.id,
                Memory.id != memory_id,
            )
        ).all()
        if remaining:
            document.section_count = len(remaining)
            db.add(document)
        else:
            db.delete(document)
    db.commit()

@router.get('/world/discover')
def discover(q: str = '', db: Session = Depends(session_dep)):
    q = q.strip()[:60]
    stmt = select(Echo).where(Echo.is_public == True)
    if q: stmt = stmt.where(or_(Echo.name.ilike(f'%{q}%'), Echo.tagline.ilike(f'%{q}%')))
    return [{'id': str(e.id), 'handle': e.handle, 'name': e.name, 'tagline': e.tagline, 'avatar_color': e.avatar_color, 'avatar_style': e.avatar_style} for e in db.exec(stmt.limit(40)).all()]

@router.post('/world/connections', status_code=201)
def connect(body: ConnectionIn, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    if body.recipient_id == user.id: raise HTTPException(400, 'Cannot connect with yourself')
    if not db.get(User, body.recipient_id): raise HTTPException(404, 'User not found')
    exists = db.exec(select(Connection).where(or_(
        (Connection.requester_id == user.id) & (Connection.recipient_id == body.recipient_id),
        (Connection.requester_id == body.recipient_id) & (Connection.recipient_id == user.id)
    ))).first()
    if exists: raise HTTPException(409, 'Connection already exists')
    c = Connection(requester_id=user.id, recipient_id=body.recipient_id)
    db.add(c); db.commit(); db.refresh(c); return serialize(c)

@router.get('/world/connections')
def connections(user: User = Depends(current_user), db: Session = Depends(session_dep)):
    rows = db.exec(select(Connection).where(or_(Connection.requester_id == user.id, Connection.recipient_id == user.id))).all()
    return [{**serialize(c), 'other_name': db.get(User, c.recipient_id if c.requester_id == user.id else c.requester_id).name} for c in rows]

@router.post('/world/connections/{connection_id}/accept')
def accept(connection_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    c = db.get(Connection, connection_id)
    if not c or c.recipient_id != user.id or c.status != 'pending': raise HTTPException(404, 'Pending invitation not found')
    c.status = 'accepted'; db.add(c); db.commit(); return serialize(c)

@router.delete('/world/connections/{connection_id}', status_code=204)
def disconnect(connection_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    c = db.get(Connection, connection_id)
    if not c or user.id not in (c.requester_id, c.recipient_id): raise HTTPException(404, 'Connection not found')
    db.delete(c); db.commit()

@router.get('/world/communities')
def communities(db: Session = Depends(session_dep)):
    return [serialize(x) for x in db.exec(select(Community).order_by(Community.created_at.desc()).limit(60)).all()]

@router.post('/world/communities', status_code=201)
def create_community(body: CommunityIn, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    if db.exec(select(Community).where(Community.slug == body.slug)).first(): raise HTTPException(409, 'Slug taken')
    c = Community(owner_id=user.id, **body.model_dump()); db.add(c); db.flush()
    db.add(Membership(user_id=user.id, community_id=c.id)); db.commit(); db.refresh(c); return serialize(c)

@router.post('/world/communities/{community_id}/join')
def join(community_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    if not db.get(Community, community_id): raise HTTPException(404, 'Community not found')
    existing = db.exec(select(Membership).where(Membership.community_id == community_id, Membership.user_id == user.id)).first()
    if existing: return {'joined': True}
    db.add(Membership(community_id=community_id, user_id=user.id)); db.commit(); return {'joined': True}

@router.get('/world/communities/{community_id}/posts')
def posts(community_id: UUID, db: Session = Depends(session_dep)):
    if not db.get(Community, community_id): raise HTTPException(404, 'Community not found')
    rows = db.exec(select(Post).where(Post.community_id == community_id).order_by(Post.created_at.desc()).limit(100)).all()
    return [{**serialize(p), 'author': db.get(User, p.user_id).name} for p in rows]

@router.post('/world/communities/{community_id}/posts', status_code=201)
def create_post(community_id: UUID, body: PostIn, request: Request, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    limit(request, 'community-post', 20, 3600)
    if not db.exec(select(Membership).where(Membership.user_id == user.id, Membership.community_id == community_id)).first():
        raise HTTPException(403, 'Join this community first')
    post = Post(user_id=user.id, community_id=community_id, content=body.content)
    db.add(post); db.commit(); db.refresh(post); return serialize(post)

@router.post('/world/agent-introductions', status_code=201)
def propose_introduction(body: ConversationIn, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    own_echo(db, user, body.requester_echo_id)
    target = db.get(Echo, body.recipient_echo_id)
    if target and target.owner_id == user.id:
        raise HTTPException(400, 'You cannot request an introduction to your own ECHO.')
    if not target or not target.is_public: raise HTTPException(404, 'Target ECHO not found')
    c = Conversation(requester_id=user.id, recipient_id=target.owner_id, requester_echo_id=body.requester_echo_id, recipient_echo_id=target.id)
    db.add(c); db.commit(); db.refresh(c); return serialize(c)

@router.get('/world/agent-introductions')
def introductions(user: User = Depends(current_user), db: Session = Depends(session_dep)):
    rows = db.exec(select(Conversation).where(or_(Conversation.requester_id == user.id, Conversation.recipient_id == user.id)).order_by(Conversation.created_at.desc())).all()
    return [serialize(c) for c in rows]

@router.post('/world/agent-introductions/{conversation_id}/approve')
def approve_intro(conversation_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    c = db.get(Conversation, conversation_id)
    if not c or c.recipient_id != user.id or c.status != 'pending': raise HTTPException(404, 'Invitation not found')
    c.status = 'approved'; db.add(c); db.commit(); return serialize(c)

@router.post('/world/agent-introductions/{conversation_id}/run')
def run_intro(conversation_id: UUID, request: Request, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    limit(request, 'intro', 5, 3600)
    c = db.get(Conversation, conversation_id)
    if not c or user.id not in (c.requester_id, c.recipient_id) or c.status != 'approved':
        raise HTTPException(403, 'Both parties must approve before the agents can talk')
    if c.transcript: return serialize(c)
    a, b = db.get(Echo, c.requester_echo_id), db.get(Echo, c.recipient_echo_id)
    # Safe introduction summary: no private knowledge, no autonomous commitments.
    c.transcript = (f'{a.name}: Hello! I am an AI representative. {a.tagline}\n'
                    f'{b.name}: Hello! I am an AI representative. {b.tagline}\n'
                    'ECHO: Your owners can decide whether to continue this introduction.')
    c.status = 'completed'; db.add(c); db.commit(); return serialize(c)

@router.get('/billing/overview')
def billing(user: User = Depends(current_user), db: Session = Depends(session_dep)):
    period = datetime.now(timezone.utc).strftime('%Y-%m')
    u = db.exec(select(Usage).where(Usage.user_id == user.id, Usage.period == period)).first()
    return {'plan': 'free', 'chat_count': u.chat_count if u else 0, 'chat_limit': 100, 'period': period,
            'billing_enabled': False, 'message': 'Billing provider not configured; paid plans are not available.'}
),
    user: User = Depends(current_user),
    db: Session = Depends(session_dep),
):
    # Never expose private memory contents to a public or unauthenticated query.
    own_echo(db, user, echo_id)
    if not q.strip():
        return []
    rows = db.exec(select(Memory).where(Memory.echo_id == echo_id)).all()
    hits = search_memories(rows, q, visibility=visibility, origin=origin)
    return [
        {
            'id': str(hit.id), 'title': hit.title, 'visibility': hit.visibility,
            'document_id': str(hit.document_id) if hit.document_id else None,
            'snippet': hit.snippet,
        }
        for hit in hits
    ]


@router.get('/studio/{echo_id}/documents')
def documents(echo_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    own_echo(db, user, echo_id)
    groups = db.exec(
        select(KnowledgeDocument).where(KnowledgeDocument.echo_id == echo_id)
        .order_by(KnowledgeDocument.created_at.desc(), KnowledgeDocument.id.desc())
    ).all()
    return [serialize(group) for group in groups]


@router.patch('/studio/{echo_id}/documents/{document_id}')
def update_document_visibility(
    echo_id: UUID,
    document_id: UUID,
    body: DocumentVisibilityUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(session_dep),
):
    own_echo(db, user, echo_id)
    document = db.get(KnowledgeDocument, document_id)
    if not document or document.echo_id != echo_id:
        raise HTTPException(404, 'Document not found')
    if body.visibility == 'public' and not body.allow_public:
        raise HTTPException(422, 'Public document sharing requires explicit confirmation.')
    sections = db.exec(
        select(Memory).where(Memory.echo_id == echo_id, Memory.document_id == document_id)
    ).all()
    document.visibility = body.visibility
    for section in sections:
        section.visibility = body.visibility
        db.add(section)
    db.add(document)
    db.commit()
    db.refresh(document)
    return serialize(document)


@router.delete('/studio/{echo_id}/documents/{document_id}', status_code=204)
def delete_document(
    echo_id: UUID,
    document_id: UUID,
    user: User = Depends(current_user),
    db: Session = Depends(session_dep),
):
    own_echo(db, user, echo_id)
    document = db.get(KnowledgeDocument, document_id)
    if not document or document.echo_id != echo_id:
        raise HTTPException(404, 'Document not found')
    sections = db.exec(
        select(Memory).where(Memory.echo_id == echo_id, Memory.document_id == document_id)
    ).all()
    for section in sections:
        db.delete(section)
    db.delete(document)
    db.commit()


@router.post('/studio/{echo_id}/memories', status_code=201)
def add_memory(echo_id: UUID, body: MemoryIn, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    own_echo(db, user, echo_id)
    if len(db.exec(select(Memory).where(Memory.echo_id == echo_id)).all()) >= 100:
        raise HTTPException(403, 'Memory limit reached')
    memory = Memory(echo_id=echo_id, **body.model_dump())
    db.add(memory); db.commit(); db.refresh(memory)
    return serialize(memory)

@router.post('/studio/{echo_id}/documents/import', status_code=201)
async def import_document(
    echo_id: UUID,
    request: Request,
    file: UploadFile = File(...),
    visibility: str = Form("private", pattern="^(private|public)$"),
    allow_public: bool = Form(False),
    user: User = Depends(current_user),
    db: Session = Depends(session_dep),
):
    own_echo(db, user, echo_id)
    limit(request, f"document-import:{user.id}", 10, 3600)
    if visibility == "public" and not allow_public:
        raise HTTPException(422, "Public document sharing requires explicit confirmation.")
    title, _ = document_title(file.filename or "")
    try:
        raw = await file.read(MAX_UPLOAD_BYTES + 1)
    finally:
        await file.close()
    content, truncated = extract_document_full(raw, file.filename or "")
    sections = split_document_sections(content)

    # Reserve all memory slots before writing any section; commit together so
    # a capacity error cannot leave behind a partially imported document.
    count = len(db.exec(select(Memory.id).where(Memory.echo_id == echo_id)).all())
    if count + len(sections) > 100:
        raise HTTPException(
            403,
            f"Import requires {len(sections)} memory slots but only {100 - count} remain.",
        )
    document = KnowledgeDocument(
        echo_id=echo_id, title=title, visibility=visibility,
        section_count=len(sections),
    )
    db.add(document)
    db.flush()
    records = []
    for number, section in enumerate(sections, start=1):
        part_title = (f"{title} · part {number}/{len(sections)}"
                      if len(sections) > 1 else title)
        memory = Memory(
            echo_id=echo_id, document_id=document.id, title=part_title,
            content=section, visibility=visibility,
        )
        records.append(memory)
        db.add(memory)
    db.commit()
    db.refresh(document)
    # Returning exact newly created objects avoids timestamp and naming races.
    for memory in records:
        db.refresh(memory)
    return {
        "memory": serialize(records[0]),
        "document": serialize(document),
        "sections": len(sections),
        "truncated": truncated,
        "notice": (
            f"Saved {len(sections)} searchable memory sections. "
            + ("Only the first 30,000 characters were imported. " if truncated else "")
            + "Review imported knowledge and privacy settings before using it."
        ),
    }


@router.patch('/studio/{echo_id}/memories/{memory_id}')
def update_memory(echo_id: UUID, memory_id: UUID, body: MemoryUpdate,
                  user: User = Depends(current_user), db: Session = Depends(session_dep)):
    own_echo(db, user, echo_id)
    memory = db.get(Memory, memory_id)
    if not memory or memory.echo_id != echo_id:
        raise HTTPException(404, 'Memory not found')
    if memory.document_id and body.visibility is not None:
        document = db.get(KnowledgeDocument, memory.document_id)
        if document and body.visibility != document.visibility:
            raise HTTPException(409, 'Change visibility for the whole document in Document Library.')
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(memory, key, value)
    db.add(memory)
    db.commit()
    db.refresh(memory)
    return serialize(memory)

@router.delete('/studio/{echo_id}/memories/{memory_id}', status_code=204)
def remove_memory(echo_id: UUID, memory_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    own_echo(db, user, echo_id)
    memory = db.get(Memory, memory_id)
    if not memory or memory.echo_id != echo_id: raise HTTPException(404, 'Memory not found')
    document = db.get(KnowledgeDocument, memory.document_id) if memory.document_id else None
    db.delete(memory)
    if document:
        remaining = db.exec(
            select(Memory.id).where(
                Memory.echo_id == echo_id, Memory.document_id == document.id,
                Memory.id != memory_id,
            )
        ).all()
        if remaining:
            document.section_count = len(remaining)
            db.add(document)
        else:
            db.delete(document)
    db.commit()

@router.get('/world/discover')
def discover(q: str = '', db: Session = Depends(session_dep)):
    q = q.strip()[:60]
    stmt = select(Echo).where(Echo.is_public == True)
    if q: stmt = stmt.where(or_(Echo.name.ilike(f'%{q}%'), Echo.tagline.ilike(f'%{q}%')))
    return [{'id': str(e.id), 'handle': e.handle, 'name': e.name, 'tagline': e.tagline, 'avatar_color': e.avatar_color, 'avatar_style': e.avatar_style} for e in db.exec(stmt.limit(40)).all()]

@router.post('/world/connections', status_code=201)
def connect(body: ConnectionIn, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    if body.recipient_id == user.id: raise HTTPException(400, 'Cannot connect with yourself')
    if not db.get(User, body.recipient_id): raise HTTPException(404, 'User not found')
    exists = db.exec(select(Connection).where(or_(
        (Connection.requester_id == user.id) & (Connection.recipient_id == body.recipient_id),
        (Connection.requester_id == body.recipient_id) & (Connection.recipient_id == user.id)
    ))).first()
    if exists: raise HTTPException(409, 'Connection already exists')
    c = Connection(requester_id=user.id, recipient_id=body.recipient_id)
    db.add(c); db.commit(); db.refresh(c); return serialize(c)

@router.get('/world/connections')
def connections(user: User = Depends(current_user), db: Session = Depends(session_dep)):
    rows = db.exec(select(Connection).where(or_(Connection.requester_id == user.id, Connection.recipient_id == user.id))).all()
    return [{**serialize(c), 'other_name': db.get(User, c.recipient_id if c.requester_id == user.id else c.requester_id).name} for c in rows]

@router.post('/world/connections/{connection_id}/accept')
def accept(connection_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    c = db.get(Connection, connection_id)
    if not c or c.recipient_id != user.id or c.status != 'pending': raise HTTPException(404, 'Pending invitation not found')
    c.status = 'accepted'; db.add(c); db.commit(); return serialize(c)

@router.delete('/world/connections/{connection_id}', status_code=204)
def disconnect(connection_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    c = db.get(Connection, connection_id)
    if not c or user.id not in (c.requester_id, c.recipient_id): raise HTTPException(404, 'Connection not found')
    db.delete(c); db.commit()

@router.get('/world/communities')
def communities(db: Session = Depends(session_dep)):
    return [serialize(x) for x in db.exec(select(Community).order_by(Community.created_at.desc()).limit(60)).all()]

@router.post('/world/communities', status_code=201)
def create_community(body: CommunityIn, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    if db.exec(select(Community).where(Community.slug == body.slug)).first(): raise HTTPException(409, 'Slug taken')
    c = Community(owner_id=user.id, **body.model_dump()); db.add(c); db.flush()
    db.add(Membership(user_id=user.id, community_id=c.id)); db.commit(); db.refresh(c); return serialize(c)

@router.post('/world/communities/{community_id}/join')
def join(community_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    if not db.get(Community, community_id): raise HTTPException(404, 'Community not found')
    existing = db.exec(select(Membership).where(Membership.community_id == community_id, Membership.user_id == user.id)).first()
    if existing: return {'joined': True}
    db.add(Membership(community_id=community_id, user_id=user.id)); db.commit(); return {'joined': True}

@router.get('/world/communities/{community_id}/posts')
def posts(community_id: UUID, db: Session = Depends(session_dep)):
    if not db.get(Community, community_id): raise HTTPException(404, 'Community not found')
    rows = db.exec(select(Post).where(Post.community_id == community_id).order_by(Post.created_at.desc()).limit(100)).all()
    return [{**serialize(p), 'author': db.get(User, p.user_id).name} for p in rows]

@router.post('/world/communities/{community_id}/posts', status_code=201)
def create_post(community_id: UUID, body: PostIn, request: Request, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    limit(request, 'community-post', 20, 3600)
    if not db.exec(select(Membership).where(Membership.user_id == user.id, Membership.community_id == community_id)).first():
        raise HTTPException(403, 'Join this community first')
    post = Post(user_id=user.id, community_id=community_id, content=body.content)
    db.add(post); db.commit(); db.refresh(post); return serialize(post)

@router.post('/world/agent-introductions', status_code=201)
def propose_introduction(body: ConversationIn, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    own_echo(db, user, body.requester_echo_id)
    target = db.get(Echo, body.recipient_echo_id)
    if target and target.owner_id == user.id:
        raise HTTPException(400, 'You cannot request an introduction to your own ECHO.')
    if not target or not target.is_public: raise HTTPException(404, 'Target ECHO not found')
    c = Conversation(requester_id=user.id, recipient_id=target.owner_id, requester_echo_id=body.requester_echo_id, recipient_echo_id=target.id)
    db.add(c); db.commit(); db.refresh(c); return serialize(c)

@router.get('/world/agent-introductions')
def introductions(user: User = Depends(current_user), db: Session = Depends(session_dep)):
    rows = db.exec(select(Conversation).where(or_(Conversation.requester_id == user.id, Conversation.recipient_id == user.id)).order_by(Conversation.created_at.desc())).all()
    return [serialize(c) for c in rows]

@router.post('/world/agent-introductions/{conversation_id}/approve')
def approve_intro(conversation_id: UUID, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    c = db.get(Conversation, conversation_id)
    if not c or c.recipient_id != user.id or c.status != 'pending': raise HTTPException(404, 'Invitation not found')
    c.status = 'approved'; db.add(c); db.commit(); return serialize(c)

@router.post('/world/agent-introductions/{conversation_id}/run')
def run_intro(conversation_id: UUID, request: Request, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    limit(request, 'intro', 5, 3600)
    c = db.get(Conversation, conversation_id)
    if not c or user.id not in (c.requester_id, c.recipient_id) or c.status != 'approved':
        raise HTTPException(403, 'Both parties must approve before the agents can talk')
    if c.transcript: return serialize(c)
    a, b = db.get(Echo, c.requester_echo_id), db.get(Echo, c.recipient_echo_id)
    # Safe introduction summary: no private knowledge, no autonomous commitments.
    c.transcript = (f'{a.name}: Hello! I am an AI representative. {a.tagline}\n'
                    f'{b.name}: Hello! I am an AI representative. {b.tagline}\n'
                    'ECHO: Your owners can decide whether to continue this introduction.')
    c.status = 'completed'; db.add(c); db.commit(); return serialize(c)

@router.get('/billing/overview')
def billing(user: User = Depends(current_user), db: Session = Depends(session_dep)):
    period = datetime.now(timezone.utc).strftime('%Y-%m')
    u = db.exec(select(Usage).where(Usage.user_id == user.id, Usage.period == period)).first()
    return {'plan': 'free', 'chat_count': u.chat_count if u else 0, 'chat_limit': 100, 'period': period,
            'billing_enabled': False, 'message': 'Billing provider not configured; paid plans are not available.'}
