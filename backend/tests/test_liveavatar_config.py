import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.live_avatar import (
    SANDBOX_AVATAR_ID,
    _session_sandbox,
    _upsert_echo_context,
    _validate_public_https_url,
)
from app.services.live_avatar import (
    configured_liveavatar_avatars,
    configured_tavus_avatars,
    liveavatar_persona,
    resolve_tavus_face_id,
    tavus_face_payloads,
)
from app.services.avatar_providers import avatar_provider_registry


def test_provider_registry_keeps_local_engine_available_without_remote_credentials():
    registry = avatar_provider_registry(SimpleNamespace(
        LIVEAVATAR_ENABLED=False,
        LIVEAVATAR_API_KEY="",
        TAVUS_ENABLED=False,
        TAVUS_API_KEY="",
        TAVUS_PAL_ID="",
    ))

    assert registry["local"]["available"] is True
    assert registry["local"]["credentials_required"] is False
    assert registry["local"]["billable"] is False
    assert registry["local"]["capabilities"]["3d_preview"] is True
    assert registry["local"]["capabilities"]["managed_conversation"] is False
    assert registry["liveavatar"]["available"] is False
    assert registry["tavus"]["available"] is False


def test_configured_liveavatar_slots_preserve_avatar_voice_and_model_mapping():
    config = SimpleNamespace(
        **{
            f"LIVEAVATAR_AVATAR_{slot}_{field}": value
            for slot, values in enumerate(
                [
                    ("avatar-1", "voice-1", "gpt-4o-mini"),
                    ("avatar-2", "voice-2", "gpt-5.4-nano"),
                    ("avatar-3", "voice-3", "gpt-4o"),
                    ("avatar-4", "voice-4", "gpt-5-nano"),
                    ("avatar-5", "voice-5", "gpt-4o-mini"),
                    ("avatar-6", "voice-6", "gpt-5.4-nano"),
                ],
                start=1,
            )
            for field, value in zip(("ID", "VOICE_ID", "MODEL"), values)
        }
    )

    slots = configured_liveavatar_avatars(config)

    assert len(slots) == 6
    assert slots[0] == {
        "slot": 1,
        "id": "avatar-1",
        "voice_id": "voice-1",
        "model": "gpt-4o-mini",
    }
    assert slots[-1]["id"] == "avatar-6"
    assert slots[-1]["voice_id"] == "voice-6"
    assert slots[-1]["model"] == "gpt-5.4-nano"


def test_tavus_faces_merge_eight_configured_slots_with_available_provider_faces():
    config = SimpleNamespace(
        TAVUS_AVATAR_1_ID="face-1",
        TAVUS_AVATAR_1_NAME="Configured face",
        TAVUS_AVATAR_2_ID="face-not-ready",
        TAVUS_AVATAR_2_NAME="Pending face",
    )
    faces = [
        {
            "face_id": "stock-face",
            "face_name": "Stock face",
            "status": "completed",
        },
        {
            "face_id": "face-1",
            "face_name": "Configured face from provider",
            "status": "completed",
            "thumbnail_video_url": "https://provider.test/preview.mp4",
        },
        {
            "face_id": "face-not-ready",
            "face_name": "Pending face",
            "status": "training",
        },
        {
            "face_id": "plan-restricted",
            "face_name": "Restricted face",
            "status": "completed",
            "available_for_plan": False,
        },
    ]

    slots = configured_tavus_avatars(config)
    payloads = tavus_face_payloads(faces, config, default_face_id="face-1")

    assert len(slots) == 2
    assert [face["id"] for face in payloads] == [
        "face-1",
        "face-not-ready",
        "plan-restricted",
        "stock-face",
    ]
    assert payloads[0]["name"] == "Configured face from provider"
    assert payloads[0]["configured"] is True
    assert payloads[0]["slot"] == 1
    assert payloads[0]["preview_url"] == "https://provider.test/preview.mp4"
    assert payloads[0]["selectable"] is True
    assert payloads[0]["is_default"] is True
    assert payloads[1]["configured"] is True
    assert payloads[1]["selectable"] is False
    restricted_face = next(face for face in payloads if face["id"] == "plan-restricted")
    assert restricted_face["available_for_plan"] is False
    assert restricted_face["selectable"] is False


def test_tavus_face_fallback_prefers_explicit_then_saved_then_pal_default():
    assert resolve_tavus_face_id("selected", "saved", "pal-default") == "selected"
    assert resolve_tavus_face_id(None, "saved", "pal-default") == "saved"
    assert resolve_tavus_face_id(None, None, "pal-default") == "pal-default"


def test_tavus_training_urls_require_public_https():
    assert _validate_public_https_url("https://cdn.example.com/face.mp4", "Training video") == "https://cdn.example.com/face.mp4"
    for url in (
        "http://cdn.example.com/face.mp4",
        "https://localhost/face.mp4",
        "https://127.0.0.1/face.mp4",
        "https://user:password@cdn.example.com/face.mp4",
    ):
        with pytest.raises(HTTPException) as invalid:
            _validate_public_https_url(url, "Training video")
        assert invalid.value.status_code == 422


def test_liveavatar_persona_applies_configured_voice_and_model():
    persona = liveavatar_persona(
        {"default_voice": {"id": "default-voice"}},
        {"voice_id": "configured-voice", "model": "gpt-5.4-nano"},
        {
            "agent_type": "liveavatar_agent",
            "agent_configuration": {
                "voice_id": "agent-voice",
                "context_id": "context-id",
                "language": "en",
            },
        },
    )

    assert persona == {
        "voice_id": "configured-voice",
        "context_id": "context-id",
        "language": "en",
        "llm_settings": {"provider": "openai", "model": "gpt-5.4-nano"},
    }


def test_liveavatar_persona_uses_agent_voice_and_model_when_slot_has_no_overrides():
    persona = liveavatar_persona(
        {"default_voice": {"id": "avatar-voice"}},
        {},
        {
            "agent_type": "liveavatar_agent",
            "agent_configuration": {
                "voice_id": "agent-voice",
                "context_id": "context-id",
                "llm_settings": {"provider": "openai", "model": "gpt-4o-mini"},
            },
        },
    )

    assert persona["voice_id"] == "agent-voice"
    assert persona["llm_settings"] == {
        "provider": "openai",
        "model": "gpt-4o-mini",
    }


def test_liveavatar_persona_accepts_an_explicit_echo_context():
    persona = liveavatar_persona(
        {"default_voice": {"id": "avatar-voice"}},
        {},
        {"agent_configuration": {}},
        context_id_override="echo-context",
    )

    assert persona == {
        "voice_id": "avatar-voice",
        "context_id": "echo-context",
        "language": "en",
    }


def test_sandbox_rejects_non_sandbox_avatars_but_allows_wayne():
    sandbox_config = SimpleNamespace(LIVEAVATAR_SANDBOX=True)
    production_config = SimpleNamespace(LIVEAVATAR_SANDBOX=False)

    assert _session_sandbox(sandbox_config, SANDBOX_AVATAR_ID) is True
    with pytest.raises(HTTPException) as unavailable:
        _session_sandbox(sandbox_config, "configured-avatar")
    assert unavailable.value.status_code == 409
    assert _session_sandbox(production_config, "configured-avatar") is False


def test_echo_context_only_includes_private_knowledge_after_opt_in(monkeypatch):
    calls = []

    async def fake_liveavatar_request(method, path, *, json_body=None):
        calls.append((method, path, json_body))
        return {"id": "provider-context"}

    class FakeSession:
        def __init__(self):
            self.commits = 0

        def add(self, _record):
            pass

        def commit(self):
            self.commits += 1

    monkeypatch.setattr("app.api.live_avatar.liveavatar_request", fake_liveavatar_request)
    echo = SimpleNamespace(
        name="ECHO",
        personality="Helpful",
        public_knowledge="Public fact",
        private_knowledge="Private fact",
        liveavatar_context_id=None,
    )
    db = FakeSession()

    first_context = asyncio.run(_upsert_echo_context(echo, False, db))
    second_context = asyncio.run(_upsert_echo_context(echo, True, db))

    assert first_context == second_context == "provider-context"
    assert calls[0][0:2] == ("POST", "/v1/contexts")
    assert "Public fact" in calls[0][2]["prompt"]
    assert "Private fact" not in calls[0][2]["prompt"]
    assert calls[1][0:2] == ("PATCH", "/v1/contexts/provider-context")
    assert "Private fact" in calls[1][2]["prompt"]
    assert db.commits == 2


def test_liveavatar_persona_rejects_unsupported_model_and_missing_context():
    with pytest.raises(HTTPException) as unsupported:
        liveavatar_persona(
            {},
            {"model": "not-a-liveavatar-model"},
            {
                "agent_type": "liveavatar_agent",
                "agent_configuration": {
                    "voice_id": "voice-id",
                    "context_id": "context-id",
                },
            },
        )
    assert unsupported.value.status_code == 422

    with pytest.raises(HTTPException) as missing_context:
        liveavatar_persona(
            {},
            {"voice_id": "voice-id"},
            {
                "agent_type": "liveavatar_agent",
                "agent_configuration": {"voice_id": "voice-id"},
            },
        )
    assert missing_context.value.status_code == 409
