# ECHO Studio + ECHO World: start here

This is a **development engineering release**, not a production-certified application.

## Run locally
1. Install Docker Engine and Docker Compose plugin.
2. Copy `.env.example` to `.env` and set a long random `JWT_SECRET_KEY`.
3. Run `docker compose up --build`.
4. Open http://localhost:3000 and http://localhost:8000/docs.
5. To enable AI dialogue, configure `AI_API_KEY` and provider settings in `.env`.

## What changed in this release
- Redis shared rate limiting (fails closed if Redis is unavailable).
- Room authorization for accepted connections and room owners.
- Session invalidation on logout, including WebSocket validation.
- Removal of misleading demo AI responses when no provider is configured.
- New Alembic migration `0004_session_revocation`.

See `docs/FEATURE_STATUS.md` and `docs/SECURITY_HARDENING.md` for limitations.

## Verification performed
Python syntax compilation and ZIP archive integrity checks. Full dependency builds, browser tests, real provider integrations and security audits have **not** been completed.
