# Luminary Reference Pack v3 — Intuition First

Status: Active for v3 re-derivation  
Observed: 2026-09-24

Goal: correct the failure of Trace Register by learning from products where the primary action is obvious before the visual system is understood.

## 1. Apple Voice Memos
Source: https://support.apple.com/guide/iphone/iph4d2a39a3b/ios

Observed:
- A single Record action starts the core behavior immediately.
- During recording, waveform and time are feedback about an action already understood.
- More advanced detail is revealed after the user starts recording.
- The list of recordings is separate from the capture act.

Transferable mechanism:
- Primary action first; instrumentation second.
- Feedback follows action instead of becoming the thing the user must decode.

Do not copy:
- literal waveform aesthetic, red circular record button, audio-specific editor chrome.

Luminary translation:
- Mark must be unambiguously actionable before any branded visual behavior appears.

## 2. Day One
Sources:
- https://dayoneapp.com/guides/getting-started-with-day-one/creating-entries/
- https://dayoneapp.com/guides/tips-and-tutorials/journal-views-in-day-one-for-ios/

Observed:
- New entry is accessible through a familiar persistent create action.
- Historical content is primarily a chronological list; Calendar/Media/Map are alternate perspectives rather than the default mental model.
- Dates group records in a way that needs almost no explanation.

Transferable mechanism:
- Familiar capture affordance plus chronological review reduces learning cost.

Do not copy:
- journaling language, streaks, prompts, memory sentimentality.

Luminary translation:
- Stream should read like an obvious record of moments, not a visualization puzzle.

## 3. Apple Journal
Sources:
- https://www.apple.com/in/newsroom/2023/12/apple-launches-journal-app-a-new-app-for-reflecting-on-everyday-moments/
- https://support.apple.com/guide/iphone/-iph0e5ca7dd3/ios

Observed:
- Create-entry behavior is explicit.
- Rich capture modes are available after the user chooses to create.
- Reviewing past entries uses conventional browsing/search/calendar structures.
- The product explains privacy in direct language.

Transferable mechanism:
- Make capture modes available without turning them into an abstract metaphor.
- Use plain language for privacy and state.

Do not copy:
- reflection prompts, suggestion system, streaks/insights, gratitude framing.

Luminary translation:
- Mark / Speak / Write should read immediately as three capture depths.

## 4. Readwise Reader
Sources:
- https://docs.readwise.io/reader/docs/faqs/highlights-tags-notes
- https://readwise.io/reader/update-august2023

Observed:
- Highlighting is intentionally low-friction.
- Notes stay anchored to their source.
- On wider screens, annotations can use margins without disturbing the primary reading flow.
- Notebook view makes saved evidence first-class while preserving navigation back to source.

Transferable mechanism:
- Derived or secondary information should stay visibly tied to the raw source.
- Wide-screen space can add context without reinventing the interaction.

Do not copy:
- document-reader chrome, highlight colors, sidebar-heavy density.

Luminary translation:
- Patterns should lead with a human-readable statement, with supporting moments directly underneath or one click away.

## 5. Are.na
Source: https://www.are.na/about

Observed:
- Content accumulation is central; interface styling remains restrained.
- The product is framed as a mindful place to save and connect material over time.
- Distinctiveness comes from the model of use and community culture more than spectacular chrome.

Transferable mechanism:
- Let product behavior create identity; the UI can stay familiar.

Do not copy:
- blocks/channels taxonomy or social/community model.

Luminary translation:
- Do not demand that every screen visibly advertise a metaphor.

## 6. The Pudding
Source: https://pudding.cool/

Observed:
- Strong data stories normally lead with the statement/question, then use graphics as evidence.
- Visualizations work because the reader knows what claim or phenomenon is being inspected.
- Annotation makes the graphic legible.

Transferable mechanism:
- Meaning before representation.

Do not copy:
- scrollytelling or editorial spectacle where a direct application surface is better.

Luminary translation:
- Patterns page should first answer "What repeats?" in plain language; evidence graphics are secondary.

# Extracted principles

1. Familiar interaction can carry a distinctive product if the underlying behavior is specific.
2. Instrumentation is feedback, not the first thing a user should decode.
3. Capture depth should be obvious: instant mark -> voice -> text.
4. Chronology is already a learned interface pattern; do not over-encode it.
5. Derived patterns should be sentences first and graphics second.
6. Emotional tone comes from pacing, typography, material and language—not necessarily from abstract geometry.
7. Desktop can add contextual margins / evidence while preserving the same obvious core action.
8. Privacy and epistemic boundaries should be stated plainly.

# V3 art directions

## Direction A — Moment Capture

Design thesis:
Luminary should feel like a calm capture tool: one obvious action for preserving a moment, with optional depth and later evidence.

Visual grammar:
- Familiar centered or clearly anchored primary action.
- Human-scale typography; sentence case.
- Soft neutral material field with a warm accent used only for an actual capture.
- Strong labels, normal buttons, minimal symbolic decoding.
- Small "imprint" behavior appears after capture and can recur in Stream as identity.
- Patterns use plain-language statement -> support count -> source moments.

Feeling:
Quiet, immediate, trustworthy, personal without being sentimental.

Risk:
Can become too ordinary if the imprint/capture behavior has no distinct character.

## Direction B — Field Notes

Design thesis:
Luminary is a disciplined field notebook for lived observation.

Visual grammar:
- Page / margin structure.
- Time and raw observations feel written into a log.
- Mark behaves like a simple stamp.
- Patterns read like annotations in the margin.

Feeling:
Human, thoughtful, serious.

Risk:
Can feel like a journal, research notebook, or nostalgic paper simulation.

## Direction C — Quiet Recorder

Design thesis:
Luminary is a precise recorder with familiar controls and subtle live-state feedback.

Visual grammar:
- Clean instrument panel, but conventional controls.
- State indicators appear only during capture.
- Review surfaces use restrained recording-log structures.
- Patterns are evidence summaries, not charts.

Feeling:
Focused, competent, calm.

Risk:
Can become sterile/technical and repeat the clinical problem of Trace Register.

# Selection

Direction A — Moment Capture is the leading candidate.

Reason:
It directly corrects the production failure: the primary action and meaning are obvious without sacrificing the product's low-priming behavior. It also allows one branded interaction—the capture imprint—to carry identity without forcing every screen into an unfamiliar spatial metaphor.

# Prototype rules

Before implementation:
- prototype Entry, Observe, Patterns;
- show desktop + mobile to owner before merge/deploy;
- no abstract timeline/register as hero;
- Patterns must be understandable without reading a legend;
- no prompt, score, streak or in-app interpretation during capture;
- no production deployment until owner accepts representative visual evidence.
