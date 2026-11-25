import base64
import binascii
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core.auth import current_user
from app.core.config import settings
from app.core.db import session_dep
from app.core.limit import limit
from app.models.entities import AvatarProfile, User
from app.services.avatar_sdk import (
    MAX_MODEL_BYTES,
    create_avatar,
    get_avatar_status,
    validate_imported_glb,
    validate_provider_credentials,
)

router = APIRouter()
MAX_PHOTO_BYTES = 10 * 1024 * 1024


class AvatarGenerationIn(BaseModel):
    photo_base64: str = Field(min_length=1, max_length=14_000_000)
    content_type: Literal["image/jpeg", "image/png"]
    consent: bool
    presentation: Literal["female", "male"]


def _response(profile: AvatarProfile) -> dict:
    return {
        "status": profile.status,
        "progress": profile.progress,
        "model_available": bool(profile.model_path and Path(profile.model_path).is_file()),
        "source": profile.source,
    }


def _image_type(data: bytes, content_type: str | None) -> str:
    if content_type == "image/jpeg" and data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content_type == "image/png" and data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    raise HTTPException(status_code=415, detail="Upload a valid JPEG or PNG photo.")


@router.get("/avatar/provider")
async def avatar_provider_status(user: User = Depends(current_user)):
    config = settings()
    configured = bool(config.AVATAR_SDK_ENABLED and config.AVATAR_SDK_CLIENT_ID and config.AVATAR_SDK_CLIENT_SECRET)
    if not config.AVATAR_SDK_ENABLED:
        validation = {
            "auth_status": "disabled",
            "credentials_valid": False,
            "api_accessible": False,
            "message": "Avatar SDK is disabled. It is an optional 3D avatar service; LiveAvatar is ECHO's primary video-avatar provider.",
        }
    else:
        validation = await validate_provider_credentials()
    api_accessible = validation["api_accessible"] is True
    return {
        "provider": "avatarsdk",
        "configured": configured,
        **validation,
        "required_environment": ["AVATAR_SDK_CLIENT_ID", "AVATAR_SDK_CLIENT_SECRET"],
        "capabilities": {
            "photorealistic_rigged_3d": api_accessible,
            "photorealistic_video": False,
            "live_digital_human": False,
            "text_to_video": False,
            "voice_to_video": False,
            "video_upload_generation": False,
            "glb_import": True,
        },
    }


@router.get("/avatar/generation")
async def avatar_generation_status(request: Request, user: User = Depends(current_user), db: Session = Depends(session_dep)):
    limit(request, f"avatar-generation-status:{user.id}", 30, 60)
    profile = db.exec(select(AvatarProfile).where(AvatarProfile.owner_id == user.id)).first()
    if not profile:
        raise HTTPException(status_code=404, detail="No generated avatar exists yet.")
    if profile.source == "imported" and not profile.model_path:
        raise HTTPException(status_code=404, detail="Your imported avatar model is not available in ECHO storage.")
    if profile.status.lower() not in {"completed", "failed", "timed out", "timeout"} or not profile.model_path:
        status, progress, model = await get_avatar_status(profile.provider_code)
        profile.status = status[:24]
        if progress is not None:
            profile.progress = progress
        profile.updated_at = datetime.now(timezone.utc)
        if model:
            storage = Path(settings().AVATAR_STORAGE_DIR)
            storage.mkdir(mode=0o700, parents=True, exist_ok=True)
            destination = storage / f"{user.id}.glb"
            temporary = storage / f".{user.id}.{uuid4().hex}.tmp"
            try:
                temporary.write_bytes(model)
                temporary.chmod(0o600)
                temporary.replace(destination)
            finally:
                temporary.unlink(missing_ok=True)
            profile.model_path = str(destination)
            profile.progress = 100
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return _response(profile)


@router.post("/avatar/generation", status_code=202)
async def start_avatar_generation(
    request: Request,
    body: AvatarGenerationIn,
    user: User = Depends(current_user),
    db: Session = Depends(session_dep),
):
    if body.consent is not True:
        raise HTTPException(status_code=400, detail="Explicit photo-processing consent is required.")
    if not settings().AVATAR_SDK_ENABLED:
        raise HTTPException(status_code=503, detail="Avatar SDK 3D generation is disabled. Enable AVATAR_SDK_ENABLED to use it.")
    if not settings().AVATAR_SDK_CLIENT_ID or not settings().AVATAR_SDK_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="Avatar SDK credentials are not configured on the backend.")
    limit(request, f"avatar-generation:{user.id}", 1, 86400)
    existing = db.exec(select(AvatarProfile).where(AvatarProfile.owner_id == user.id)).first()
    if existing and existing.status.lower() not in {"completed", "failed", "timed out", "timeout"}:
        raise HTTPException(status_code=409, detail="Your avatar is still generating.")
    try:
        image = base64.b64decode(body.photo_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="The submitted photo data is invalid.") from exc
    if len(image) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="Photo is larger than 10 MB.")
    content_type = _image_type(image, body.content_type)
    code, status, progress = await create_avatar(
        image,
        "selfie.jpg" if content_type == "image/jpeg" else "selfie.png",
        content_type,
        body.presentation,
    )
    profile = existing or AvatarProfile(
        owner_id=user.id,
        provider_code=code,
        consent_at=datetime.now(timezone.utc),
    )
    old_model = profile.model_path
    profile.provider_code = code
    profile.status = status[:24]
    profile.progress = progress
    profile.source = "avatarsdk"
    profile.model_path = None
    profile.consent_at = datetime.now(timezone.utc)
    profile.updated_at = datetime.now(timezone.utc)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    if old_model:
        Path(old_model).unlink(missing_ok=True)
    return _response(profile)


@router.post("/avatar/model/import", status_code=201)
async def import_avatar_model(
    request: Request,
    model: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(session_dep),
):
    limit(request, f"avatar-model-import:{user.id}", 5, 60)
    if not model.filename or not model.filename.lower().endswith(".glb"):
        raise HTTPException(status_code=415, detail="Select a GLB (.glb) avatar model.")
    content = await model.read(MAX_MODEL_BYTES + 1)
    if len(content) > MAX_MODEL_BYTES:
        raise HTTPException(status_code=413, detail="Avatar model is larger than 50 MB.")
    validate_imported_glb(content)

    profile = db.exec(select(AvatarProfile).where(AvatarProfile.owner_id == user.id)).first()
    if profile and profile.status.lower() not in {"completed", "failed", "timed out", "timeout"}:
        raise HTTPException(status_code=409, detail="Your avatar is still generating.")
    storage = Path(settings().AVATAR_STORAGE_DIR)
    storage.mkdir(mode=0o700, parents=True, exist_ok=True)
    destination = storage / f"{user.id}.glb"
    temporary = storage / f".{user.id}.{uuid4().hex}.tmp"
    try:
        temporary.write_bytes(content)
        temporary.chmod(0o600)
        temporary.replace(destination)
        profile = profile or AvatarProfile(
            owner_id=user.id,
            provider_code=f"imported-{uuid4().hex}",
            consent_at=None,
            source="imported",
        )
        profile.provider_code = f"imported-{uuid4().hex}"
        profile.status = "Completed"
        profile.progress = 100
        profile.source = "imported"
        profile.model_path = str(destination)
        profile.updated_at = datetime.now(timezone.utc)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    finally:
        temporary.unlink(missing_ok=True)
    return _response(profile)


@router.delete("/avatar/generation", status_code=204)
def delete_avatar_generation(user: User = Depends(current_user), db: Session = Depends(session_dep)):
    profile = db.exec(select(AvatarProfile).where(AvatarProfile.owner_id == user.id)).first()
    if not profile:
        return None
    if profile.model_path:
        Path(profile.model_path).unlink(missing_ok=True)
    db.delete(profile)
    db.commit()
    return None


@router.get("/avatar/model")
def get_avatar_model(user: User = Depends(current_user), db: Session = Depends(session_dep)):
    profile = db.exec(select(AvatarProfile).where(AvatarProfile.owner_id == user.id)).first()
    if not profile or not profile.model_path or not Path(profile.model_path).is_file():
        raise HTTPException(status_code=404, detail="Your avatar model is not ready.")
    return FileResponse(
        profile.model_path,
        media_type="model/gltf-binary",
        filename="echo-avatar.glb",
        headers={"Cache-Control": "private, no-store"},
    )
