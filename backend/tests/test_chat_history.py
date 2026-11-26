"""Owner chat persistence and privacy tests (no external AI provider)."""
import asyncio
from uuid import uuid4

import pytest
from fastapi import HTTPException, Request
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool

import app.api.routes as routes
from app.api.schemas import ChatRequest, ChatResponse
from app.models.entities import ChatTurn, Echo, Memory, User


def request():
    return Request({
        "type": "http", "method": "POST",
        "path": "/api/v1/echoes/test/chat", "headers": [],
        "client": ("127.0.0.1", 1234),
    })


def make_db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def test_chat_history_is_owner_only_and_deletable():
    with make_db() as db:
        owner = User(id=uuid4(), email="owner@example.com", name="Owner", password_hash="unused")
        other = User(id=uuid4(), email="other@example.com", name="Other", password_hash="unused")
        echo = Echo(owner_id=owner.id, handle="private-test", name="Private Test")
        db.add_all([owner, other, echo])
        db.commit()
        turn = ChatTurn(
            echo_id=echo.id, owner_id=owner.id,
            user_message="Private owner question", assistant_message="Private answer",
        )
        db.add(turn)
        db.commit()

        result = routes.owner_chat_history(echo.id, owner, db)
        assert len(result) == 1
        assert result[0]["user_message"] == "Private owner question"

        with pytest.raises(HTTPException) as exception:
            routes.owner_chat_history(echo.id, other, db)
        assert exception.value.status_code == 404
        with pytest.raises(HTTPException):
            routes.clear_owner_chat_history(echo.id, other, db)

        routes.clear_owner_chat_history(echo.id, owner, db)
        assert routes.owner_chat_history(echo.id, owner, db) == []


def test_owner_chat_persists_only_after_success(monkeypatch):
    monkeypatch.setattr(routes, "limit", lambda *args: None)
    with make_db() as db:
        owner = User(id=uuid4(), email="owner2@example.com", name="Owner", password_hash="unused")
        echo = Echo(owner_id=owner.id, handle="private-chat", name="Private Chat")
        db.add_all([owner, echo])
        db.commit()

        async def successful_reply(echo, payload, public, additional_knowledge=""):
            assert not public
            return ChatResponse(reply="Here is your answer.", demo=False)

        monkeypatch.setattr(routes, "reply", successful_reply)
        output = asyncio.run(routes.private_chat(
            echo.id, ChatRequest(message="What is my plan?"), request(), owner, db,
        ))
        assert output.reply == "Here is your answer."
        stored = db.exec(select(ChatTurn).where(ChatTurn.echo_id == echo.id)).all()
        assert len(stored) == 1
        assert stored[0].user_message == "What is my plan?"

        async def failed_reply(*args, **kwargs):
            raise HTTPException(503, "Provider unavailable")

        monkeypatch.setattr(routes, "reply", failed_reply)
        with pytest.raises(HTTPException):
            asyncio.run(routes.private_chat(
                echo.id, ChatRequest(message="Try again"), request(), owner, db,
            ))
        assert len(db.exec(select(ChatTurn)).all()) == 1


def test_echo_deletion_removes_private_chat_turns():
    with make_db() as db:
        owner = User(id=uuid4(), email="owner3@example.com", name="Owner", password_hash="unused")
        echo = Echo(owner_id=owner.id, handle="deleted-echo", name="Deleted ECHO")
        db.add_all([owner, echo])
        db.commit()
        db.add(ChatTurn(echo_id=echo.id, owner_id=owner.id, user_message="Hi", assistant_message="Hello"))
        db.commit()
        routes.delete_echo(echo.id, owner, db)
        assert db.exec(select(ChatTurn).where(ChatTurn.echo_id == echo.id)).first() is None
