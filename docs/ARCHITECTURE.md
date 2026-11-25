# Architecture

Next.js Pages Router web UI -> FastAPI API -> PostgreSQL; FastAPI uses an optional OpenAI-compatible inference API. Shared rooms currently use authenticated WebSockets and per-process presence. 3D room rendering uses Three.js/React Three Fiber. ECHO knowledge is split into owner-private and public fields. Consent-based AI introductions expose public knowledge only. Billing and high-fidelity likeness pipelines are intentionally not simulated as production features.

## Scaling plan
Use managed PostgreSQL, Redis pub/sub for fanout, a durable job queue, encrypted object storage, signed media URLs, TURN/STUN and an SFU for actual multi-party audio/video, CDN, distributed tracing, and deployment with secrets in a vault. Isolate untrusted uploaded content, verify webhook signatures and enforce plan entitlements server-side.
