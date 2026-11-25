# ECHO digital-human platform implementation tracker

This tracker reflects the repository and provider state audited on 2026-11-25. “Verified” means checked in this workspace or by a read-only provider response; it does not imply production readiness or end-to-end meeting compatibility. Paid sessions, external-resource changes, and destructive operations require separate approval.

## Phase status

| Phase | Status | Verified baseline and remaining work |
|---|---|---|
| 1. Repository and hardware audit | Implemented and verified | Existing Next.js Pages Router, FastAPI, SQLModel, PostgreSQL, Redis, Docker Compose, WebRTC/WebSockets, and React Three Fiber were inspected. Host: Ubuntu 26.04, Intel i5-7200U (2 cores/4 threads), Intel HD 620, 7.1 GiB RAM (1.5 GiB available at inspection), camera devices `/dev/video0` and `/dev/video1`, and one ALSA capture device. No loaded `v4l2loopback` module or `obs` executable was found. |
| 2. Existing providers and unified discovery | In progress | Existing Tavus REST, Tavus Daily/WebRTC, LiveAvatar FULL/LITE, and provider-specific status/catalog/session paths are present. A shared descriptor registry reports local, Tavus, and LiveAvatar capabilities; local is explicitly not a managed conversation. A full provider adapter contract and migration of all provider operations to it remain. |
| 3. Independent local avatar engine | In progress | Browser-side Three.js/React Three Fiber renderer, starter skinned GLB, private GLB import, and simple speech-activity/mouth animation exist. No facial landmark tracking, natural eye/blink animation, audio-driven visemes, local speech stack, or lightweight/high-quality mode selection is verified. |
| 4. Speak as ECHO | In progress | LiveAvatar LITE streams original microphone PCM to its provider session. This is not a local avatar/audio pipeline and does not provide an OS camera device. Local rendering, camera-source switching, and synchronized local audio/video output remain. |
| 5. Linux virtual camera | Not implemented | No V4L2 loopback module was active and OBS was not installed at audit time. Native bridge, frame publishing, device monitoring, controls, packaging, and installation/troubleshooting guidance remain. |
| 6. External meeting compatibility | Not implemented | No Google Meet, Zoom, Teams, Webex, or Discord camera selection was tested. Do not claim compatibility. |
| 7. Personalized digital humans | In progress | Consent-gated Avatar SDK/LiveAvatar image flows, Tavus HTTPS-media training routes, and private GLB import exist. Ownership verification, robust deletion/retention, local training, and complete provider lifecycle tests remain. |
| 8. Let ECHO Speak | In progress | Existing LiveAvatar FULL and Tavus PAL conversations provide managed cloud conversation paths; optional OpenAI-compatible text chat exists. Local Ollama, dedicated STT/VAD/TTS, local turn management, and human-takeover workflow remain. |
| 9. Autonomous meeting attendance | Not implemented | No ECHO meeting scheduler/orchestrator or verified platform-native bot workflow exists. The Tavus PAL has no conferencing layer in the inspected configuration; configuring it would change an existing external resource and was not performed. |
| 10. ECHO World | In progress | Authenticated shared rooms and WebSocket messages exist. Multi-party media SFU, spatial audio, durable history, moderation and verified scale limits remain. |
| 11. Production hardening and verification | In progress | Targeted provider tests passed (11/11); frontend production build and TypeScript check passed. The full backend suite currently reports 29 passed and one failure in an Avatar SDK test whose settings fixture omits `AVATAR_SDK_ENABLED`. Production security review, provider/WebRTC/browser/E2E/performance validation, billing and operational readiness remain. Frontend has no `test` script. |

## Requirement classifications

| Classification | Current scope |
|---|---|
| Implemented and verified | Tavus MCP read-only health check; existing PAL read; account face/voice reads; deployment and capability reads; existing local 3D renderer and GLB import code; targeted backend provider tests; frontend production build/type check. |
| Implemented but not end-to-end verified | Tavus and LiveAvatar session/media paths; provider catalog and profile flows; consent-gated training; local 3D rendering on this host; ECHO World real-time rooms. |
| In progress | Unified provider abstraction beyond the current descriptor registry; independent local media/AI engine; Speak as ECHO; privacy lifecycle and broad integration tests. |
| Requires external credentials | Tavus and LiveAvatar APIs, optional cloud AI, Avatar SDK generation. Secrets remain backend-side. |
| Requires paid subscription or explicit cost review | Provider-generated live Tavus/LiveAvatar sessions, applicable training/usage, cloud inference, and any paid hosted real-time infrastructure. No billable call was started during this audit. |
| Requires additional hardware or host integration | Reliable local real-time inference beyond lightweight rendering; Linux virtual camera requires a native host component and V4L2/OBS setup; performance depends on CPU, memory, graphics drivers and available devices. |
| Unsupported or unverified | ECHO-managed external meeting bot for Google Meet/Zoom/Teams/Webex/Discord; autonomous attendance or bypasses; OS virtual-camera exposure from a browser-only page. |
| Not implemented | Production billing, local Whisper/Ollama/Piper pipeline, full facial tracking and viseme lip-sync, native desktop bridge, deployment automation, SFU-based spatial rooms, production monitoring and tested cross-platform camera support. |

## Tavus read-only verification

- Tavus MCP health check: configured and authenticated; downstream Tavus API read probe passed.
- Existing PAL `pd98b219b091`: **ECHO Digital Human**, full pipeline, Tavus-hosted LLM model `tavus-gpt-sol`, layers `conversational_flow`, `llm`, and `tts`; default face Emily. No PAL settings were changed.
- The default face is completed and plan-available; its default voice is `destiny`, completed. Tavus face/voice catalogs were readable.
- Existing deployments for this PAL: none returned. Existing conversations returned by the account listing were ended; no new conversation was started.
- Read-only capabilities show Memory, Web Search, and Perception attached; Magic Canvas and Slide Presenter are not attached.
- The PAL configuration returned no conferencing layer or conferencing identity. No meeting configuration was written and no meeting was joined.
- Official deployment paths documented by Tavus include hosted room links, SDK `conversation_url`, Embed, and Widget. ECHO has not verified a deployment or live stream for this PAL.

## Next recommended work

1. Define and test provider adapter contracts for discovery, health, capabilities, usage, estimates, session lifecycle, and unsupported operations; keep existing Tavus/LiveAvatar REST behavior behind those adapters.
2. Decide the local renderer’s supported MVP and implement audio-driven mouth animation and camera/media ownership in-browser before selecting any new ML dependency.
3. Design a Linux virtual-camera bridge as a separately authenticated native component; verify V4L2/OBS feasibility before adding host-level install scripts or claiming compatibility.
4. Evaluate local STT/LLM/TTS and photorealistic models against the audited hardware and verify licenses, dependencies and measured latency before integrating or downloading model weights.
5. Add provider cost/approval gates, local-session tests, integration tests, and hardware/platform-specific acceptance tests before enabling paid or external meeting workflows.
