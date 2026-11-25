import asyncio
import struct
import zipfile
from io import BytesIO
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException

from app.services import avatar_sdk
from app.api.avatar import _image_type, avatar_provider_status


def valid_glb():
    json_chunk = b'{"asset":{"version":"2.0"}}'
    json_chunk += b" " * (-len(json_chunk) % 4)
    total_length = 12 + 8 + len(json_chunk)
    return b"glTF" + struct.pack("<II", 2, total_length) + struct.pack("<II", len(json_chunk), 0x4E4F534A) + json_chunk


def test_provider_urls_require_https_and_trusted_provider_host():
    assert avatar_sdk._provider_url("https://api.avatarsdk.com/avatars/abc/", api_host_only=True)
    with pytest.raises(HTTPException):
        avatar_sdk._provider_url("http://api.avatarsdk.com/model.glb", file_asset=True)
    with pytest.raises(HTTPException):
        avatar_sdk._provider_url("https://example.com/model.glb", file_asset=True)


def test_avatar_upload_accepts_only_matching_jpeg_and_png_signatures():
    assert _image_type(b"\xff\xd8\xffphoto", "image/jpeg") == "image/jpeg"
    assert _image_type(b"\x89PNG\r\n\x1a\nphoto", "image/png") == "image/png"
    with pytest.raises(HTTPException):
        _image_type(b"not-a-jpeg", "image/jpeg")
    with pytest.raises(HTTPException):
        _image_type(b"\xff\xd8\xffphoto", "image/png")


def test_provider_status_is_honest_about_available_capabilities(monkeypatch):
    monkeypatch.setattr("app.api.avatar.settings", lambda: SimpleNamespace(
        AVATAR_SDK_CLIENT_ID="",
        AVATAR_SDK_CLIENT_SECRET="",
    ))
    monkeypatch.setattr("app.api.avatar.validate_provider_credentials", lambda: asyncio.sleep(0, result={
        "auth_status": "not_configured",
        "credentials_valid": False,
        "api_accessible": False,
        "message": "Set credentials.",
    }))
    result = asyncio.run(avatar_provider_status(SimpleNamespace(id="test-user")))
    assert result["configured"] is False
    assert result["provider"] == "avatarsdk"
    assert result["capabilities"]["photorealistic_rigged_3d"] is False
    assert result["capabilities"]["photorealistic_video"] is False
    assert result["required_environment"] == ["AVATAR_SDK_CLIENT_ID", "AVATAR_SDK_CLIENT_SECRET"]
    assert result["capabilities"]["glb_import"] is True


def test_provider_credentials_validate_oauth_and_api_access(monkeypatch):
    requests = []

    def handler(request):
        requests.append(request)
        if request.url.path == "/o/token/":
            return httpx.Response(200, json={"access_token": "test-token", "token_type": "Bearer", "expires_in": 36000})
        assert request.url.path == "/avatars/"
        assert request.headers["authorization"] == "Bearer test-token"
        return httpx.Response(200, json=[])

    original_client = httpx.AsyncClient

    def client_factory(*args, **kwargs):
        return original_client(*args, transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(avatar_sdk.httpx, "AsyncClient", client_factory)
    monkeypatch.setattr(avatar_sdk, "settings", lambda: SimpleNamespace(
        AVATAR_SDK_CLIENT_ID="client-id",
        AVATAR_SDK_CLIENT_SECRET="client-secret",
    ))
    monkeypatch.setattr(avatar_sdk, "_access_token", "")
    monkeypatch.setattr(avatar_sdk, "_token_expires_at", 0.0)

    result = asyncio.run(avatar_sdk.validate_provider_credentials())

    assert result["auth_status"] == "valid"
    assert result["credentials_valid"] is True
    assert result["api_accessible"] is True
    assert len(requests) == 2


def test_provider_credentials_report_invalid_auth_without_secrets(monkeypatch):
    def handler(request):
        return httpx.Response(401, json={"error": "invalid_client"})

    original_client = httpx.AsyncClient

    def client_factory(*args, **kwargs):
        return original_client(*args, transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(avatar_sdk.httpx, "AsyncClient", client_factory)
    monkeypatch.setattr(avatar_sdk, "settings", lambda: SimpleNamespace(
        AVATAR_SDK_CLIENT_ID="bad-client-id",
        AVATAR_SDK_CLIENT_SECRET="do-not-return-this",
    ))

    result = asyncio.run(avatar_sdk.validate_provider_credentials())

    assert result["auth_status"] == "invalid_credentials"
    assert result["credentials_valid"] is False
    assert "AVATAR_SDK_CLIENT_SECRET" in result["message"]
    assert "do-not-return-this" not in result["message"]


def test_avatar_archive_extracts_and_validates_glb_without_writing_files():
    model = valid_glb()
    archive = BytesIO()
    with zipfile.ZipFile(archive, "w") as zipped:
        zipped.writestr("../avatar.glb", model)
    assert avatar_sdk._glb_from_archive(archive.getvalue()) == model
    with pytest.raises(HTTPException):
        avatar_sdk._glb_from_archive(b"not-a-model")


def test_glb_import_rejects_external_resources_and_invalid_json():
    external_glb = b'{"asset":{"version":"2.0"},"buffers":[{"uri":"https://example.com/model.bin"}]}'
    external_glb += b" " * (-len(external_glb) % 4)
    total_length = 12 + 8 + len(external_glb)
    payload = b"glTF" + struct.pack("<II", 2, total_length) + struct.pack("<II", len(external_glb), 0x4E4F534A) + external_glb
    with pytest.raises(HTTPException) as exc_info:
        avatar_sdk.validate_imported_glb(payload)
    assert exc_info.value.status_code == 400


def test_avatar_provider_upload_uses_oauth_and_requested_visemes(monkeypatch):
    requests = []

    def handler(request):
        requests.append(request)
        if request.url.path == "/o/token/":
            return httpx.Response(200, json={"access_token": "test-token", "token_type": "Bearer", "expires_in": 36000})
        assert request.url.path == "/avatars/"
        assert b"metaperson_2.1" in request.content
        assert b"visemes_15" in request.content
        assert b"image/jpeg" in request.content
        return httpx.Response(201, json={"code": "avatar-code-123", "status": "Queued", "progress": 0})

    original_client = httpx.AsyncClient

    def client_factory(*args, **kwargs):
        return original_client(*args, transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(avatar_sdk.httpx, "AsyncClient", client_factory)
    monkeypatch.setattr(avatar_sdk, "settings", lambda: SimpleNamespace(
        AVATAR_SDK_CLIENT_ID="client-id",
        AVATAR_SDK_CLIENT_SECRET="client-secret",
    ))
    monkeypatch.setattr(avatar_sdk, "_access_token", "")
    monkeypatch.setattr(avatar_sdk, "_token_expires_at", 0.0)

    code, status, progress = asyncio.run(avatar_sdk.create_avatar(b"\xff\xd8\xffphoto", "selfie.jpg", "image/jpeg", "female"))

    assert code == "avatar-code-123"
    assert status == "Queued"
    assert progress == 0
    assert len(requests) == 2
    assert requests[0].headers["authorization"].startswith("Basic ")


def test_completed_avatar_downloads_provider_glb(monkeypatch):
    model = valid_glb()

    def handler(request):
        if request.url.path == "/o/token/":
            return httpx.Response(200, json={"access_token": "test-token", "token_type": "Bearer", "expires_in": 36000})
        if request.url.path == "/avatars/avatar-code/":
            return httpx.Response(200, json={
                "status": "Completed",
                "exports": "https://api.avatarsdk.com/avatars/avatar-code/exports/",
            })
        if request.url.path == "/avatars/avatar-code/exports/":
            return httpx.Response(200, json=[{"files": [{"file": "https://api.avatarsdk.com/files/avatar.glb"}]}])
        if request.url.path == "/files/avatar.glb":
            return httpx.Response(200, content=model)
        raise AssertionError(f"Unexpected provider request: {request.url}")

    original_client = httpx.AsyncClient

    def client_factory(*args, **kwargs):
        return original_client(*args, transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(avatar_sdk.httpx, "AsyncClient", client_factory)
    monkeypatch.setattr(avatar_sdk, "settings", lambda: SimpleNamespace(
        AVATAR_SDK_CLIENT_ID="client-id",
        AVATAR_SDK_CLIENT_SECRET="client-secret",
    ))
    monkeypatch.setattr(avatar_sdk, "_access_token", "")
    monkeypatch.setattr(avatar_sdk, "_token_expires_at", 0.0)

    status, progress, downloaded = asyncio.run(avatar_sdk.get_avatar_status("avatar-code"))
    assert status == "Completed"
    assert progress == 100
    assert downloaded == model


def test_avatar_status_returns_provider_progress(monkeypatch):
    def handler(request):
        if request.url.path == "/o/token/":
            return httpx.Response(200, json={"access_token": "test-token", "token_type": "Bearer", "expires_in": 36000})
        assert request.url.path == "/avatars/avatar-code/"
        return httpx.Response(200, json={"status": "Processing", "progress": 42})

    original_client = httpx.AsyncClient

    def client_factory(*args, **kwargs):
        return original_client(*args, transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(avatar_sdk.httpx, "AsyncClient", client_factory)
    monkeypatch.setattr(avatar_sdk, "settings", lambda: SimpleNamespace(
        AVATAR_SDK_CLIENT_ID="client-id",
        AVATAR_SDK_CLIENT_SECRET="client-secret",
    ))
    monkeypatch.setattr(avatar_sdk, "_access_token", "")
    monkeypatch.setattr(avatar_sdk, "_token_expires_at", 0.0)

    assert asyncio.run(avatar_sdk.get_avatar_status("avatar-code")) == ("Processing", 42, None)
