# ECHO — Studio + World (integrated development release)

ECHO is a Next.js Pages Router + FastAPI + PostgreSQL application combining a **personal AI representative studio** and a **consent-based social foundation**.

## Visual identity

The Studio, ECHO World, avatar preview, and public landing page share a cinematic visual system: near-black `#050507`, secondary `#0D0B14`, surface `#151020`, electric magenta `#F000D4`, royal purple `#7928FF`, electric blue `#2563EB`, and white/lavender text. Space Grotesk is used for display typography and Geist for interface text.

The original fibre-optic line artwork lives at `frontend/public/echo-fiber-trails.svg`; portrait photography is served by [Unsplash under its license](https://unsplash.com/license). ECHO profiles without their own portrait use a name-derived monogram rather than a fabricated human likeness or glowing orb.

## What actually works

- Email/password accounts, Argon2 hashes, HTTP-only cookie sessions, logout
- ECHO identity creator, customization, public profiles, and a shared skinned 3D starter avatar
- HeyGen LiveAvatar API authentication/status checks, dynamic public/account avatar catalogue, six configured avatar slots, saved per-user selection, and FULL/LITE session creation
- Official `@heygen/liveavatar-web-sdk` FULL-mode video/session client; LITE video room and provider WebSocket audio path with 24 kHz mono PCM conversion and documented chunk buffering
- Explicit per-session consent before sending an ECHO persona/public knowledge to a reusable LiveAvatar context; private knowledge requires a separate opt-in and consent scope is persisted
- Optional consent-gated Avatar SDK Cloud API integration for generating and loading a user's rigged GLB avatar; independent from LiveAvatar credentials
- Private and public chat; optional OpenAI-compatible chat endpoint (`AI_API_KEY`); without it, explicit demo mode
- Owner-managed memories with private/public visibility, deletion, and AI chat context
- Browser speech recognition and text-to-speech when supported (not real-time streaming or voice cloning)
- World discovery, community creation/joining, text posts, connection requests, consent-based AI introductions
- Intro transcript templates (not independent autonomous agents)
- Free-plan chat usage counter and a billing overview (NO live payment collection)
- PostgreSQL Alembic migrations, Docker Compose, starter tests

## Not yet implemented

End-to-end live video streaming has not been verified in this environment during this update. LiveAvatar photo-avatar creation is currently an Alpha image API, not video/webcam-recording upload. Tavus face/voice training is available only through the provider's public-HTTPS-media URL APIs and has not been live-tested here. A native OS virtual camera, autonomous Google Meet/Zoom/Teams attendance, ECHO World distribution of personal models, autonomous agent negotiations, push notifications, moderation queues, payment processing, GDPR-grade data export/deletion workflows, production monitoring, and production security audit are not claimed as finished.

## Quick start (Ubuntu, Docker)

```bash
cp .env.example .env
python3 -c 'import secrets; print(secrets.token_urlsafe(48))'
# Paste generated secret as JWT_SECRET_KEY in root .env
# Set LIVEAVATAR_API_KEY in .env to enable provider-backed video sessions.
# LIVEAVATAR_SANDBOX=true allows only HeyGen's Wayne sandbox avatar.
# Set it to false to use the six configured/production avatars (provider credits apply).
# Optional: set AI_API_KEY and AI_MODEL for ECHO's own AI endpoints.
docker compose up --build -d
docker compose ps
```

Open **http://localhost:3000**. API docs: **http://localhost:8001/docs**. DB is on localhost:5435.

To inspect logs: `docker compose logs -f backend`.

To let users on your tailnet access ECHO over private HTTPS, follow the
[Tailscale setup](docs/TAILSCALE.md).

## LiveAvatar provider setup and verified scope

The primary provider is HeyGen LiveAvatar. The official SDK is installed for the Next.js Pages Router client; the API key remains exclusively in the FastAPI backend. Existing six-slot settings are `LIVEAVATAR_AVATAR_1_ID` through `_6_ID`, with matching `_VOICE_ID` and `_MODEL` variables. They are passed through Docker Compose and are not exposed by provider status responses.

1. Create a LiveAvatar API key in the [LiveAvatar developer portal](https://app.liveavatar.com/developers).
2. Keep the existing root `.env` and set `LIVEAVATAR_API_KEY` there. Do not put it in `NEXT_PUBLIC_*` variables or source control. The six avatar/voice/model groups can be configured independently.
3. Use `LIVEAVATAR_SANDBOX=true` only with the documented Wayne avatar (`dd73ea75-1218-4ef3-92ce-606d5f7fbc0a`); Sandbox sessions are short and limited to about one minute. To use the six configured avatars, deliberately set `LIVEAVATAR_SANDBOX=false`. Production sessions use provider credits (FULL: 2/minute; LITE: 1/minute).
4. Apply/restart with `docker compose up --build -d`. The backend runs Alembic migrations on startup. `/api/v1/avatar/providers/status` reports authentication and provider access without returning credentials; the Avatar Studio fetches the provider catalogue and saves a user's selected avatar in PostgreSQL.
5. In `/meeting`, FULL mode uses LiveAvatar's managed speech-recognition/LLM/TTS pipeline. It is AI-operated and uses the configured provider voice. Selecting an ECHO persona is optional and requires an explicit consent checkbox; private knowledge has a separate consent checkbox. Authorized persona/context IDs and the scope/timestamp of each session consent are stored in PostgreSQL. Do not share sensitive information without reviewing the provider's retention terms.
6. LITE mode passes the user's selected microphone audio to LiveAvatar as 24 kHz mono PCM for provider-driven video animation. It preserves the user's voice but does not transcribe, understand, or answer the speaker; it is not an autonomous conversation pipeline. The backend applies a five-session-creation-per-minute user rate limit, validates session ownership, tracks session state/consent, and exposes provider usage/credits.

Avatar Studio retrieves public/account avatars, previews provider-supplied thumbnails/video where available, and offers an Alpha image-avatar creation pathway with explicit likeness consent. The documented API does not provide a video-recording-to-avatar endpoint; webcam capture currently submits a still frame. Some account tiers restrict image training and 1080p output. Direct voice cloning is not a LiveAvatar raw-recording API.

The browser displays real provider video only after a provider session starts; build success and authentication checks do not prove video delivery. A browser page cannot create a selectable Ubuntu OS camera device: OBS/v4l2loopback or another host media bridge is still required. ECHO does not autonomously join Meet, Zoom, or Teams.

Avatar SDK remains optional for ECHO World 3D models and requires its own `AVATAR_SDK_CLIENT_ID` and `AVATAR_SDK_CLIENT_SECRET`; it is not required for video avatars. Tavus remains optional via `TAVUS_API_KEY` and `TAVUS_PAL_ID`.

The local browser-rendered 3D avatar is an independent provider and remains available without LiveAvatar, Tavus, or Copilot MCP. `/api/v1/avatar/catalog` reports the local renderer alongside the remote providers and marks its capabilities accurately: it previews/imports GLB models but does not create remote live-video or managed-conversation sessions. ECHO uses the Tavus REST API directly from FastAPI; Copilot MCP is optional developer tooling, not an application runtime dependency.

### Optional Tavus provider setup

The backend needs `TAVUS_API_KEY`, `TAVUS_PAL_ID`, and `TAVUS_ENABLED=true`. Set them only in the root `.env`; do not use frontend `NEXT_PUBLIC_*` variables for secrets. The eight optional `TAVUS_AVATAR_1_ID`/`TAVUS_AVATAR_1_NAME` through `TAVUS_AVATAR_8_ID`/`TAVUS_AVATAR_8_NAME` pairs prioritize your configured, provider-ready faces in the library. Docker Compose passes these values only to the backend. Restart with `docker compose up --build -d backend` after configuring them.

The workspace `.mcp.json` is only for Copilot agent tool discovery. It uses the portable `mcpServers` format and references `${TAVUS_API_KEY}` without storing the key. Copilot's local or remote agent host must have that environment variable itself; the backend's `.env` loading does not automatically populate the Copilot process. If its MCP tools are missing, check the selected Copilot harness, server output, and successful `initialize`/`tools/list` requests. The app does not depend on MCP.

Check `GET /api/v1/avatar/providers/status` for PAL access before attempting a call. A valid API key alone does not establish that the account has an accessible PAL, that a face is available, or that streaming works. In `/meeting`, choose Tavus and start a session to join its Daily-backed WebRTC room. The microphone is requested before joining, and transport quality and video readiness are shown from actual WebRTC state. Tavus Full Pipeline is AI-operated and uses the provider's configured voice; use LiveAvatar LITE when preserving the speaker's original microphone voice is required. Firefox may omit some transport statistics. No external Google Meet/Zoom/Teams system-camera bridge is supplied by the Tavus SDK.

Avatar Studio offers Tavus face and voice training using publicly reachable HTTPS URLs. The user must separately host the authorized image/video/audio media; ECHO does not upload those files to a media host. Face creation requires consent and provider-side training; image-trained faces require a supported stock voice name or an ECHO-owned Tavus voice ID, while video-trained faces use audio from the video. Voice creation also requires rights consent. The interface polls and displays provider training status and errors. Provider permissions, model availability, identity verification, and plan restrictions still apply. Creating a face or voice does not guarantee that the PAL can use it; selection and a completed provider conversation are required to test that.

## Migration and existing data

The backend Docker entrypoint runs `alembic upgrade head` (see backend/Dockerfile). Migration `0009_liveavatar_consent` adds provider context references and persisted photo/persona consent metadata. Keep your existing Docker volume when upgrading. Back up the database before applying migrations.

## Safety and privacy boundaries

Only explicitly public memories are included in public chat. Private chat requires ownership. AI identity disclosure is shown in UI. Introductions require recipient approval and share public taglines only. Tavus offers consent-gated custom voice training from a publicly hosted audio URL, but it has not been live-tested here and is not represented as the user's original voice passthrough. This is a **development build**: before deployment, add strong CSRF protection, durable rate limiting, email verification, password resets, moderation/reporting, secure secret storage, backup/restore, and operational monitoring. Do not deploy it as-is for public paid usage.

## Development

Frontend: `cd frontend && npm install && npm run dev`

Backend: `cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && uvicorn app.main:app --reload` (requires local Postgres and backend environment variables).

Tests: `cd backend && pytest -q`.

## Project roadmap

1. Identity and permission hardening, data export/deletion
2. Verify Avatar SDK Cloud API generation, consent, deletion, and model delivery end-to-end
3. Map generated visemes to facial blendshapes and share authorized avatar models in ECHO World
4. Agent protocols with scoped grants, audit logs and revocation
5. Social moderation and privacy controls
6. Payment provider integration and verified webhooks
7. Scale testing, observability, accessibility, production readiness


## Immersive additions
- `/avatar-lab`: 3D procedural human and speech animation demo.
- `/meeting`: browser avatar video stream demo; not a video-conference bot.
- `/world/rooms`: authenticated WebSocket live text rooms.
- `/world/inbox`: approved AI-to-AI dialogue; requires AI_API_KEY for model replies.

Read `IMPLEMENTATION_STATUS.md` for exact limitations and production checklist.

## Security update
See [Start Here](docs/START_HERE.md), [Feature Status](docs/FEATURE_STATUS.md), and [Security Hardening](docs/SECURITY_HARDENING.md). This engineering release is not certified for public production deployment.
