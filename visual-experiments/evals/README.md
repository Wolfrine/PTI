# Work-owned evaluation contract

**Status: NOT READY — specification and tests not yet authored by Work.**

This directory is the handoff for **Work**, not a Chat-authored visual rubric. Codex will independently select its concept after the baseline evaluation pack is ready.

## Work's assignment

1. Design **outcome-based, concept-agnostic evaluations** for a working visual experience. Do not prescribe a theme, object, aesthetic style, specific framework or predetermined concept.
2. State a testable case ID, intended user experience/action, predeclared expected behavior or review criterion, evidence needed, severity/blocker status, actual grader, environment/viewport and test method. Separate deterministic browser/runtime checks from subjective aesthetic judgment.
3. Cover the meaningful difference between a static/ambient scene and something a visitor can actually explore or affect. Inspect interactions and motion over time rather than accepting screenshots alone.
4. Establish criteria **before inspecting a candidate**, and version/freeze them. If a new concept requires legitimate context-specific tests, record their addition before the relevant implementation is judged; do not retroactively change expectations to produce a pass.
5. Define how Work will independently inspect output and record `pass / fail / blocked / not_run / not_applicable` with provenance. Keep the owner's experience/approval separate. An average score cannot override a critical failure.
6. Include mobile/desktop and relevant accessibility/performance/reduced-motion concerns appropriate to the chosen implementation; don't claim any test was executed merely because its instructions exist.
7. After delivery, document which criteria predicted a meaningful outcome and which were easy to game. Feed only evidence-backed improvements into future **eval versions**, preserving the original result.

Work may add a compact `cases.json`, executable checks and a brief `RUNNING.md` if useful. When the evaluation is runnable/usable, update this status to **READY** and state its version, file locations and prerequisites.

**No tests have been executed or passed in this initial harness setup.** Do not import the wedding's 65 unrun candidate cases as a completed evaluation.
