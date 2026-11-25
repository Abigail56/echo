from typing import Any

import httpx
from fastapi import HTTPException, UploadFile

from app.core.config import settings

LIVEAVATAR_API = "https://api.liveavatar.com"
TAVUS_API = "https://tavusapi.com"
LIVEAVATAR_SUPPORTED_MODELS = frozenset(
    {"gpt-4o-mini", "gpt-4o", "gpt-5-nano", "gpt-5.4-nano"}
)


def _error_detail(provider: str, response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        body = {}
    if isinstance(body, dict):
        detail = body.get("detail") or body.get("message") or body.get("error")
        if isinstance(detail, dict):
            detail = detail.get("message") or detail.get("detail")
        if isinstance(detail, str) and detail:
            return f"{provider}: {detail[:400]}"
    if response.status_code in {401, 403}:
        return f"{provider} rejected API authentication. Verify its server-side API key and account access."
    if response.status_code == 402:
        return f"{provider} requires an eligible subscription or available credits."
    if response.status_code == 429:
        return f"{provider} rate limit reached. Wait before retrying."
    return f"{provider} request failed (HTTP {response.status_code})."


def _raise_http_error(provider: str, response: httpx.Response) -> None:
    detail = _error_detail(provider, response)
    if response.status_code == 429:
        raise HTTPException(status_code=429, detail=detail)
    if response.status_code == 402:
        raise HTTPException(status_code=402, detail=detail)
    if response.status_code in {400, 404, 409, 422}:
        raise HTTPException(status_code=response.status_code, detail=detail)
    raise HTTPException(status_code=502, detail=detail)


def _unwrap(provider: str, response: httpx.Response) -> Any:
    if response.is_error:
        _raise_http_error(provider, response)
    try:
        body = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=f"{provider} returned an invalid response.") from exc
    if isinstance(body, dict) and "data" in body:
        return body["data"]
    return body


async def liveavatar_request(
    method: str,
    path: str,
    *,
    session_token: str | None = None,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
    files: dict[str, Any] | None = None,
) -> Any:
    config = settings()
    if not config.LIVEAVATAR_ENABLED:
        raise HTTPException(status_code=503, detail="LiveAvatar is disabled by backend configuration.")
    if not config.LIVEAVATAR_API_KEY:
        raise HTTPException(status_code=503, detail="Set LIVEAVATAR_API_KEY in the backend environment.")
    headers = {"X-API-KEY": config.LIVEAVATAR_API_KEY}
    if session_token:
        headers["Authorization"] = f"Bearer {session_token}"
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.request(
                method,
                f"{LIVEAVATAR_API}{path}",
                headers=headers,
                params=params,
                json=json_body,
                data=data,
                files=files,
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="LiveAvatar request timed out. Check provider status and retry.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not reach LiveAvatar. Check network connectivity and retry.") from exc
    return _unwrap("LiveAvatar", response)


async def tavus_request(
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
) -> Any:
    config = settings()
    if not config.TAVUS_ENABLED:
        raise HTTPException(status_code=503, detail="Tavus is disabled by backend configuration.")
    if not config.TAVUS_API_KEY:
        raise HTTPException(status_code=503, detail="Set TAVUS_API_KEY in the backend environment.")
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.request(
                method,
                f"{TAVUS_API}{path}",
                headers={"x-api-key": config.TAVUS_API_KEY},
                params=params,
                json=json_body,
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Tavus request timed out. Check provider status and retry.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not reach Tavus. Check network connectivity and retry.") from exc
    return _unwrap("Tavus", response)


def unwrap_avatar_list(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, dict):
        data = data.get("results", [])
    if not isinstance(data, list):
        raise HTTPException(status_code=502, detail="Avatar provider returned an invalid avatar list.")
    return [item for item in data if isinstance(item, dict)]


def liveavatar_public_payload(avatar: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": avatar.get("id"),
        "name": avatar.get("name"),
        "type": avatar.get("type"),
        "status": avatar.get("status"),
        "preview_url": avatar.get("preview_url"),
        "thumbnail_url": avatar.get("thumbnail_url"),
        "default_voice_agent_id": avatar.get("default_voice_agent_id"),
        "default_voice": avatar.get("default_voice"),
        "is_1080p": avatar.get("is_1080p"),
        "is_expired": avatar.get("is_expired", False),
        "source": avatar.get("source", "liveavatar"),
    }


def configured_liveavatar_avatars(config: Any) -> list[dict[str, Any]]:
    configured = []
    for slot in range(1, 7):
        avatar_id = getattr(config, f"LIVEAVATAR_AVATAR_{slot}_ID", "").strip()
        voice_id = getattr(config, f"LIVEAVATAR_AVATAR_{slot}_VOICE_ID", "").strip()
        model = getattr(config, f"LIVEAVATAR_AVATAR_{slot}_MODEL", "").strip()
        if avatar_id:
            configured.append(
                {
                    "slot": slot,
                    "id": avatar_id,
                    "voice_id": voice_id or None,
                    "model": model or None,
                }
            )
    return configured


def configured_tavus_avatars(config: Any) -> list[dict[str, Any]]:
    configured = []
    for slot in range(1, 9):
        avatar_id = getattr(config, f"TAVUS_AVATAR_{slot}_ID", "")
        if avatar_id:
            configured.append({
                "slot": slot,
                "id": avatar_id,
                "name": getattr(config, f"TAVUS_AVATAR_{slot}_NAME", ""),
            })
    return configured


def tavus_face_payloads(
    faces: list[dict[str, Any]],
    config: Any,
    default_face_id: str | None = None,
) -> list[dict[str, Any]]:
    configured = {avatar["id"]: avatar for avatar in configured_tavus_avatars(config)}
    payloads = []
    for face in faces:
        face_id = face.get("face_id")
        if not face_id:
            continue
        configured_avatar = configured.get(face_id)
        is_ready = face.get("status") == "completed"
        plan_available = face.get("available_for_plan") is not False
        payloads.append({
            "id": face_id,
            "name": face.get("face_name") or (configured_avatar or {}).get("name") or "Tavus avatar",
            "preview_url": face.get("thumbnail_video_url"),
            "thumbnail_url": face.get("thumbnail_url"),
            "status": face.get("status"),
            "face_type": face.get("face_type"),
            "available_for_plan": plan_available,
            "selectable": is_ready and plan_available,
            "configured": configured_avatar is not None,
            "slot": configured_avatar["slot"] if configured_avatar else None,
            "is_default": face_id == default_face_id,
        })
    payloads.sort(key=lambda face: (
        not face["configured"],
        face["slot"] if face["slot"] is not None else 9,
        not face["is_default"],
        face["name"].casefold(),
    ))
    return payloads


def resolve_tavus_face_id(
    requested_face_id: str | None,
    saved_face_id: str | None,
    pal_default_face_id: str | None,
) -> str | None:
    return requested_face_id or saved_face_id or pal_default_face_id


def liveavatar_persona(
    avatar: dict[str, Any],
    configured: dict[str, Any],
    voice_agent: dict[str, Any],
    context_id_override: str | None = None,
) -> dict[str, Any]:
    agent_type = voice_agent.get("agent_type")
    agent_config = voice_agent.get("agent_configuration")
    if not isinstance(agent_config, dict):
        agent_config = {}

    if agent_type and agent_type != "liveavatar_agent":
        raise HTTPException(
            status_code=409,
            detail="This avatar uses a non-managed voice agent; configured voice and model overrides require a LiveAvatar managed voice agent.",
        )

    model = configured.get("model")
    if model and model not in LIVEAVATAR_SUPPORTED_MODELS:
        supported = ", ".join(sorted(LIVEAVATAR_SUPPORTED_MODELS))
        raise HTTPException(
            status_code=422,
            detail=f"LiveAvatar does not document model '{model}'. Supported managed models: {supported}.",
        )

    context_id = context_id_override or agent_config.get("context_id")
    if not context_id:
        raise HTTPException(
            status_code=409,
            detail="This avatar's LiveAvatar voice agent has no context_id. Configure a FULL-mode context before applying its voice/model settings.",
        )

    default_voice = avatar.get("default_voice")
    if not isinstance(default_voice, dict):
        default_voice = {}
    voice_id = (
        configured.get("voice_id")
        or agent_config.get("voice_id")
        or default_voice.get("id")
    )
    if not voice_id:
        raise HTTPException(
            status_code=409,
            detail="No LiveAvatar voice is configured for this avatar.",
        )

    persona: dict[str, Any] = {
        "voice_id": voice_id,
        "context_id": context_id,
        "language": agent_config.get("language") or "en",
    }
    selected_model = model or (agent_config.get("llm_settings") or {}).get("model")
    if selected_model:
        if selected_model not in LIVEAVATAR_SUPPORTED_MODELS:
            raise HTTPException(
                status_code=422,
                detail=f"LiveAvatar voice agent uses undocumented managed model '{selected_model}'.",
            )
        persona["llm_settings"] = {
            "provider": "openai",
            "model": selected_model,
        }
    return persona


async def validate_liveavatar() -> dict[str, Any]:
    config = settings()
    if not config.LIVEAVATAR_ENABLED:
        return {
            "enabled": False,
            "authenticated": False,
            "message": "LiveAvatar is disabled by backend configuration.",
        }
    if not config.LIVEAVATAR_API_KEY:
        return {
            "enabled": True,
            "authenticated": False,
            "message": "Set LIVEAVATAR_API_KEY in the backend environment.",
        }
    try:
        credits, avatars = await _liveavatar_health_checks()
        return {
            "enabled": True,
            "authenticated": True,
            "message": "LiveAvatar API key and API access are valid.",
            "credits_left": credits.get("credits_left") if isinstance(credits, dict) else None,
            "public_avatars": len(unwrap_avatar_list(avatars)),
        }
    except HTTPException as exc:
        return {
            "enabled": True,
            "authenticated": False,
            "message": exc.detail,
        }


async def _liveavatar_health_checks() -> tuple[Any, Any]:
    import asyncio

    return await asyncio.gather(
        liveavatar_request("GET", "/v1/users/credits"),
        liveavatar_request("GET", "/v1/avatars/public", params={"page": 1, "page_size": 100}),
    )


async def liveavatar_usage() -> dict[str, Any]:
    import asyncio

    credits, active, historic = await asyncio.gather(
        liveavatar_request("GET", "/v1/users/credits"),
        liveavatar_request("GET", "/v1/sessions", params={"type": "active", "page": 1, "page_size": 100}),
        liveavatar_request("GET", "/v1/sessions", params={"type": "historic", "page": 1, "page_size": 100}),
    )
    active_sessions = unwrap_avatar_list(active)
    historic_sessions = unwrap_avatar_list(historic)
    return {
        "credits_left": credits.get("credits_left") if isinstance(credits, dict) else None,
        "active_sessions": active_sessions,
        "recent_sessions": historic_sessions,
    }


async def create_liveavatar_image(file: UploadFile, resolution: int, emotion: str | None) -> dict[str, Any]:
    content = await file.read(20 * 1024 * 1024 + 1)
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Avatar photo is larger than 20 MB.")
    valid_image = (
        file.content_type == "image/jpeg" and content.startswith(b"\xff\xd8\xff")
    ) or (
        file.content_type == "image/png" and content.startswith(b"\x89PNG\r\n\x1a\n")
    )
    if not valid_image:
        raise HTTPException(status_code=415, detail="Upload a valid JPEG or PNG image.")
    data = {"resolution": str(resolution)}
    if emotion:
        data["emotion"] = emotion
    return await liveavatar_request(
        "POST",
        "/v1-alpha/avatars/image",
        data=data,
        files={"file": (file.filename or "avatar-image", content, file.content_type)},
    )
