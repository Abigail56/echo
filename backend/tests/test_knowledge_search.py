"""Knowledge library search is owner-scoped and filterable."""
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.api import world
from app.core.knowledge_search import search_memories
from app.models.entities import Echo, KnowledgeDocument, Memory, User


def make_records():
    document_id = uuid4()
    return [
        Memory(id=uuid4(), echo_id=uuid4(), title="RouteBridge logistics",
               content="Tenant-aware dispatch and delivery tracking", visibility="public",
               document_id=document_id),
        Memory(id=uuid4(), echo_id=uuid4(), title="Private roadmap",
               content="RouteBridge unreleased milestones", visibility="private"),
        Memory(id=uuid4(), echo_id=uuid4(), title="Favorite meal",
               content="Rice and stew", visibility="public"),
    ]


def test_search_ranks_titles_and_omits_irrelevant_memories():
    result = search_memories(make_records(), "RouteBridge")
    assert len(result) == 2
    assert result[0].title == "RouteBridge logistics"
    assert "Favorite meal" not in [item.title for item in result]
    assert len(result[0].snippet) <= 232


def test_search_visibility_and_origin_filters():
    records = make_records()
    assert [item.title for item in search_memories(records, "RouteBridge", visibility="private")] == ["Private roadmap"]
    assert [item.title for item in search_memories(records, "RouteBridge", visibility="public")] == ["RouteBridge logistics"]
    assert [item.title for item in search_memories(records, "RouteBridge", origin="document")] == ["RouteBridge logistics"]
    assert [item.title for item in search_memories(records, "RouteBridge", origin="manual")] == ["Private roadmap"]
    assert search_memories(records, "  ") == []


def test_search_caps_results_and_handles_literal_sql_wildcard_characters():
    records = [Memory(echo_id=uuid4(), title="Memory", content="alpha_% example")
               for _ in range(36)]
    assert len(search_memories(records, "alpha", max_results=100)) == 30
    assert search_memories(records, "nonexistent") == []


def test_owner_only_search_endpoint():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as db:
        owner = User(id=uuid4(), email="search-owner@example.com", name="Owner", password_hash="unused")
        stranger = User(id=uuid4(), email="search-stranger@example.com", name="Stranger", password_hash="unused")
        first = Echo(id=uuid4(), owner_id=owner.id, name="Owner ECHO", handle="search-owner")
        second = Echo(id=uuid4(), owner_id=stranger.id, name="Other ECHO", handle="search-other")
        db.add_all([owner, stranger, first, second])
        db.commit()
        db.add(Memory(echo_id=first.id, title="Private financial plan",
                      content="RouteBridge profit figures", visibility="private"))
        db.add(Memory(echo_id=second.id, title="Private RouteBridge secret",
                      content="Other account's confidential content", visibility="private"))
        db.commit()

        found = world.search_knowledge(first.id, "RouteBridge", "all", "all", owner, db)
        assert len(found) == 1
        assert "profit" in found[0]["snippet"]
        assert "confidential" not in found[0]["snippet"]
        with pytest.raises(HTTPException) as denied:
            world.search_knowledge(first.id, "RouteBridge", "all", "all", stranger, db)
        assert denied.value.status_code == 404
        assert world.search_knowledge(first.id, "RouteBridge", "public", "all", owner, db) == []
