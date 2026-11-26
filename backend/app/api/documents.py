"""Owner-managed document knowledge. Store extracted text, never raw uploads."""
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.auth import current_user
from app.core.db import session_dep
from app.core.documents import MAX_UPLOAD_BYTES, extract_document, normalized_filename
from app.core.limit import limit
from app.models.entities import Echo, KnowledgeDocument, User

router = APIRouter()


def owned(echo_id: UUID, user: User, db: Session) -> None:
    echo = db.get(Echo, echo_id)
    if echo is None or echo.owner_id != user.id:
        raise HTTPException(404, "ECHO not found")


def metadata(document: KnowledgeDocument) -> dict:
    return {
        "id": str(document.id),
        "filename": document.filename,
        "content_type": document.content_type,
        "visibility": document.visibility,
        "characters": len(document.extracted_text),
        "created_at": document.created_at.isoformat(),
    }


class DocumentVisibility(BaseModel):
    visibility: Literal["private", "public"]


@router.get("/studio/{echo_id}/documents")
def list_documents(echo_id: UUID, user: User = Depends(current_user),
                   db: Session = Depends(session_dep)):
    owned(echo_id, user, db)
    rows = db.exec(
        select(KnowledgeDocument)
        .where(KnowledgeDocument.echo_id == echo_id, KnowledgeDocument.owner_id == user.id)
        .order_by(KnowledgeDocument.created_at.desc())
    ).all()
    return [metadata(row) for row in rows]


@router.post("/studio/{echo_id}/documents", status_code=201)
def upload_document(echo_id: UUID, request: Request,
                    file: UploadFile = File(...),
                    visibility: Literal["private", "public"] = Form("private"),
                    user: User = Depends(current_user),
                    db: Session = Depends(session_dep)):
    owned(echo_id, user, db)
    limit(request, f"document-upload:{user.id}", 8, 3600)
    existing = db.exec(
        select(KnowledgeDocument).where(
            KnowledgeDocument.echo_id == echo_id,
            KnowledgeDocument.owner_id == user.id,
        )
    ).all()
    if len(existing) >= 10:
        raise HTTPException(403, "Maximum of 10 documents per ECHO.")
    name = normalized_filename(file.filename or "")
    try:
        raw = file.file.read(MAX_UPLOAD_BYTES + 1)
    finally:
        file.file.close()
    content, mime, truncated = extract_document(raw, name)
    document = KnowledgeDocument(
        echo_id=echo_id, owner_id=user.id, filename=name, visibility=visibility,
        content_type=mime, extracted_text=content,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return {**metadata(document), "truncated": truncated}


@router.patch("/studio/{echo_id}/documents/{document_id}")
def update_document_visibility(echo_id: UUID, document_id: UUID,
                               body: DocumentVisibility,
                               user: User = Depends(current_user),
                               db: Session = Depends(session_dep)):
    owned(echo_id, user, db)
    document = db.get(KnowledgeDocument, document_id)
    if document is None or document.echo_id != echo_id or document.owner_id != user.id:
        raise HTTPException(404, "Document not found")
    document.visibility = body.visibility
    db.add(document)
    db.commit()
    db.refresh(document)
    return metadata(document)


@router.delete("/studio/{echo_id}/documents/{document_id}", status_code=204)
def remove_document(echo_id: UUID, document_id: UUID,
                    user: User = Depends(current_user),
                    db: Session = Depends(session_dep)):
    owned(echo_id, user, db)
    document = db.get(KnowledgeDocument, document_id)
    if document is None or document.echo_id != echo_id or document.owner_id != user.id:
        raise HTTPException(404, "Document not found")
    db.delete(document)
    db.commit()
