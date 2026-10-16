# PTI Visual Experiments

**Status:** Harness initialized 16 October 2026. Work evaluation pack: **pending**. Codex concept: **not chosen**. No experiment has been implemented or deployed.

## Purpose

Create original, working visual experiences in PTI; determine what actually makes them compelling, interactive and reliable; then use repeatable evidence to **rewrite** `Wolfrine/Central/design` from scratch. The current Central design process is neither a prerequisite nor the target of incremental patching for this lab.

The lab does **not** prescribe a theme, genre, aesthetic, technology, scene or implementation concept. Codex selects an ambitious concept independently after Work makes the evaluation contract ready. There is no comparison of model providers.

## Ownership and sequence

| Owner | Responsibility | Deliverable |
| --- | --- | --- |
| **Chat** | Define compact objective, boundaries and agent harness; preserve scope | This README and [AGENTS.md](AGENTS.md) |
| **Work** | Define outcome-first evaluation, assess evidence independently and identify transferable mechanisms | Versioned [evals/](evals/README.md) and verdict on each experiment |
| **Codex** | Independently choose a concept, study appropriate real visual/interactive references, implement, iterate, test and document | A runnable experiment with inspected evidence and evaluation results |
| **Human owner** | Judge the experience and accept/reject its visual impact | Explicit verdict; agent scores never impersonate approval |

1. **Work prepares and freezes an initial, concept-agnostic evaluation pack** before Codex commits to a concept. Work owns the criteria, test method, blockers and evidence format, not art direction.
2. **Codex selects one concept** on its own, explains the desired viewer experience and actions in a brief, and records actual inspected references. The result must be a working experience, not a picture of one.
3. **Codex implements and runs the evals**, captures actual mobile/desktop views and relevant interactions over time, fixes consequential failures, and reports remaining unknowns. No fixed number of iterations or compulsory direction boards.
4. **Work independently checks claims** against the frozen evals and inspected evidence; human taste remains a separate verdict. A documented checklist, mockup or self-score is not acceptance.
5. **Record conclusive findings** (including rejected attempts). Only demonstrably reusable findings from multiple different experiences should inform a later ground-up Central design rewrite.

## Experiment record — keep it small

For each independent experiment use `experiments/<slug>/`:

- `README.md`: selected concept and why, intended experience, real references, local run steps, implementation location and optional live URL.
- `REPORT.md`: exact revision and eval version; evaluated user actions; objective test outcomes; actual screenshots/video/interaction observations; independent verdict and owner verdict; known gaps; **what worked, what failed, why, and what to try next**.
- `evidence/`: only the important source-identified screenshots, video/samples and reproducible test artifacts; keep bulky disposable output out of Git.
- Code and assets alongside these documents, or linked from the README. Do not create extra governance documents without evidence they are useful.

Reports distinguish observed facts from hypotheses and specify which changes contributed to the improvement. Do not generalize from one attractive screenshot.

## Deployment and isolation

The lab stays within **Wolfrine/PTI**. A single separately targeted PTI Firebase Hosting site or preview lane may be added when the first runnable experiment requires one; **none is provisioned by this setup**. Do not disturb the existing PTI main site, wedding site, functions, authentication, private data or Firestore rules. Prefer path-scoped CI and verified build/host parity; no unreviewed deploy of experiment code into an existing site's assets.

## Source-specific lessons from the wedding release

These are **observed mechanisms, not proven causes** of its visual quality:

- [Recorded facts and uncertainty](../wedding-planner/WEDDING_RECORD.md) kept the product credible.
- [Separate guest/family intent](../wedding-planner/README.md) made functional success identifiable.
- [Original visual concept images](../wedding-planner/design/concepts/README.md) and [explicit rejected/active design contracts](../wedding-planner/design/botanical/BRIEF.md) gave implementation real evidence and a corrected direction.
- [Actual browser and independent critique](../wedding-planner/design/botanical/CRITIQUE.md), [implementation proof](../wedding-planner/IMPLEMENTATION.md) and [wedding release workflow](../.github/workflows/wedding.yml) connected outputs to tests and deployment.
- The [65 proposed wedding eval cases](../wedding-planner/evals/README.md) are explicitly marked **not run**. Do not credit them as passed tests or reuse their domain rules as the visual lab's evaluation.

**Central/design remains unchanged during experimentation.** A future rewrite should cite experiments, held-out transfer attempts, owner verdicts and unresolved limitations rather than accumulating another theory corpus.
