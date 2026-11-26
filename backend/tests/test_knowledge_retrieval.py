"""Tests for relevant, bounded memory retrieval and public isolation."""
import asyncio
from uuid import uuid4

from fastapi import Request
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool

import app.api.routes as routes
from app.api.schemas import ChatRequest, ChatResponse
from app.core.knowledge import relevant_memory_context
from app.models.entities import Echo, Memory, User


def memory(title: str, content: str, visibility: str = "private") -> Memory:
    return Memory(id=uuid4(), echo_id=uuid4(), title=title, content=content, visibility=visibility)


def test_matching_memories_are_ranked_before_unrelated_memories():
    records = [
        memory("Favorite meals", "I enjoy noodles."),
        memory("Portfolio projects", "RouteBridge logistics and VoxPlay voice games."),
        memory("Portfolio technology", "Next.js and FastAPI."),
    ]
    context = relevant_memory_context(records, "What are your portfolio projects?", public=False)
    assert "Portfolio projects" in context
    assert "Favorite meals" not in context
    assert context.index("Portfolio projects") < context.index("Portfolio technology")


def test_private_memory_cannot_enter_public_context_even_if_passed_by_mistake():
    records = [
        memory("Passport number", "SECRET-PASSPORT-123", "private"),
        memory("Portfolio project", "I built an open-source portfolio.", "public"),
    ]
    public_context = relevant_memory_context(records, "Tell me about your passport and portfolio project", public=True)
    assert "SECRET-PASSPORT-123" not in public_context
    assert "Portfolio project" in public_context
    private_context = relevant_memory_context(records, "What is my passport number?", public=False)
    assert "SECRET-PASSPORT-123" in private_context


def test_empty_or_irrelevant_question_does_not_inject_unrelated_memories():
    records = [memory("Favorite snack", "Banana chips")]
    assert relevant_memory_context(records, "Tell me about payroll", public=False) == ""
    assert relevant_memory_context(records, "hello", public=False) == ""


def test_memory_context_respects_caps_and_normalizes_unicode_terms():
    records = [memory("Résumé experience", "Experience " * 800, "public")]
    context = relevant_memory_context(records, "Tell me about résumé experience", public=True, max_chars=190)
    assert 0 < len(context) <= 190
    assert context.startswith("- Résumé experience")


def test_public_chat_only_uses_public_memory_even_on_matching_private_query(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as db:
        user = User(id=uuid4(), name="Example", email="example@example.com", password_hash="unused")
        echo = Echo(owner_id=user.id, handle="example-echo", name="Example ECHO", is_public=True)
        db.add_all([user, echo])
        db.commit()
        db.add_all([
            Memory(echo_id=echo.id, title="Secret plan", content="HIDDEN-PRIVATE-PLAN", visibility="private"),
            Memory(echo_id=echo.id, title="Public project", content="PUBLIC-PROJECT-INFO", visibility="public"),
        ])
        db.commit()

        monkeypatch.setattr(routes, "limit", lambda *args: None)
        async def mock_reply(echo, payload, public, additional_knowledge=""):
            assert public is True
            assert "HIDDEN-PRIVATE-PLAN" not in additional_knowledge
            assert "PUBLIC-PROJECT-INFO" in additional_knowledge
            return ChatResponse(reply="OK", demo=False)

        monkeypatch.setattr(routes, "reply", mock_reply)
        req = Request({
            "type": "http", "method": "POST",
            "path": "/api/v1/public/example-echo/chat",
            "headers": [], "client": ("127.0.0.1", 1234),
        })
        response = asyncio.run(routes.public_chat(
            echo.handle,
            ChatRequest(message="Tell me about the secret plan and public project"),
            req,
            db,
        ))
        assert response.reply == "OK"
