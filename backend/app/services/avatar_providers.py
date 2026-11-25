from typing import Any


def avatar_provider_registry(config: Any) -> dict[str, dict[str, Any]]:
    liveavatar_configured = bool(config.LIVEAVATAR_API_KEY)
    tavus_configured = bool(config.TAVUS_API_KEY and config.TAVUS_PAL_ID)
    return {
        "local": {
            "id": "local",
            "name": "ECHO Local 3D",
            "kind": "browser_renderer",
            "enabled": True,
            "configured": True,
            "available": True,
            "billable": False,
            "credentials_required": False,
            "capabilities": {
                "3d_preview": True,
                "glb_import": True,
                "live_video": False,
                "managed_conversation": False,
            },
            "message": "Available locally in Avatar Studio; does not require a remote provider or MCP.",
            "error": None,
        },
        "liveavatar": {
            "id": "liveavatar",
            "name": "LiveAvatar",
            "kind": "managed_video",
            "enabled": bool(config.LIVEAVATAR_ENABLED),
            "configured": liveavatar_configured,
            "available": False,
            "billable": True,
            "credentials_required": True,
            "capabilities": {
                "3d_preview": False,
                "glb_import": False,
                "live_video": True,
                "managed_conversation": True,
                "audio_passthrough": True,
            },
            "message": (
                "LiveAvatar is disabled."
                if not config.LIVEAVATAR_ENABLED
                else "Set LIVEAVATAR_API_KEY in the backend environment."
                if not liveavatar_configured
                else "LiveAvatar availability has not been verified."
            ),
            "error": None if liveavatar_configured and config.LIVEAVATAR_ENABLED else (
                "LiveAvatar is disabled."
                if not config.LIVEAVATAR_ENABLED
                else "Set LIVEAVATAR_API_KEY in the backend environment."
            ),
        },
        "tavus": {
            "id": "tavus",
            "name": "Tavus",
            "kind": "managed_video",
            "enabled": bool(config.TAVUS_ENABLED),
            "configured": tavus_configured,
            "available": False,
            "billable": True,
            "credentials_required": True,
            "capabilities": {
                "3d_preview": False,
                "glb_import": False,
                "live_video": True,
                "managed_conversation": True,
                "face_catalog": True,
                "voice_catalog": True,
            },
            "message": (
                "Tavus is disabled."
                if not config.TAVUS_ENABLED
                else "Set TAVUS_API_KEY and TAVUS_PAL_ID in the backend environment."
                if not tavus_configured
                else "Tavus PAL availability has not been verified."
            ),
            "error": None if tavus_configured and config.TAVUS_ENABLED else (
                "Tavus is disabled."
                if not config.TAVUS_ENABLED
                else "Set TAVUS_API_KEY and TAVUS_PAL_ID in the backend environment."
            ),
        },
    }
