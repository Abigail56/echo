"""Source metadata is advisory and must never reveal private memories publicly."""
import asyncio
from uuid import uuid4

from fastapi import Request
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool

import app.api.routes as routes
from app.api.schemas import ChatRequest, ChatResponse
from app.core.knowledge import retrieve_approved_knowledge
from app.models.entities import Echo, Memory, User


def make_mem(title, content, visibility="private"):
    return Memory(id=uuid4(), echo_id=uuid4(), title=title, content=content, visibility=visibility)


def test_mid_document_passage_retrieved_not_first_excerpt():
    document = make_mem("Uploaded notes", ("unrelated background " * 80) + "RouteBridge dispatch uses tenant-specific rates.")
    result = retrieve_approved_knowledge([document], "How does RouteBridge dispatch work?", public=False)
    assert "RouteBridge dispatch" in result.context
    assert len(result.sources) == 1
    assert result.sources[0].id == document.id


def test_retrieves_multiple_documents_and_deduplicates_sources():
    records = [
        make_mem("FastAPI notes", "FastAPI powers the dispatch API."),
        make_mem("Deployment notes", "FastAPI runs behind a reverse proxy."),
        make_mem("Unrelated", "My favorite fruit is mango."),
    ]
    result = retrieve_approved_knowledge(records, "How is FastAPI used?", public=False)
    assert len(result.sources) == 2
    assert len(set(source.id for source in result.sources)) == 2
    assert "Unrelated" not in result.context


def test_public_source_metadata_never_mentions_private_memories():
    records = [
        make_mem("Secret project", "My confidential RouteBridge contract", "private"),
        make_mem("Public project", "RouteBridge delivery demo", "public"),
    ]
    result = retrieve_approved_knowledge(records, "Tell me about RouteBridge project", public=True)
    assert len(result.sources) == 1
    assert result.sources[0].title == "Public project"
    assert "confidential" not in result.context


def test_context_bounds_apply_to_source_metadata_too():
    records = [make_mem(f"Project {number}", "RouteBridge logistics " * 40) for number in range(12)]
    result = retrieve_approved_knowledge(records, "RouteBridge", public=False, max_memories=3, max_chars=180)
    assert len(result.context) <= 180
    assert len(result.sources) <= 3


def test_public_chat_exposes_only_selected_public_source_names(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as db:
        owner = User(id=uuid4(), name="Owner", email="source-owner@example.com", password_hash="unused")
        echo = Echo(owner_id=owner.id, handle="source-echo", name="Source ECHO", is_public=True)
        db.add_all([owner, echo])
        db.commit()
        db.add_all([
            Memory(echo_id=echo.id, title="Secret RouteBridge", content="confidential RouteBridge details", visibility="private"),
            Memory(echo_id=echo.id, title="Public RouteBridge", content="RouteBridge public demo", visibility="public"),
        ])
        db.commit()

        async def fake_reply(*args, **kwargs):
            return ChatResponse(reply="RouteBridge is a delivery platform.", demo=False)
        monkeypatch.setattr(routes, "reply", fake_reply)
        monkeypatch.setattr(routes, "limit", lambda *args: None)
        request = Request({"type": "http", "method": "POST", "path": "/api/v1/public/source-echo/chat",
                           "headers": [], "client": ("127.0.0.1", 1234)})
        result = asyncio.run(routes.public_chat(
            "source-echo", ChatRequest(message="Tell me about RouteBridge"), request, db))
        assert [source.title for source in result.sources] == ["Public RouteBridge"]
