# ECHO Studio + World — extended source package

This archive is an **engineering development release** and is **not a fully production-certified commercial app**. The user-requested vision is larger than what can responsibly be claimed from a generated code archive. Read `docs/PRODUCTION_READINESS.md` for exact gaps.

## Start
1. `cp .env.example .env` and set `JWT_SECRET_KEY` to a securely generated random value.
2. `docker compose up --build -d`
3. Visit `http://localhost:3000`; API docs at `http://localhost:8000/docs`.
4. For live AI, configure `AI_API_KEY` and `AI_MODEL` in `.env`.

## What was added in this revision
- Live 3D World rooms showing multiple synchronized user avatars and chat (single backend worker).
- Server-side positional WebSocket events with authentication, origin checks and bounds checks.
- Privacy account export endpoint (`GET /api/v1/account/export`).
- CI checks, architecture and release/production readiness documentation.

## Important limitations
Not a photorealistic likeness creator, viseme lip-sync service, independent meeting participant, spatial-audio world, or live billing integration. Those require external providers, identity verification, infrastructure and full testing.
