from app.models.entities import Memory, Community, Conversation, Usage
from app.api.immersive import presence, room_sockets, relay_voice_signal
from app.api.world import ConversationIn, propose_introduction
from app.models.entities import Echo, User
from fastapi import HTTPException
from uuid import uuid4
import asyncio

def test_memory_is_private_by_default():
    from uuid import uuid4
    m = Memory(echo_id=uuid4(), title='Skill', content='Python')
    assert m.visibility == 'private'

def test_introductions_require_approval_by_default():
    from uuid import uuid4
    c = Conversation(requester_id=uuid4(), recipient_id=uuid4(), requester_echo_id=uuid4(), recipient_echo_id=uuid4())
    assert c.status == 'pending'

def test_own_echo_cannot_be_an_introduction_target():
    user_id = uuid4()
    echo = Echo(
        id=uuid4(), owner_id=user_id, handle='own-echo', name='Own ECHO',
        is_public=True,
    )
    user = User(id=user_id, email='owner@example.com', name='Owner', password_hash='unused')

    class FakeSession:
        def get(self, model, item_id):
            return echo if model is Echo and item_id == echo.id else None

    request = ConversationIn(requester_echo_id=echo.id, recipient_echo_id=echo.id)
    try:
        propose_introduction(request, user, FakeSession())
    except HTTPException as error:
        assert error.status_code == 400
        assert error.detail == 'You cannot request an introduction to your own ECHO.'
    else:
        raise AssertionError('An ECHO owner must not be able to introduce their ECHO to itself')

def test_usage_starts_free():
    from uuid import uuid4
    u = Usage(user_id=uuid4(), period='2026-11')
    assert u.plan == 'free' and u.chat_count == 0

def test_voice_signals_are_relayed_only_to_current_room_participants():
    class Socket:
        def __init__(self):
            self.messages = []

        async def send_json(self, message):
            self.messages.append(message)

    room, sender, target = 'voice-test-room', 'sender-id', 'target-id'
    recipient = Socket()
    room_sockets[room] = {sender: Socket(), target: recipient}
    presence[room] = {sender: {}, target: {}}

    relayed = asyncio.run(relay_voice_signal(
        room, sender, target, {'type': 'offer', 'sdp': 'session-description'},
    ))

    assert relayed is True
    assert recipient.messages == [{
        'type': 'voice-signal',
        'from': sender,
        'signal': {'type': 'offer', 'sdp': 'session-description'},
    }]
    room_sockets.pop(room)
    presence.pop(room)

def test_voice_signal_rejects_nonmembers_and_oversized_sdp():
    class Socket:
        async def send_json(self, message):
            raise AssertionError('No signal should be sent')

    room, sender, target = 'voice-test-invalid', 'sender-id', 'target-id'
    room_sockets[room] = {sender: Socket(), target: Socket()}
    presence[room] = {sender: {}, target: {}}
    try:
        outsider = asyncio.run(relay_voice_signal(
            room, sender, 'not-in-room', {'type': 'offer', 'sdp': 'valid'},
        ))
        oversized = asyncio.run(relay_voice_signal(
            room, sender, target, {'type': 'offer', 'sdp': 'x' * 16001},
        ))
    finally:
        room_sockets.pop(room)
        presence.pop(room)

    assert outsider is False
    assert oversized is False
