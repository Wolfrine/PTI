# Luminary — Experience System v1

Figma source of truth: https://www.figma.com/design/S22P1eeLrgbEYQGRzuxvfY

## Product posture

Luminary is not a dashboard, wellness tracker, journal, or gamified habit app. It is a responsive observation instrument.

The interface should feel:
- quiet
- alive
- precise
- slightly unfamiliar
- non-demanding
- premium without decoration for its own sake

The user should feel that the app is a field they enter, not a utility they operate.

## Experience sequence

### 00 — Entry / Field
Purpose: transition from normal device use into observation without priming the user with theory.

Visual:
- deep near-black field
- layered orbital geometry
- very low-contrast cyan / violet / mint radiance
- editorial headline
- single dominant Enter Observe action

Motion:
- 6s ambient field breathing
- orbital drift below 4% positional change
- headline / copy staged reveal 380–480ms
- CTA settles from 0.96 scale to 1.0

### 01 — Observe
Purpose: capture with minimum cognitive structuring.

Primary actions:
- Mark
- Hold to speak
- Write observation

Rules:
- no categories
- no ratings
- no streaks
- no prompts describing what the user should notice
- no AI interpretation in the app

Visual:
- central signal/orb field
- one tactile Mark control
- two secondary capture surfaces
- bottom navigation is deliberately quiet

Motion:
- central field breathes on 4.8s loop
- rings counter-drift subtly
- editorial content reveals in hierarchy
- Mark settles from 0.92 to 1.0, then breathes to 1.018 max

### 02 — Stream
Purpose: show what remained, before interpretation.

Content:
- raw marks
- voice transcripts
- text observations
- chronology only

Motion:
- events emerge left-to-right with 35ms micro-stagger
- each event resolves within ~380ms
- event signals pulse once when entering
- no infinite motion in the content list

### 03 — Patterns
Purpose: render structures written by external research agents.

Important:
- patterns are observations about the dataset, not explanations
- causality remains separate
- app does not generate these records

Visual:
- emergent network field
- low-density node system
- insight content below the field
- explicit "Not an explanation" surface

Motion:
- nodes emerge sequentially from 0.45 scale
- connection lines appear after nodes
- lower insight content follows after the field resolves
- node field breathes very slightly, not continuously demanding attention

### 04 — Moment / Detail
Purpose: inspect one historical observation and its context / known relationships.

Content:
- raw observation
- context before / after
- user-linked relationships
- exposure notice

Rule:
Opening a moment is itself an exposure and should be logged because review may influence subsequent observation.

Motion:
- focal signal breathes on 4.8s loop
- detail hierarchy reveals progressively
- context cards enter after primary observation

## Visual system

### Color

| Token | Value | Role |
|---|---|---|
| field | #07101C | deepest application field |
| surface | #0C1622 | elevated observation surfaces |
| signal | #8CE6FF | information / active signal |
| life | #9EFFD1 | current / living / selected state |
| unknown | #A185FF | unresolved / emergent structure |
| caution | #FFC46D | interpretive caution |

Use restrained alpha. Most surfaces should differ by luminance, not obvious card borders.

### Typography

- Instrument Serif — meaning, reflection, primary editorial statements
- Instrument Sans — controls, metadata, captions, system information

Typography is intentionally dual:
- serif = experienced meaning
- sans = system structure

### Shape

- generous corner radii
- circular / orbital geometry for consciousness field
- thin lines
- no heavy shadows
- glow is a signal state, not decoration

## Motion grammar

### Reveal
- opacity 0 → 1
- y +12–18px → 0
- 380–480ms
- ease-out / spring-out

### Shared transition
- 520–680ms
- preserve spatial continuity
- avoid hard screen replacement

### Touch
- scale to 0.985
- short signal/glow increase
- settle 180–240ms

### Ambient
- 4.8–8s loops
- maximum 4% movement
- avoid synchronized repetitive motion
- must tolerate reduced-motion mode

## Implementation stack

Preferred:
- Motion.js for component transitions, gestures, springs and shared-layout motion
- GSAP only for sequences / field choreography where Motion becomes awkward
- Lenis only where a genuinely scroll-driven surface benefits from it
- Rive only for a focal interactive state machine that cannot be expressed efficiently in DOM/SVG

Do not add technology solely to imitate award-site complexity.

## Performance rules

- transform and opacity first
- avoid animating layout properties in hot paths
- use blur only on large low-frequency ambient layers
- keep DOM node count low
- lazy-load non-critical visual systems
- reduced-motion path is mandatory
- target smooth mobile interaction before desktop spectacle

## Product rules

1. One dominant action per state.
2. No engagement loops based on streaks, badges, rewards or compulsion.
3. Product telemetry optimizes useful capture and return usage, not screen time.
4. AI remains external to the app.
5. Raw observation, interpretation, pattern, theory and intervention remain separate data layers.
6. Review and derived-pattern exposure must be recorded.
7. Motion must communicate hierarchy, continuity, state or causality of interface behavior. Otherwise remove it.

## v1 Figma screens

- Entry / Field
- Observe
- Stream
- Patterns
- Moment / Detail
- Art Direction board

The Figma file contains actual keyframed motion for the five-screen experience.