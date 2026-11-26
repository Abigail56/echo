"""Document-ingestion security, privacy, and lifecycle tests."""
import asyncio
from io import BytesIO
from uuid import uuid4

import pytest
from docx import Document as DocxDocument
from fastapi import HTTPException, Request, UploadFile
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool

import app.api.documents as api
import app.api.routes as routes
from app.api.schemas import ChatRequest, ChatResponse
from app.core.documents import MAX_UPLOAD_BYTES, extract_document
from app.models.entities import Echo, KnowledgeDocument, User


def make_db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def request():
    return Request({
        "type": "http", "method": "POST", "path": "/api/v1/studio/test/documents",
        "headers": [], "client": ("127.0.0.1", 1234),
    })


def test_utf8_and_markdown_extraction_and_filename_sanitization():
    text, mime, truncated = extract_document(b"Hello ECHO\nPortfolio details", "notes.txt")
    assert text == "Hello ECHO\nPortfolio details"
    assert mime == "text/plain"
    assert not truncated
    _, mime, _ = extract_document(b"## Projects\nRouteBridge", "../portfolio.md")
    assert mime == "text/markdown"


@pytest.mark.parametrize("filename,data,status", [
    ("malware.exe", b"hello", 415),
    ("empty.txt", b"", 422),
    ("binary.txt", b"bad\x00text", 422),
    ("bad.pdf", b"not actually pdf", 422),
    ("broken.docx", b"not zip", 422),
    ("large.md", b"X" * (MAX_UPLOAD_BYTES + 1), 413),
])
def test_rejects_invalid_uploads(filename, data, status):
    with pytest.raises(HTTPException) as exc:
        extract_document(data, filename)
    assert exc.value.status_code == status


def test_docx_extracts_paragraphs_without_retaining_source_bytes():
    doc = DocxDocument()
    doc.add_paragraph("RouteBridge logistics platform")
    buffer = BytesIO()
    doc.save(buffer)
    text, mime, truncated = extract_document(buffer.getvalue(), "Projects.docx")
    assert "RouteBridge logistics platform" in text
    assert "wordprocessingml" in mime
    assert not truncated


def test_document_endpoints_enforce_owner_and_delete(monkeypatch):
    monkeypatch.setattr(api, "limit", lambda *args: None)
    with make_db() as db:
        owner = User(id=uuid4(), email="document-owner@example.com", name="Owner", password_hash="unused")
        stranger = User(id=uuid4(), email="document-stranger@example.com", name="Stranger", password_hash="unused")
        echo = Echo(owner_id=owner.id, handle="document-owner", name="Document Owner")
        db.add_all([owner, stranger, echo])
        db.commit()

        file = UploadFile(filename="profile.md", file=BytesIO(b"## Tech stack\nFastAPI and PostgreSQL"))
        created = api.upload_document(echo.id, request(), file, "private", owner, db)
        assert created["visibility"] == "private"
        assert "extracted_text" not in created
        assert len(api.list_documents(echo.id, owner, db)) == 1

        with pytest.raises(HTTPException) as exc:
            api.list_documents(echo.id, stranger, db)
        assert exc.value.status_code == 404
        with pytest.raises(HTTPException):
            api.update_document_visibility(echo.id, created["id"], api.DocumentVisibility(visibility="public"), stranger, db)

        changed = api.update_document_visibility(echo.id, created["id"], api.DocumentVisibility(visibility="public"), owner, db)
        assert changed["visibility"] == "public"
        api.remove_document(echo.id, created["id"], owner, db)
        assert api.list_documents(echo.id, owner, db) == []


def test_public_chat_never_receives_private_document_text(monkeypatch):
    monkeypatch.setattr(routes, "limit", lambda *args: None)
    with make_db() as db:
        owner = User(id=uuid4(), email="doc-public@example.com", name="Owner", password_hash="unused")
        echo = Echo(owner_id=owner.id, handle="public-doc-echo", name="Public Document ECHO", is_public=True)
        db.add_all([owner, echo])
        db.commit()
        db.add_all([
            KnowledgeDocument(echo_id=echo.id, owner_id=owner.id, filename="secret.txt",
                              visibility="private", content_type="text/plain",
                              extracted_text="SECRET-DOCUMENT-PASSPORT-ABC"),
            KnowledgeDocument(echo_id=echo.id, owner_id=owner.id, filename="portfolio.md",
                              visibility="public", content_type="text/markdown",
                              extracted_text="RouteBridge delivery service using FastAPI"),
        ])
        db.commit()

        async def mock_reply(echo, payload, public, additional_knowledge=""):
            assert public
            assert "SECRET-DOCUMENT-PASSPORT-ABC" not in additional_knowledge
            assert "RouteBridge delivery service" in additional_knowledge
            return ChatResponse(reply="Knowledge loaded.", demo=False)

        monkeypatch.setattr(routes, "reply", mock_reply)
        result = asyncio.run(routes.public_chat(
            echo.handle,
            ChatRequest(message="Tell me about RouteBridge and the document passport"),
            request(),
            db,
        ))
        assert result.reply == "Knowledge loaded."
