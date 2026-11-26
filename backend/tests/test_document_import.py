"""Document import safety, visibility and ownership tests."""
import asyncio
from io import BytesIO
from uuid import uuid4

import pytest
from fastapi import HTTPException, Request, UploadFile
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool
from pypdf import PdfWriter

import app.api.world as world
from app.core.document_import import document_title, extract_document, extract_document_full, split_document_sections, MAX_UPLOAD_BYTES
from app.models.entities import Echo, Memory, User


def test_text_markdown_extract_with_explicit_limits():
    assert document_title("../../notes.md") == ("notes", ".md")
    text, truncated = extract_document(b"# My Projects\nRouteBridge and VoxPlay", "projects.md")
    assert "RouteBridge" in text
    assert truncated is False
    text, truncated = extract_document(b"a" * 6000, "long.txt")
    assert len(text) == 5000
    assert truncated is True


def test_rejects_invalid_extension_utf8_and_oversize():
    for filename, raw, expected in [
        ("script.exe", b"abc", 415),
        ("notes.txt", b"abc\x00def", 415),
        ("notes.txt", b"\xff\xfe", 422),
        ("notes.txt", b"z" * (MAX_UPLOAD_BYTES + 1), 413),
        ("empty.md", b" \n", 422),
        ("fake.pdf", b"not a pdf", 415),
    ]:
        with pytest.raises(HTTPException) as err:
            extract_document(raw, filename)
        assert err.value.status_code == expected


def test_image_only_pdf_rejected_without_ocr():
    writer = PdfWriter()
    writer.add_blank_page(width=400, height=400)
    output = BytesIO()
    writer.write(output)
    with pytest.raises(HTTPException) as err:
        extract_document(output.getvalue(), "image-only.pdf")
    assert err.value.status_code == 422


def make_db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def request():
    return Request({
        "type": "http", "method": "POST", "path": "/api/v1/studio/test/documents/import",
        "headers": [], "client": ("127.0.0.1", 1234),
    })


def upload(filename, content):
    return UploadFile(filename=filename, file=BytesIO(content))


def test_document_import_requires_owner_and_explicit_public_permission(monkeypatch):
    monkeypatch.setattr(world, "limit", lambda *args: None)
    with make_db() as db:
        owner = User(id=uuid4(), email="owner4@example.com", name="Owner", password_hash="unused")
        other = User(id=uuid4(), email="other4@example.com", name="Other", password_hash="unused")
        echo = Echo(owner_id=owner.id, handle="document-echo", name="Document ECHO")
        db.add_all([owner, other, echo])
        db.commit()

        with pytest.raises(HTTPException) as err:
            asyncio.run(world.import_document(echo.id, request(), upload("notes.txt", b"Secret plan"), "private", False, other, db))
        assert err.value.status_code == 404

        with pytest.raises(HTTPException) as err:
            asyncio.run(world.import_document(echo.id, request(), upload("notes.txt", b"Public research"), "public", False, owner, db))
        assert err.value.status_code == 422

        assert db.exec(select(Memory)).all() == []
        result = asyncio.run(world.import_document(echo.id, request(), upload("profile.md", b"Portfolio: RouteBridge logistics platform"), "private", False, owner, db))
        assert result["memory"]["title"] == "profile"
        assert result["memory"]["visibility"] == "private"
        assert len(db.exec(select(Memory)).all()) == 1

        public_result = asyncio.run(world.import_document(echo.id, request(), upload("bio.txt", b"Public portfolio projects"), "public", True, owner, db))
        assert public_result["memory"]["visibility"] == "public"
        assert len(db.exec(select(Memory)).all()) == 2


def test_long_document_sections_preserve_later_content():
    raw = (("Background of the project. " * 250) + "LATE-ROUTEBRIDGE-DETAIL " + ("Additional context. " * 200)).encode()
    text, truncated = extract_document_full(raw, "project.md")
    parts = split_document_sections(text)
    assert len(parts) > 1
    assert any("LATE-ROUTEBRIDGE-DETAIL" in section for section in parts)
    assert "".join(parts).replace(" ", "") == text.replace(" ", "")
    assert all(len(section) <= 4500 for section in parts)
    assert truncated is False


def test_long_document_import_is_atomic_and_uses_visibility(monkeypatch):
    monkeypatch.setattr(world, "limit", lambda *args: None)
    with make_db() as db:
        owner = User(id=uuid4(), email="long-owner@example.com", name="Owner", password_hash="unused")
        echo = Echo(owner_id=owner.id, handle="long-doc", name="Long Document")
        db.add_all([owner, echo])
        db.commit()
        doc = ("Public deployment details " * 520).encode()
        result = asyncio.run(world.import_document(
            echo.id, request(), upload("full.md", doc), "public", True, owner, db))
        stored = db.exec(select(Memory).where(Memory.echo_id == echo.id)).all()
        assert result["sections"] == len(stored) > 1
        assert all(part.visibility == "public" for part in stored)
        assert all("full · part" in part.title for part in stored)

        # Capacity checks must reject the complete upload before writing.
        for index in range(100 - len(stored) - 1):
            db.add(Memory(echo_id=echo.id, title=f"Extra {index}", content="Unrelated", visibility="private"))
        db.commit()
        before = len(db.exec(select(Memory)).all())
        with pytest.raises(HTTPException) as err:
            asyncio.run(world.import_document(
                echo.id, request(), upload("second.txt", doc), "private", False, owner, db))
        assert err.value.status_code == 403
        assert len(db.exec(select(Memory)).all()) == before
