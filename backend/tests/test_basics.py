from app.api.schemas import EchoCreate
from app.api.routes import SpeechIn, avatar_speech
from app.models.entities import User
from fastapi import Request
from pydantic import ValidationError
from uuid import uuid4

def test_valid_echo():
    item = EchoCreate(handle="my-echo", name="My ECHO")
    assert item.is_public is False

def test_speech_voice_is_limited_to_supported_synthetic_voices():
    assert SpeechIn(text="Hello", voice="en-gb").voice == "en-gb"
    try:
        SpeechIn(text="Hello", voice="custom")
    except ValidationError:
        pass
    else:
        raise AssertionError("Unsupported voice should be rejected")
    try:
        SpeechIn(text="   ")
    except ValidationError:
        pass
    else:
        raise AssertionError("Blank speech should be rejected")

def test_speech_endpoint_returns_generated_audio(monkeypatch):
    import app.api.routes as routes

    monkeypatch.setattr(routes.shutil, "which", lambda _: "/usr/bin/espeak-ng")
    monkeypatch.setattr(routes, "limit", lambda *args: None)

    def generate_audio(command, **kwargs):
        assert kwargs["check"] is True
        assert kwargs["timeout"] == 15
        assert kwargs["input"] == "Hello"
        assert command[-1] == "--stdin"
        output_path = command[command.index("-w") + 1]
        with open(output_path, "wb") as audio_file:
            audio_file.write(b"RIFFtest")

    monkeypatch.setattr(routes.subprocess, "run", generate_audio)
    request = Request({
        "type": "http",
        "method": "POST",
        "path": "/api/v1/avatar/speech",
        "headers": [],
        "client": ("127.0.0.1", 1234),
    })
    user = User(id=uuid4(), email="avatar@example.com", name="Avatar", password_hash="unused")

    response = avatar_speech(SpeechIn(text="Hello"), request, user)

    assert response.media_type == "audio/wav"
    assert response.body == b"RIFFtest"
