# Luminary V4 — Motion & Visual Meaning Reference Pack

Status: Active
Date: 2026-09-24

Focus: only the layers that failed in V2/V3:
- meaningful motion;
- object continuity;
- tactile feedback;
- evidence continuity;
- emotional pacing.

This does not re-open V2 typography/color/layout unless a reference exposes a concrete problem.

## 1. Apple Human Interface Guidelines — Motion

Source:
https://developer.apple.com/design/human-interface-guidelines/motion

Observed:
- Motion should communicate status, feedback and instruction.
- Feedback motion should follow gesture and user expectation.
- Frequent interactions should not force people to wait through repeated animation.
- Motion must remain optional and not be the only information channel.

Transferable mechanism:
- short, action-coupled motion;
- custom motion only where it explains what changed;
- repeated capture should feel lightweight.

Luminary translation:
- Mark confirmation should be brief and precise.
- No ambient looping animation on Observe.
- Reduced-motion keeps state confirmation without spatial travel.

Do not copy:
- platform-specific Liquid Glass behavior or Apple visual styling.

## 2. Apple — Live Activities / Dynamic Island

Sources:
https://developer.apple.com/design/human-interface-guidelines/live-activities
https://developer.apple.com/videos/play/wwdc2024/10145/

Observed:
- When layout changes, preserve as much existing content as possible and animate elements to their new positions.
- Continuity helps users track an object/state as presentation changes.
- Compact, minimal and expanded states represent the same underlying activity.

Transferable mechanism:
- one object can change presentation while preserving identity.

Luminary translation:
- Moment Imprint is the same source object in Observe confirmation, Stream, Moment and Pattern evidence.
- Avoid destroying/recreating unrelated objects between states.

Do not copy:
- Dynamic Island shape, pill forms or system chrome.

## 3. Apple Voice Memos

Source:
https://support.apple.com/guide/iphone/make-a-recording-iph4d2a39a3b/ios

Observed:
- One obvious Record action starts the behavior.
- Waveform/time become feedback after recording starts.
- More detail is available while/after capture.
- Saving creates a persistent recording that can later be reviewed.

Transferable mechanism:
- action first, instrumentation second;
- feedback is evidence of an understood action.

Luminary translation:
- Mark is obvious before any branded motion appears.
- The imprint appears **after** capture begins; the user never has to decode it before acting.

Do not copy:
- waveform, red record-circle convention or audio editor.

## 4. Readwise Reader — Highlights anchored to source

Source:
https://docs.readwise.io/reader/docs/faqs/highlights-tags-notes

Observed:
- Highlighting can happen inline without breaking reading flow.
- An annotation remains tied to its source.
- On wide screens notes/tags can appear in the margin.
- A highlight can navigate back to its original context.

Transferable mechanism:
- derived/secondary material retains a visible source relationship.

Luminary translation:
- Pattern evidence should expose the actual supporting Moment Imprints.
- Tapping an imprint returns to raw Moment context.

Do not copy:
- highlighting color or document-reader chrome.

## 5. Central SITE-0004 — Linear

Source:
Central/design/intelligence/references/SITE-0004-linear.md

Observed:
- restrained, precise, low-chrome visual foundation;
- short proposition beside real product evidence;
- public presentation stays calm while actual product UI carries detail.

Transferable mechanism:
- premium quality does not require decorative spectacle;
- claim and evidence can sit in the same visual beat.

Luminary translation:
- Pattern sentence and supporting moments should be one composition.
- Preserve V2's restraint; motion is not an excuse to add chrome.

## 6. Central SITE-0002 — Squarespace Foundations

Source:
Central/design/intelligence/references/SITE-0002-squarespace-foundations.md

Observed:
- one dominant idea per scene;
- neutral framework lets evidence/artifacts carry visual intensity;
- exploratory motion belongs to the content model.

Transferable mechanism:
- scene clarity and authored pacing.

Luminary translation:
- Observe gets one dominant action.
- Patterns gets one dominant recurrence statement at a time rather than equal-weight cards.

Do not copy:
- spatial image-ring navigation.

## 7. Central SITE-0001 — Seasats

Source:
Central/design/intelligence/references/SITE-0001-seasats.md

Observed:
- interaction is tied to real missions/content;
- repeated comparison fields are stable;
- real evidence appears before abstraction.

Transferable mechanism:
- interaction should manipulate or expose real evidence.

Luminary translation:
- movement of Moment Imprints must correspond to actual stored moments.
- Pattern support is source evidence, not decorative geometry.

## 8. Apple — Spring continuity

Source:
https://developer.apple.com/videos/play/wwdc2023/10158/

Observed:
- animation improves continuity when an object changes position/state.
- discontinuous position or velocity feels unnatural.
- natural easing can make object identity easier to follow.

Transferable mechanism:
- object motion should feel like one thing moving, not one thing disappearing and another appearing.

Luminary translation:
- saved imprint should move from Mark confirmation into “last preserved” / recent record using one continuous trajectory when practical.

Do not copy:
- platform-specific spring constants or native component behavior.

# Extracted V4 mechanisms

1. **Action before instrumentation.**
2. **One source object, multiple presentations.**
3. **Preserve object identity through state changes.**
4. **Claim and evidence share one narrative beat.**
5. **Motion occurs because data/state changed.**
6. **Premium foundation remains restrained; evidence carries intensity.**
7. **Frequent capture motion stays brief.**
8. **Pattern evidence returns directly to raw source.**

# Candidate motion system

## Motion A — Imprint transfer (selected)

Press Mark:
- control compresses ~2–3 px;
- a small warm trace grows from the control edge;
- the trace detaches into a compact Moment Imprint with timestamp;
- imprint travels a short distance to the “Last preserved” area;
- control returns immediately to rest.

Reason:
The motion explains persistence: this instant entered the record.

## Motion B — Field ripple

Press creates a subtle radial distortion and the ripple remains as a source mark.

Rejected:
Too close to abstract consciousness / ambient visual language.

## Motion C — Page stamp

Press creates a physical stamp impression that settles into a notebook-like record.

Rejected:
Too journal-like and materially nostalgic for Luminary.

# Patterns choreography

1. statement appears first;
2. support summary appears;
3. source Moment Imprints reveal in chronological order;
4. selecting an imprint expands source text/context;
5. no connecting edges;
6. no motion implying cause.

# Prototype requirement

Prototype:
- Observe capture choreography;
- Stream continuity;
- one Pattern evidence reveal;
- desktop + mobile;
- reduced-motion behavior.

Owner review before runtime version registration.
