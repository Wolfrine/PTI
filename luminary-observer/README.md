# Luminary v0.1 — observer-first research capture

Luminary is a phone-first PWA hosted as a secondary Firebase Hosting site inside the PTI Firebase project.

## Principle
The application is intentionally non-interpretive. It captures naturally occurring observations with minimal structure, while external ChatGPT/Work/Codex agents can analyze the Firestore datasets through the PTI MCP.

**There is no AI/LLM API in the Luminary application.**

## Surfaces
- **Observe** — one-tap Mark, hold-to-speak browser speech capture, and free text observation.
- **Timeline** — raw historical observations. Opening it is logged as a review exposure because revisiting history can influence later observation.
- **Discover** — read-only rendering of patterns written by external research agents. The app does not generate them.

## Firestore namespace
All datasets live beneath the signed-in PTI user:

- `users/{uid}/luminaryData/appMeta`
- `users/{uid}/luminaryData/observations/items/{observationId}`
- `users/{uid}/luminaryData/usageEvents/items/{eventId}`
- `users/{uid}/luminaryData/usageDaily/items/{YYYY-MM-DD}`
- `users/{uid}/luminaryData/exposures/items/{eventId}`
- `users/{uid}/luminaryData/patterns/items/{patternId}`

Future agent-owned datasets should use the same shape, for example:
- `derivedEvents/items`
- `relationships/items`
- `theories/items`
- `experiments/items`

## MCP lane
The existing PTI MCP generic Firestore tools can operate directly on these paths. Research agents should never overwrite raw observation documents. Derived records should reference source observation IDs.

## Usage telemetry
Usage events and daily counters are captured from v0.1 so external agents can identify friction and propose development changes based on actual use. The optimization target is useful low-friction capture/return usage, not screen time.

## Voice
v0.1 uses the browser's SpeechRecognition implementation when available and stores the resulting transcript in Firestore. No Luminary-managed speech or LLM API is called. Unsupported browsers fall back to text capture.

## Firebase
Hosting target: `luminary`
Hosting site ID: `pti-app-2ab59-luminary`
