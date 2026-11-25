"""Shared rooms, and consent-controlled agent dialogues."""
import asyncio
import json
import secrets
from collections import defaultdict
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlmodel import Session, select
from app.core.db import session_dep, engine
from app.core.auth import current_user
from app.core.ai import reply
from app.api.schemas import ChatRequest
from app.models.entities import User, Echo, Conversation, WorldRoom, Connection

router = APIRouter()

class RoomIn(BaseModel):
    name: str = Field(min_length=3, max_length=100)

@router.get('/world/rooms')
def rooms(user: User = Depends(current_user), db: Session = Depends(session_dep)):
    return [room_public(r) for r in db.exec(select(WorldRoom).order_by(WorldRoom.created_at.desc()).limit(50)).all() if room_allowed(db, r, user.id)]

@router.post('/world/rooms', status_code=201)
def create_room(body: RoomIn, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    r = WorldRoom(owner_id=user.id, name=body.name, access_code=secrets.token_urlsafe(9))
    db.add(r); db.commit(); db.refresh(r)
    return room_public(r)

def room_public(room: WorldRoom) -> dict:
    return {"id": str(room.id), "name": room.name, "owner_id": str(room.owner_id), "created_at": room.created_at.isoformat()}

def room_allowed(db: Session, room: WorldRoom, user_id: UUID) -> bool:
    if room.owner_id == user_id:
        return True
    return db.exec(select(Connection).where(Connection.status == 'accepted').where(
        ((Connection.requester_id == room.owner_id) & (Connection.recipient_id == user_id)) |
        ((Connection.recipient_id == room.owner_id) & (Connection.requester_id == user_id))
    )).first() is not None

# Process-local sockets: use one backend worker for this MVP; use Redis pub/sub at scale.
clients: dict[str, set[WebSocket]] = defaultdict(set)
presence: dict[str, dict[str, dict]] = defaultdict(dict)
room_sockets: dict[str, dict[str, WebSocket]] = defaultdict(dict)

async def relay_voice_signal(room_key: str, sender_id: str, target_id: object, signal: object) -> bool:
    if not isinstance(target_id, str) or target_id == sender_id or len(target_id) > 32:
        return False
    if sender_id not in room_sockets[room_key] or target_id not in presence[room_key]:
        return False
    if not isinstance(signal, dict) or signal.get('type') not in {'offer', 'answer', 'candidate'}:
        return False
    try:
        if len(json.dumps(signal, separators=(',', ':'))) > 20000:
            return False
    except (TypeError, ValueError):
        return False
    if signal['type'] in {'offer', 'answer'}:
        if not isinstance(signal.get('sdp'), str) or len(signal['sdp']) > 16000:
            return False
    else:
        candidate = signal.get('candidate')
        if not isinstance(candidate, dict) or not isinstance(candidate.get('candidate'), str):
            return False
        if len(candidate['candidate']) > 4096:
            return False
    target_socket = room_sockets[room_key].get(target_id)
    if target_socket is None:
        return False
    await target_socket.send_json({
        'type': 'voice-signal',
        'from': sender_id,
        'signal': signal,
    })
    return True

@router.websocket('/world/rooms/{room_id}/live')
async def live_room(ws: WebSocket, room_id: UUID):
    # WebSocket origin and cookie checks are required because HTTP middleware does not guard WS.
    from app.core.config import settings
    from jwt import decode, PyJWTError
    origin = ws.headers.get('origin')
    if origin != settings().FRONTEND_URL:
        await ws.close(code=1008); return
    token = ws.cookies.get('echo_session')
    try:
        payload = decode(token or '', settings().JWT_SECRET_KEY, algorithms=['HS256'])
        identity = UUID(payload['sub'])
    except (PyJWTError, KeyError, ValueError):
        await ws.close(code=1008); return
    with Session(engine) as db:
        room = db.get(WorldRoom, room_id)
        user = db.get(User, identity)
        if not room or not user or not room_allowed(db, room, identity) or payload.get('sv') != user.session_version:
            await ws.close(code=1008); return
        display_name = user.name[:80]
    await ws.accept()
    key = str(room_id); clients[key].add(ws)
    participant_id = secrets.token_hex(8)
    room_sockets[key][participant_id] = ws
    presence[key][participant_id] = {'id':participant_id,'name':display_name,'x':0,'z':0,'color':'#42d6e7'}
    try:
        await ws.send_json({'type':'welcome','participant_id':participant_id,'participants':list(presence[key].values())})
        await broadcast(key, {'type':'join','participant':presence[key][participant_id]})
        while True:
            data = await ws.receive_json()
            if not isinstance(data, dict): continue
            if data.get('type') == 'move':
                try:
                    x, z = float(data.get('x',0)), float(data.get('z',0))
                    if not (-20 <= x <= 20 and -20 <= z <= 20): continue
                except (ValueError, TypeError): continue
                presence[key][participant_id].update(x=x,z=z)
                await broadcast(key, {'type':'move','id':participant_id,'x':x,'z':z})
                continue
            if data.get('type') == 'voice-state':
                speaking = data.get('speaking')
                muted = data.get('muted')
                if not isinstance(speaking, bool) or not isinstance(muted, bool):
                    continue
                state = {'speaking': speaking and not muted, 'muted': muted}
                presence[key][participant_id].update(state)
                await broadcast(key, {'type':'voice-state','id':participant_id, **state})
                continue
            if data.get('type') == 'voice-signal':
                await relay_voice_signal(key, participant_id, data.get('target'), data.get('signal'))
                continue
            if data.get('type') != 'chat': continue
            message = str(data.get('message', '')).strip()[:500]
            if not message: continue
            event = {'type':'chat','name':display_name,'message':message}
            await broadcast(key, event)
    except WebSocketDisconnect: pass
    finally:
        clients[key].discard(ws)
        room_sockets[key].pop(participant_id, None)
        presence[key].pop(participant_id, None)
        if not clients[key]:
            clients.pop(key, None)
            room_sockets.pop(key, None)
            presence.pop(key, None)
        else:
            await broadcast(key, {'type':'leave','id':participant_id})

async def broadcast(key: str, event: dict):
    for peer in list(clients[key]):
        try: await peer.send_json(event)
        except Exception: clients[key].discard(peer)

@router.post('/world/agent-introductions/{conversation_id}/dialogue')
async def agent_dialogue(conversation_id: UUID, request: Request, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    from app.core.limit import limit
    limit(request, 'agent-dialogue', 3, 3600)
    c = db.get(Conversation, conversation_id)
    if not c or user.id not in (c.requester_id, c.recipient_id) or c.status != 'approved':
        raise HTTPException(403, 'Both owners must approve the introduction first')
    if c.transcript: return c.model_dump(mode='json')
    a, b = db.get(Echo, c.requester_echo_id), db.get(Echo, c.recipient_echo_id)
    if not a or not b or not a.is_public or not b.is_public:
        raise HTTPException(400, 'Both ECHOs must be public')
    # Only public knowledge is passed, no private memories or personal data.
    prompt = 'Introduce your professional interests and ask one collaboration question. Never promise anything or claim to be human.'
    transcript = []
    for speaker, listener in [(a,b),(b,a),(a,b),(b,a)]:
        history = [{'role':'user','content': f'{x["name"]}: {x["message"]}'} for x in transcript[-3:]]
        result = await reply(speaker, ChatRequest(message=f'You are speaking to the AI representative {listener.name}. {prompt}', history=history), public=True)
        transcript.append({'name':speaker.name + ' (AI)', 'message':result.reply[:1200]})
    c.transcript = '\n'.join(f'{x["name"]}: {x["message"]}' for x in transcript)
    c.status = 'completed'; db.add(c); db.commit(); db.refresh(c)
    return c.model_dump(mode='json')
