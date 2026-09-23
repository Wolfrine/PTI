# Luminary Design Direction

Status: Trace Register selected for representative implementation
Updated: 2026-09-23

## Product invariants

Luminary remains:
- an observation instrument, not a dashboard or gamified wellness app;
- phone-first for capture;
- intentionally low-priming;
- non-interpretive during capture;
- externally analyzed rather than LLM-powered in the client;
- separated into raw observation, interpretation, pattern, theory and intervention;
- calm enough for repeated use without demanding attention.

Core actions remain Mark, hold/speak, write, raw-stream review, derived-pattern inspection and moment/context inspection.

## Reference basis

See REFERENCE_PACK_V2.md.

The main mechanisms selected were:
- Dear Data: observation as accumulated trace with explicit visual keys;
- Histography: time as the persistent spatial coordinate;
- Are.na: quiet system clarity rather than decorative UI;
- The Pudding: graphics must correspond to evidence;
- Long Now: duration as material;
- Prague Quadrennial archive: temporal sequence as navigable space;
- Daylight: calm can be light and materially quiet rather than dark-futuristic.

## Art direction A — Trace Register

Design thesis:
Luminary is a continuous temporal register that changes only when something is actually observed.

Visual grammar:
- Typography: system grotesk for primary language; compact mono for timestamps, evidence labels and instrument metadata.
- Composition: one persistent register line / axis; information sits in margins or interrupts the axis instead of living inside repeated cards.
- Spacing: large quiet intervals; density appears only when the record contains density.
- Graphics: ticks, cuts, brackets and trace marks tied to real temporal or evidence relationships.
- Color: warm mineral field, graphite text/lines, one restrained red-orange present/trace signal.
- Interaction: Mark interrupts the register; voice and write remain secondary edge actions.
- Motion: register continuity across state changes, current-time progression, local notch / trace after capture, evidence tracks revealing from actual source dates.
- Desktop: horizontal time field uses width for relationship and context.
- Mobile: the same register becomes vertical so the primary action remains thumb-reachable without turning desktop into a widened phone.

Product metaphor:
Observation creates an irreversible trace in time. Patterns are not explanations; they are recurrence registered against the same record.

Risks:
- Can resemble a medical instrument, financial chart or generic timeline if labels / behavior are weak.
- Can imply false precision if marks are synthesized.
- Excessive micro-labels could make capture feel clinical.

Guardrails:
- No tick is positioned from invented data.
- Patterns without source observation dates show metadata / source-link absence rather than fabricated marks.
- The capture screen remains simpler than the derived-pattern screen.
- The red signal means present / observed trace only; it is not a score, risk or quality state.

## Art direction B — Aperture / Cut

Design thesis:
Observation is a temporary aperture into ongoing reality: the interface reveals a narrow slice without interpreting it.

Visual grammar:
- Typography: neutral sans with abrupt crop relationships.
- Composition: slits, frames and partial reveals that change width with state.
- Spacing: large quiet fields interrupted by one visible aperture.
- Graphics: hard-edged masks / cuts rather than circles or glows.
- Color: neutral field with a single material accent.
- Interaction: Mark closes a brief aperture around the captured instant.
- Motion: mask continuity communicates entering, observing and reviewing.

Product metaphor:
The product selects a moment without claiming to explain it.

Risks:
- The framing metaphor can itself prime what deserves attention.
- It can read as photography / fashion art direction.
- The Mark control can become visually clever but less immediate.

Reference basis:
Editorial crop logic and archive framing mechanisms.

Decision:
Not selected. Conceptually strong but less faithful to the product's non-priming posture.

## Art direction C — Palimpsest / Residue

Design thesis:
Observations accumulate as faint residues whose overlaps become visible only with time.

Visual grammar:
- Typography: repeated text fragments / registration offsets.
- Composition: layered imprints with clear raw-vs-derived separation.
- Spacing: sparse initially; density emerges from accumulated records.
- Graphics: opacity accumulation, overprint, registration marks.
- Color: paper / ink tones with one derived-layer accent.
- Interaction: saving leaves a faint imprint rather than a success animation.
- Motion: new marks settle into prior residue; derived regions emerge from overlap.

Product metaphor:
Meaning is not present at capture; only residue accumulates.

Risks:
- Can become decorative, nostalgic or journal-like.
- Layering can reduce readability and accessibility.
- Visual darkness from overlap could be mistaken for importance or pathology.

Reference basis:
Dear Data's material trace and editorial evidence layering.

Decision:
Not selected. Too close to journal / memory aesthetics and less precise for source-linked pattern evidence.

## Selected direction

Trace Register is selected because it maps directly to Luminary's actual data and epistemic model:
- raw observation already has time;
- Mark naturally becomes a trace rather than an interpreted symbol;
- recurrence can be shown on the same coordinate without causal edges;
- missing source dates can be represented honestly;
- mobile and desktop can share one grammar while changing orientation.

The recognizable idea is therefore not a palette or logo:

present coordinate -> observed trace -> accumulated register -> source-linked recurrence.

## Representative prototype

Prototype surfaces:
- Entry;
- Observe;
- Patterns.

Rendered in both:
- 1440 x 900 desktop;
- 390 x 844 mobile.

Figma was attempted first, but the connected Starter plan hit its MCP tool-call limit. The fallback visual artifact is a browser-rendered HTML/CSS prototype and PNG evidence generated from it.

## Motion rule

Experience choreography:
- Entry to Observe preserves the register as a continuous object.
- Mark creates a short trace deformation / signal at the current coordinate.
- Patterns reveal source-linked ticks along a real date range.

Micro-animation may still be used for touch feedback, focus and dialog transitions, but it is not the identity.

Reduced motion removes animated travel while preserving state changes.

## Asset decision

No generated hero imagery or decorative asset system is required. The information geometry is the product-specific visual material. Adding stock / generated imagery would weaken the observation-instrument identity.

## Implementation scope

Only Entry, Observe and Patterns establish the new language in this pass. Existing Stream, Moment and Account behavior remains intact and receives only compatibility styling needed to coexist with the new tokens.

Do not expand the redesign further until the representative implementation is visually checked again.
