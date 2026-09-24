# Luminary UI Review Notes

## Review — 2026-09-23 — Living Instrument v1

### What worked
- Product posture: observation before interpretation.
- Capture actions were simple and understandable.
- Raw observation, derived pattern, causality and intervention remained separated.
- Reduced-motion and performance intent were considered.

### Why v1 was rejected
- dark field;
- cyan / mint / violet radiance;
- concentric/orbital geometry;
- glowing point;
- generic network nodes for Patterns;
- rounded surfaces and pill CTA;
- serif-as-premium paired with utility sans;
- fade / translate / scale / pulse as most of the motion language.

The visual system plausibly fit many unrelated AI, meditation, consciousness, scientific or future products.

## Review — 2026-09-23 — Trace Register representative prototype

Evidence:
- 1440 x 900 desktop renders for Entry, Observe and Patterns.
- 390 x 844 mobile renders for Entry, Observe and Patterns.
- Browser-rendered HTML/CSS fallback used because Figma MCP was rate-limited.

### Central Visual Critic

1. What is the single recognizable visual idea?
A persistent temporal register. The present is a coordinate; capture leaves a trace; derived recurrence is shown against the same register.

2. Could this belong to another AI/startup/wellness product if the logo changed?
Not without meaningful redesign. The system depends on longitudinal capture and evidence-linked recurrence rather than generic intelligence / wellness symbolism. It could resemble a scientific or archival instrument, which is a useful risk to manage.

3. Which three decisions look most AI-generated?
- Oversized editorial Entry headline.
- Large amounts of fashionable negative space.
- Mono micro-labels paired with a single red accent.
These remain only because each now has structural work: the headline defines the state transition, negative space prevents priming, and mono labels distinguish instrument metadata. If they become ornamental during implementation, remove them.

4. Is hierarchy created through composition or merely font size?
Composition. The register divides the field, labels occupy margins, the current mark interrupts the axis, and supporting actions sit outside the primary coordinate.

5. Is imagery / geometry participating in structure?
Yes. There is no decorative hero image. The register is both the visual identity and the information geometry.

6. Does motion communicate something?
The prototype is static evidence, but the implementation motion specification is semantic: register continuity, present progression and mark-to-trace change. Generic ambient motion is excluded.

7. Does desktop use space meaningfully?
Yes. Desktop uses horizontal width as temporal context and separates capture controls into margins rather than centering a phone-sized card.

8. Is Patterns uniquely Luminary?
Substantially more than v1. It represents longitudinal recurrence without causal edges. The main remaining risk is looking like a generic analytical timeline. The guardrail is strict: ticks must map to actual source observation dates; otherwise no synthetic geometry is shown.

9. What remains memorable after looking away?
A very thin observation register crossing a quiet mineral field, interrupted by one red trace at the present.

10. Outcome
PASS to limited representative implementation, with a required second check on the actual runtime.

### Concrete weaknesses to watch in implementation
- Do not let the register become chart chrome everywhere.
- Do not overuse red; it means present / trace only.
- Do not let metadata labels grow until Observe feels clinical.
- Preserve minimum 44 px touch targets even when controls are visually thin.
- Patterns must gracefully handle absent source IDs / dates.

### Next gate
Implement Entry, Observe and Patterns only, then render mobile and desktop again. Expansion to Stream / Moment / Account requires the runtime render to retain the concept.


## Review — 2026-09-23 — Trace Register runtime gate

Evidence:
- Actual branch HTML/CSS rendered in Chromium at 1440 x 900 and 390 x 844.
- Entry capture was repeated after the register-entry choreography had settled; the evidence therefore represents the resting composition rather than a transient animation frame.
- Static JavaScript syntax and DOM-contract checks passed.
- Mocked-browser product-flow verification passed using the real app.js: sign-in state transition, Mark, text capture, Stream load, source-linked Patterns rendering, explicit no-synthetic-position handling and sign-out.
- No production Firestore records were written by the test.
- PTI production Angular build passed.
- The pre-existing Angular unit suite still reports 8 failures / 1 success because its test modules do not provide Auth / Firestore. These failures are outside luminary-observer and were reproduced without changing those specs.

### Central Visual Critic — runtime

1. What is the single recognizable visual idea?
The observation register: a continuous temporal coordinate that becomes a trace at capture and an evidence track at pattern review.

2. Could this page belong to another AI/startup/wellness product if the logo were changed?
Not plausibly without changing the central geometry and behavior. The remaining adjacency is to scientific / archival instruments, which is intentional and more product-relevant than the rejected AI-futurist vocabulary.

3. Which three decisions look most AI-generated?
- The oversized Entry headline.
- Deliberately large negative-space fields.
- Mono micro-labels plus one red accent.
They are retained only where they perform structural work. They should not be copied indiscriminately to later screens.

4. Is hierarchy created through composition or merely font size?
Composition. The axis creates the field; present / trace interrupts it; secondary capture actions sit at the edge; Patterns puts evidence on the axis and explanation beneath it.

5. Is imagery / geometry participating in structure?
Yes. No decorative hero imagery is required. The same geometry communicates present time, capture state and longitudinal evidence.

6. Does motion communicate something?
Yes. Entry draws the register into place; authentication preserves register continuity where supported; Mark creates a trace deformation; pattern tracks reveal their temporal extent. Reduced-motion removes travel while retaining the state change.

7. Does desktop use space meaningfully?
Yes. Desktop width becomes temporal context. Observe is not a centered mobile card, and Patterns uses the full horizontal span for recurrence.

8. Is Patterns uniquely Luminary?
Yes, within the current product scope. Recurrence is source-linked to observation dates, no causal edges are drawn, and missing linkage is rendered as "NO SYNTHETIC POSITION" rather than invented geometry.

9. What remains memorable after looking away?
A warm mineral field crossed by a thin register, with one red interruption marking the observed present.

10. Outcome
PASS.

### Runtime weaknesses retained for later refinement
- Compact pattern labels can truncate; the detailed cards remain the full textual reading layer.
- On mobile Entry the vertical register deliberately passes through the headline field. It remains legible, but should not become a general typography effect.
- The register must remain a meaningful coordinate rather than becoming decorative chrome on every future screen.

### Next implementation step
Propagate Trace Register carefully to Stream and Moment detail, using actual observation timestamps and existing exposure rules. Account remains low priority. Do not add new metaphors.


## Review — 2026-09-24 — Stream + Moment extension

Evidence:
- Real app.js executed in Chromium with deterministic Firebase mocks at 1440 x 900 and 390 x 844.
- Stream register used five real mocked observation timestamps spanning 20–23 Sep.
- Register seek scrolled to the corresponding raw record without opening or reinterpreting it.
- Moment opened from a raw Mark, preserved the existing raw-observation exposure write, rendered three same-day timestamps on a local-day register, and showed the factual immediately-before / immediately-after records.
- Source-linked Patterns behavior remained intact.
- Mobile Moment was changed from a reduced desktop dialog to a full-screen detail state.
- No production Firestore records were written.

### Visual critic — Stream

Recognizable idea:
A time-bound overview sits above the raw record; every tick is caused by an observation timestamp and leads back to the original record.

Generic-risk check:
A timeline is not unique by itself. The Luminary-specific behavior is the combination of raw-only chronology, no scoring, Mark-as-trace, source-bound positioning, and direct return from geometry to the underlying observation.

Hierarchy:
Desktop uses the full horizontal span for temporal context and separates it from the raw reading layer. Mobile keeps the register compact and lets the raw record remain the dominant reading surface.

What could become generic:
- using a timeline simply as decoration;
- adding charts, counts or density claims that are not necessary for review;
- turning the raw stream into dashboard analytics.

Outcome:
PASS.

### Visual critic — Moment

Recognizable idea:
One observation is isolated as a focal trace inside its actual local day, while nearby raw observations remain explicitly temporal context rather than relationships.

Desktop:
A contextual overlay preserves visible continuity with the Stream behind it.

Mobile:
A full-screen detail state is more intentional than a scaled-down desktop modal and preserves readable context.

Epistemic check:
- nearby-before / nearby-after is derived only from record order and timestamps;
- the Relations section still states that temporal proximity is not causality;
- opening the moment still logs review exposure.

What could become generic:
- the desktop overlay remains a conventional interaction shell;
- the identity therefore comes from the local-day register and evidence hierarchy, not the modal itself.

Outcome:
PASS.

### Extension result

Trace Register now holds across Entry, Observe, Stream, Patterns and Moment without adding a second metaphor. Account remains intentionally low-priority functional chrome.


## Owner review — 2026-09-24 — Trace Register rejected

Owner feedback:
- "still nothing intuitive"
- "Don't know what to make of it."
- "Don't know what to feel."
- "Strange pattern and layout but nothing meaningful."

Diagnosis:
- Trace Register solved the generic-AI problem but over-corrected into conceptual art direction.
- The interface asked the user to decode the visual system before the product became obvious.
- Time geometry became the protagonist instead of capture.
- The page communicated rigor but not a clear emotional state.
- Patterns emphasized representation before meaning; the user saw lines/ticks before understanding the actual recurring observation.
- Mono micro-labels, sparse fields and evidence registers made the product feel clinical.
- Distinctiveness was achieved by unfamiliarity rather than by a familiar interaction executed in a product-specific way.

New rule:
> Product identity must never cost immediate affordance.

For Luminary, a first-time user should understand within seconds:
1. I can mark this moment.
2. I can add voice or text if I want.
3. Later I can review what happened.
4. Patterns are plain-language observations about recurrence, not abstract graphics.

Trace Register may remain only as a secondary evidence device where it genuinely clarifies chronology. It is rejected as the primary visual metaphor.
