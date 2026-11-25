# Security and release controls

## Implemented in this release
- Room access is restricted to owners and accepted connections; room access codes are never returned by API.
- WebSocket sessions validate origin, JWT expiration, account existence and session version.
- Logout invalidates prior session tokens using database-backed session versions.
- Redis-backed atomic rate limiting works across API workers; unavailable Redis fails closed.
- AI chat fails with a service error when no provider is configured (no deceptive demo answer).

## Before public deployment
- Replace local credentials and Docker development configuration with managed secrets.
- Add email verification, password reset, MFA, and suspicious-login notifications.
- Replace process-local room presence with Redis pub/sub or a dedicated room service.
- Add signed webhook verification and subscription billing; never accept payments until tested.
- Add consent-based likeness verification and audit trails before enabling digital replicas.
- Complete threat modeling, security testing, load testing, backup restoration drills and monitoring.
- Enforce HTTPS, secure cookies, strict CSP and proxy trust configuration.
- Obtain appropriate privacy/legal review in launch jurisdictions.

**This release is NOT certified production-ready.**
