# Production readiness and scope

This repository is a substantial **development application**, not a verified production release. Do not advertise it as complete, accept paying customers, or process sensitive identity/voice data until the following are finished and independently tested.

## Implemented in source
- Studio account, ECHO identity, memory visibility, optional provider-backed LLM, browser speech support.
- World communities, connections, consent-based agent introductions, real-time WebSocket room chat and synchronized 3D positional avatars.
- Privacy data export endpoint; basic usage tracking; Docker development stack; CI checks.

## External integrations / unfinished features
- Photorealistic self-likeness avatar generation: NOT implemented. Requires licensed rigged avatars, user consent and a suitable rendering/generation provider.
- Phoneme/viseme-aligned lip sync: NOT implemented; browser speech activity animation is not equivalent.
- Meeting-platform participation: NOT implemented. Browser media stream demonstrations cannot independently join Zoom or Google Meet.
- Spatial voice and distributed multiplayer: NOT implemented; WebSockets are in-memory and work only in a single backend process.
- Live payments: NOT implemented; plan page is informational.
- Autonomous agents: Approved four-turn AI introductions work only when an AI provider is configured; no independent external actions.

## Mandatory launch gates
1. Add verified email, password recovery, CSRF tokens, abuse protections, request limits backed by Redis, audit logs and MFA for privileged users.
2. Add identity and voice consent, revocation, copyright/licensing checks, abuse reporting and moderation, legal review and age restrictions as appropriate.
3. Implement actual payment checkout, verified webhooks, subscription state reconciliation, refunds, taxes and entitlement checks before billing users.
4. Implement encrypted object storage, lifecycle/retention controls, export and deletion flows (including backups and third parties), privacy policy and terms.
5. Replace in-process room state with a distributed presence service; load test concurrent rooms and network recovery.
6. Add database backups with tested restore, secrets management, HTTPS, observability, alerting, SLOs and incident response.
7. Perform dependency scanning, penetration testing, browser E2E, payment E2E and accessibility review.
8. Test actual deployment and ensure every marketed feature has acceptance criteria and verified behavior.

## User consent
Do not clone anyone's face or voice without explicit, revocable authorization. AI representatives must identify themselves and cannot enter meetings without all relevant permissions and platform support.
