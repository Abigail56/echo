import asyncio
import io
import ipaddress
import json
import time
import zipfile
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import HTTPException

from app.core.config import settings

API_ROOT = "https://api.avatarsdk.com"
MAX_MODEL_BYTES = 50 * 1024 * 1024
_access_token = ""
_token_expires_at = 0.0
_token_lock = asyncio.Lock()


def _raise_provider_error(response: httpx.Response, operation: str) -> None:
    if response.status_code == 401:
        detail = "Avatar SDK rejected authentication. Verify AVATAR_SDK_CLIENT_ID and AVATAR_SDK_CLIENT_SECRET."
    elif response.status_code == 402:
        detail = "Avatar SDK requires an active API plan or available generation quota."
    elif response.status_code == 403:
        detail = "Avatar SDK denied API access. Check that this application has API access enabled."
    elif response.status_code == 429:
        detail = "Avatar SDK rate limit reached. Wait before retrying."
    else:
        detail = f"Avatar SDK {operation} failed (HTTP {response.status_code})."
    raise HTTPException(status_code=response.status_code if response.status_code in {402, 429} else 502, detail=detail)


async def _token(client: httpx.AsyncClient, *, force_refresh: bool = False) -> str:
    global _access_token, _token_expires_at
    config = settings()
    if not config.AVATAR_SDK_CLIENT_ID or not config.AVATAR_SDK_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="Avatar generation is not configured. Add Avatar SDK credentials to the backend environment.")
    if not force_refresh and _access_token and time.monotonic() < _token_expires_at - 60:
        return _access_token
    async with _token_lock:
        if not force_refresh and _access_token and time.monotonic() < _token_expires_at - 60:
            return _access_token
        try:
            response = await client.post(
                f"{API_ROOT}/o/token/",
                data={"grant_type": "client_credentials"},
                auth=(config.AVATAR_SDK_CLIENT_ID, config.AVATAR_SDK_CLIENT_SECRET),
            )
            if response.is_error:
                _raise_provider_error(response, "authentication")
            payload = response.json()
            token = payload["access_token"]
            token_type = payload["token_type"]
            expires_in = int(payload["expires_in"])
        except HTTPException:
            raise
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise HTTPException(status_code=502, detail="Could not authenticate with the avatar provider.") from exc
        _access_token = f"{token_type} {token}"
        _token_expires_at = time.monotonic() + expires_in
        return _access_token


async def validate_provider_credentials() -> dict[str, str | bool | None]:
    config = settings()
    if not config.AVATAR_SDK_CLIENT_ID or not config.AVATAR_SDK_CLIENT_SECRET:
        return {
            "auth_status": "not_configured",
            "credentials_valid": False,
            "api_accessible": False,
            "message": "Set AVATAR_SDK_CLIENT_ID and AVATAR_SDK_CLIENT_SECRET in the backend environment.",
        }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            token = await _token(client, force_refresh=True)
            response = await client.get(f"{API_ROOT}/avatars/", headers={"Authorization": token})
            if response.is_error:
                _raise_provider_error(response, "API access check")
        return {
            "auth_status": "valid",
            "credentials_valid": True,
            "api_accessible": True,
            "message": "Avatar SDK credentials and API access are valid. Generation still depends on an active plan and quota.",
        }
    except HTTPException as exc:
        if "rejected authentication" in exc.detail:
            status = "invalid_credentials"
        elif "denied API access" in exc.detail:
            status = "api_access_denied"
        elif "active API plan" in exc.detail:
            status = "plan_required"
        elif "rate limit" in exc.detail:
            status = "rate_limited"
        else:
            status = "provider_unavailable"
        return {
            "auth_status": status,
            "credentials_valid": None if status == "provider_unavailable" else status != "invalid_credentials",
            "api_accessible": False,
            "message": exc.detail,
        }
    except httpx.HTTPError:
        return {
            "auth_status": "provider_unavailable",
            "credentials_valid": None,
            "api_accessible": False,
            "message": "Could not reach Avatar SDK. Check network connectivity and retry.",
        }


def _provider_url(value: object, *, api_host_only: bool = False, file_asset: bool = False) -> str:
    if not isinstance(value, str):
        raise HTTPException(status_code=502, detail="Avatar provider returned an invalid model URL.")
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(status_code=502, detail="Avatar provider returned an invalid model URL.")
    hostname = parsed.hostname.lower().rstrip(".")
    if api_host_only and hostname != "api.avatarsdk.com":
        raise HTTPException(status_code=502, detail="Avatar provider returned an invalid status URL.")
    if file_asset:
        try:
            ipaddress.ip_address(hostname)
            raise HTTPException(status_code=502, detail="Avatar provider returned an invalid model URL.")
        except ValueError:
            pass
        allowed_host = (
            hostname == "avatarsdk.com"
            or hostname.endswith(".avatarsdk.com")
            or hostname.endswith(".amazonaws.com")
            or hostname.endswith(".cloudfront.net")
            or hostname == "storage.googleapis.com"
            or hostname.endswith(".storage.googleapis.com")
            or hostname.endswith(".blob.core.windows.net")
        )
        if not allowed_host:
            raise HTTPException(status_code=502, detail="Avatar provider returned an unsupported model host.")
    try:
        port = parsed.port
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Avatar provider returned an invalid model URL.") from exc
    if port not in (None, 443):
        raise HTTPException(status_code=502, detail="Avatar provider returned an invalid model URL.")
    return value


async def _download_model(client: httpx.AsyncClient, url: str, token: str) -> bytes:
    current_url = url
    for _ in range(5):
        parsed = urlparse(current_url)
        headers = {"Authorization": token} if parsed.hostname == "api.avatarsdk.com" else {}
        async with client.stream("GET", current_url, headers=headers) as response:
            if response.is_redirect:
                location = response.headers.get("location")
                if not location:
                    raise HTTPException(status_code=502, detail="Avatar provider returned an invalid model redirect.")
                current_url = _provider_url(urljoin(current_url, location), file_asset=True)
                continue
            response.raise_for_status()
            content_length = response.headers.get("content-length")
            if content_length and int(content_length) > MAX_MODEL_BYTES:
                raise HTTPException(status_code=502, detail="Avatar model exceeds the maximum supported size.")
            chunks = []
            total = 0
            async for chunk in response.aiter_bytes():
                total += len(chunk)
                if total > MAX_MODEL_BYTES:
                    raise HTTPException(status_code=502, detail="Avatar model exceeds the maximum supported size.")
                chunks.append(chunk)
            return b"".join(chunks)
    raise HTTPException(status_code=502, detail="Avatar provider returned too many model redirects.")


async def create_avatar(photo: bytes, filename: str, content_type: str, presentation: str) -> tuple[str, str, int]:
    async with httpx.AsyncClient(timeout=45) as client:
        token = await _token(client)
        try:
            response = await client.post(
                f"{API_ROOT}/avatars/",
                headers={"Authorization": token},
                data={
                    "name": "ECHO avatar",
                    "pipeline": "metaperson_2.1",
                    "pipeline_subtype": presentation,
                    "parameters": json.dumps({"avatar_modifications": {"remove_smile": True}}),
                    "export_parameters": json.dumps({
                        "format": "glb",
                        "lod": "LOD1",
                        "embed": True,
                        "finalize": True,
                        "blendshapes": {"list": ["face_modifications", "body_shape", "visemes_15"]},
                    }),
                },
                files={"photo": (filename, photo, content_type)},
            )
            if response.status_code == 402:
                _raise_provider_error(response, "generation")
            if response.is_error:
                _raise_provider_error(response, "generation")
            payload = response.json()
        except HTTPException:
            raise
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(status_code=502, detail="The avatar provider could not start generation.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="Avatar provider returned an invalid generation response.")
    code = payload.get("code")
    if not isinstance(code, str) or not code or len(code) > 64 or not all(char.isalnum() or char == "-" for char in code):
        raise HTTPException(status_code=502, detail="Avatar provider returned an invalid generation ID.")
    progress = payload.get("progress", 0)
    if isinstance(progress, bool) or not isinstance(progress, int) or not 0 <= progress <= 100:
        raise HTTPException(status_code=502, detail="Avatar provider returned invalid generation progress.")
    return code, str(payload.get("status", "Queued")), progress


def _validate_glb(data: bytes, *, upload: bool = False) -> bytes:
    error_status = 400 if upload else 502
    error_detail = "Upload a valid, self-contained GLB 2.0 model." if upload else "Avatar provider returned an invalid GLB model."
    if len(data) < 20 or len(data) > MAX_MODEL_BYTES or data[:4] != b"glTF":
        raise HTTPException(status_code=error_status, detail=error_detail)
    version = int.from_bytes(data[4:8], "little")
    declared_length = int.from_bytes(data[8:12], "little")
    if version != 2 or declared_length != len(data):
        raise HTTPException(status_code=error_status, detail=error_detail)
    chunks = []
    offset = 12
    while offset < len(data):
        if offset + 8 > len(data):
            raise HTTPException(status_code=error_status, detail=error_detail)
        chunk_length = int.from_bytes(data[offset:offset + 4], "little")
        chunk_type = int.from_bytes(data[offset + 4:offset + 8], "little")
        chunk_start = offset + 8
        chunk_end = chunk_start + chunk_length
        if chunk_length % 4 or chunk_end > len(data):
            raise HTTPException(status_code=error_status, detail=error_detail)
        chunks.append((chunk_type, data[chunk_start:chunk_end]))
        offset = chunk_end
    if not chunks or chunks[0][0] != 0x4E4F534A:
        raise HTTPException(status_code=error_status, detail=error_detail)
    try:
        document = json.loads(chunks[0][1].decode("utf-8").rstrip(" \t\r\n\0"))
        if not isinstance(document, dict) or not isinstance(document.get("asset"), dict) or document["asset"].get("version") != "2.0":
            raise ValueError("Invalid glTF asset declaration")
        if upload:
            pending = [document]
            while pending:
                value = pending.pop()
                if isinstance(value, dict):
                    uri = value.get("uri")
                    if "uri" in value and not isinstance(uri, str):
                        raise ValueError("Invalid GLB resource URI")
                    if isinstance(uri, str) and not uri.startswith("data:"):
                        raise ValueError("External GLB resources are not allowed")
                    pending.extend(value.values())
                elif isinstance(value, list):
                    pending.extend(value)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=error_status, detail=error_detail) from exc
    return data


def validate_imported_glb(data: bytes) -> bytes:
    return _validate_glb(data, upload=True)


def _glb_from_archive(data: bytes) -> bytes:
    if data.startswith(b"glTF"):
        return _validate_glb(data)
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            candidates = [
                member for member in archive.infolist()
                if not member.is_dir() and member.filename.lower().endswith(".glb")
            ]
            if len(candidates) != 1 or candidates[0].file_size > MAX_MODEL_BYTES:
                raise HTTPException(status_code=502, detail="Avatar provider returned an unsupported model archive.")
            return _validate_glb(archive.read(candidates[0]))
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=502, detail="Avatar provider returned an invalid model archive.") from exc


async def get_avatar_status(code: str) -> tuple[str, int | None, bytes | None]:
    async with httpx.AsyncClient(timeout=45) as client:
        token = await _token(client)
        headers = {"Authorization": token}
        try:
            response = await client.get(f"{API_ROOT}/avatars/{code}/", headers=headers)
            if response.is_error:
                _raise_provider_error(response, "generation status")
            payload = response.json()
            status = payload.get("status")
            if not isinstance(status, str):
                raise ValueError("Missing provider status")
            progress = payload.get("progress")
            if isinstance(progress, bool) or not isinstance(progress, int) or not 0 <= progress <= 100:
                progress = 100 if status.lower() == "completed" else None
            if status.lower() != "completed":
                return status, progress, None
            exports_url = _provider_url(payload.get("exports"), api_host_only=True)
            exports_response = await client.get(exports_url, headers=headers)
            if exports_response.is_error:
                _raise_provider_error(exports_response, "avatar export")
            exports = exports_response.json()
            model_urls = [
                file_info["file"]
                for export in exports if isinstance(export, dict)
                for file_info in export.get("files", []) if isinstance(file_info, dict)
                if isinstance(file_info.get("file"), str)
            ]
            if not model_urls:
                raise HTTPException(status_code=502, detail="Avatar provider did not return a GLB export.")
            model_url = _provider_url(model_urls[0], file_asset=True)
            model_archive = await _download_model(client, model_url, token)
            return status, progress if progress is not None else 100, _glb_from_archive(model_archive)
        except HTTPException:
            raise
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            raise HTTPException(status_code=502, detail="Could not retrieve the generated avatar.") from exc
