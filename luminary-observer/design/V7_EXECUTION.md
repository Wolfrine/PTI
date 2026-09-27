# V7 — Motion Archive

Owner contract: implement, self-review and deploy into the existing production PWA. Keep prior versions selectable. Do not stop at a prototype or ask the owner to inspect images. This supersedes historical owner-preview gates in earlier notes.

## Scope / retained foundation
L3 product experience, with L4-quality motion only at state changes. Retain V2's mineral/graphite palette, Helvetica/Arial hierarchy, disciplined rules, asymmetric desktop composition and quiet capture. Retain actual generated V6 material, shared Firebase/auth/telemetry paths, browser speech-to-text, raw/research separation. Do not add a model API, fake waveform, invented source evidence, engagement reward or ambient loop.

## Plan
1. Isolate a new presentation module and stylesheet, not another cascade of V2–V6 overrides.
2. Make capture a visible state machine: ready → requested → acknowledged → material transferred to the real saved record. Do not animate persistence before a successful write.
3. Preserve source identity through Stream/filter/review and Pattern changes. Reparent existing evidence objects between labelled support/context regions, using measured old/new rectangles. No random placement.
4. Tighten a 4/8px spacing system, shared 48px action minimums, responsive type and PWA safe-area insets.
5. Exercise real shared runtime with isolated Firebase test doubles, including failure, empty, missing source, high-density, reduced-motion and legacy-version paths. Inspect settled renders and motion samples; fix then rerender.
6. Merge and verify actual Firebase production artifacts. Leave a concise evidence/limitations note.

## Mechanisms / references
- Central UI_AGENT_PROTOCOL, EXECUTION_ROUTING, VISUAL_CRITIC and SITE-0006 Material Design: containment and consistent object identity; not borrowed Material component skins.
- Existing local MOTION_REFERENCE_PACK_V4 (Apple Motion, Live Activities, Voice Memos, Readwise Reader, Central Linear): reuse documented state continuity, explicit primary action, source-anchored evidence; this pass does not claim fresh hands-on observation of these products.
- Material's official Understanding motion: informative, focused, expressive transitions; https://m2.material.io/design/motion/understanding-motion/
- Web Animations API lifecycle/cancellation: https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API
- Reduced-motion semantics: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion

## Alternatives
A. **Motion Archive (selected):** generated material becomes a kept observation, then moves between explicit raw/source contexts. Composition remains editorial; every motion has a named state transition.
B. **Optical Field (rejected):** lensing/distortion across a full-canvas field. Attractive but would again require decoding abstract geometry and suggests measurements not in the data.
C. **Kinetic Notebook (rejected):** sliding paper sheets and stamps. Clear but too journal-like and would replace the accepted V2 character.

## Encoding contract
Generated material is an illustration of source kind, not an image of mental state, intensity, quality or causality. Identity is the real observation ID/date. Calendar order and source counts come from loaded records. Pattern grouping comes only from explicit source IDs. Missing sources remain visibly unresolved; no placeholder specimen pretends to be evidence. Never display external pattern examples as the user's actual data.

## Motion specification
Entry: single material reveal; immediately usable control, no repeating loop.
Capture: press response, pending text, then 520ms source-image transfer after acknowledgment; failure remains at origin.
Stream: keyed 360ms reflow on filter/data change; date order unchanged.
Patterns: 520ms measured transfer between support/context containers; content remains usable during motion; repeated selections cancel/rebase prior motion.
Moment: source material travels into expanded context, 420ms; text stays native/readable.
Voice: transcript-activity strokes update only when recognition produces text; not presented as microphone amplitude.
Reduced motion: all information changes immediately, no positional travel. Explicit Profile control plus OS preference. Backgrounding cancels motion.

## Verification status
Implementation complete; self-review performed on desktop 1440×900, mobile 390×844, small phone 360×640 and tablet 768×1024.

The local browser blocks URL navigation by environment policy. Local visual verification therefore executes the actual runtime/module/CSS in an inline browser harness with Firebase doubles. 112 assertions passed: capture acknowledgement and failure, text/voice events, raw chronology/filtering, source-identity-preserving movement, missing evidence, 120-item stream limits, 24-object visible evidence limits, older-source drill-down, reduced motion and five retained UI versions. The committed CI runs those same tests against the normal HTTP/module loader and additionally checks service-worker caching/offline template retrieval before merge.

Rendered critique: the first pass exposed a clipped mobile pattern-title peek and potentially overlapping nav-indicator animations. Replaced the peek with a native mobile pattern chooser and rebased/cancelled indicator movement. Feathered image boundaries without changing the generated material. Reran all four sizes. Motion was sampled mid-transfer, not accepted from reduced-motion-only screenshots.

No new image-generation claim: this pass reuses the actual generated V6 WebP material. It does not add synthetic user records or mental-state imagery. Browser speech is mocked in tests; hardware microphone behavior and a user's Google login require the user's own device.

Outcome: implemented, iterated candidate for direct PWA review. No claim that subjective design taste is solved.
