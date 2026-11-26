"""Grouped document lifecycle, privacy, and cleanup regression tests."""
import asyncio
from io import BytesIO
from uuid import uuid4

import pytest
from fastapi import HTTPException, Request, UploadFile
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

import app.api.routes as routes
import app.api.world as world
from app.api.world import DocumentVisibilityUpdate, MemoryUpdate
from app.models.entities import Echo, KnowledgeDocument, Memory, User


def setup():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def req():
    return Request({"type": "http", "method": "POST", "path": "/api/v1/studio/test/documents/import",
                    "headers": [], "client": ("127.0.0.1", 1234)})


def import_group(echo, user, db, filename="notes.txt", body=None):
    content = body or ("RouteBridge dispatch details " * 400).encode()
    return asyncio.run(world.import_document(
        echo.id, req(), UploadFile(file=BytesIO(content), filename=filename),
        "private", False, user, db,
    ))


def test_grouped_document_owner_controls_and_privacy(monkeypatch):
    monkeypatch.setattr(world, "limit", lambda *args: None)
    with setup() as db:
        owner = User(id=uuid4(), email="docowner@example.com", name="Owner", password_hash="unused")
        other = User(id=uuid4(), email="docother@example.com", name="Other", password_hash="unused")
        echo = Echo(owner_id=owner.id, name="Grouped", handle="grouped")
        db.add_all([owner, other, echo])
        db.commit()

        imported = import_group(echo, owner, db)
        document_id = imported["document"]["id"]
        document_uuid = imported["document"]["id"]
        groups = world.documents(echo.id, owner, db)
        assert len(groups) == 1
        assert str(groups[0]["id"]) == str(document_uuid)
        assert groups[0]["section_count"] == imported["sections"] > 1
        sections = db.exec(select(Memory).where(Memory.echo_id == echo.id)).all()
        assert all(part.document_id is not None and part.visibility == "private" for part in sections)

        with pytest.raises(HTTPException) as forbidden:
            world.documents(echo.id, other, db)
        assert forbidden.value.status_code == 404
        with pytest.raises(HTTPException):
            world.update_document_visibility(echo.id, sections[0].document_id,
                                             DocumentVisibilityUpdate(visibility="public", allow_public=True), other, db)
        with pytest.raises(HTTPException) as no_consent:
            world.update_document_visibility(echo.id, sections[0].document_id,
                                             DocumentVisibilityUpdate(visibility="public"), owner, db)
        assert no_consent.value.status_code == 422

        document_uuid = sections[0].document_id
        world.update_document_visibility(
            echo.id, document_uuid,
            DocumentVisibilityUpdate(visibility="public", allow_public=True), owner, db,
        )
        db.expire_all()
        assert all(part.visibility == "public" for part in
                   db.exec(select(Memory).where(Memory.document_id == document_uuid)).all())

        with pytest.raises(HTTPException) as mismatch:
            world.update_memory(echo.id, sections[0].id, MemoryUpdate(visibility="private"), owner, db)
        assert mismatch.value.status_code == 409
        world.update_document_visibility(
            echo.id, document_uuid,
            DocumentVisibilityUpdate(visibility="private"), owner, db,
        )
        assert all(part.visibility == "private" for part in
                   db.exec(select(Memory).where(Memory.document_id == document_uuid)).all())
        with pytest.raises(HTTPException):
            world.delete_document(echo.id, document_uuid, other, db)
        world.delete_document(echo.id, document_uuid, owner, db)
        assert db.exec(select(Memory).where(Memory.document_id == document_uuid)).all() == []
        assert db.get(KnowledgeDocument, document_uuid) is None


def test_individual_section_deletion_updates_group_and_echo_delete_cleans_up(monkeypatch):
    monkeypatch.setattr(world, "limit", lambda *args: None)
    with setup() as db:
        user = User(id=uuid4(), email="doclifecycle@example.com", name="Owner", password_hash="unused")
        echo = Echo(owner_id=user.id, name="ECHO", handle="doclifecycle")
        db.add_all([user, echo])
        db.commit()
        import_group(echo, user, db)
        group = db.exec(select(KnowledgeDocument).where(KnowledgeDocument.echo_id == echo.id)).one()
        parts = db.exec(select(Memory).where(Memory.document_id == group.id)).all()
        assert len(parts) > 1
        world.remove_memory(echo.id, parts[0].id, user, db)
        db.refresh(group)
        assert group.section_count == len(parts) - 1

        routes.delete_echo(echo.id, user, db)
        assert db.exec(select(KnowledgeDocument).where(KnowledgeDocument.echo_id == echo.id)).all() == []
        assert db.exec(select(Memory).where(Memory.echo_id == echo.id)).all() == []


def test_legacy_memories_stay_ungrouped():
    with setup() as db:
        owner = User(id=uuid4(), email="legacydoc@example.com", name="Owner", password_hash="unused")
        echo = Echo(owner_id=owner.id, name="Legacy", handle="legacy-doc")
        db.add_all([owner, echo])
        db.commit()
        db.add(Memory(echo_id=echo.id, title="notes · part 1/2", content="Existing", visibility="private"))
        db.commit()
        assert world.documents(echo.id, owner, db) == []
