# Visual Experiments — scoped Codex harness

Applies only to `visual-experiments/**`. The owner has designated this folder an **output-first exception** to PTI root's inherited Central visual-design protocol. Existing repository safety, privacy, authorization, code and deployment safeguards still apply. Do not modify Central as part of an experiment.

## First read

1. Read [README.md](README.md), the current [Work eval contract](evals/README.md) and any relevant experiment record.
2. Inspect repo identity, current branch, changes already in progress, existing application build/test/deployment boundaries. Preserve other projects' work.
3. Check whether Work has marked the evaluation pack **ready**. If not, do not claim to have passed an undefined evaluation; use only setup and explicitly label ungraded prototypes.

## Mission and autonomy

**Codex independently selects the actual creative concept.** Do not wait for Chat to pick an illustration style, 3D subject or example site. Do not turn the wedding's Botanical look into a template. Use actual high-quality, relevant visual and interactive references to understand what a viewer can see, do and feel; name the specific mechanisms worth testing and what not to imitate. Make a coherent original artifact, not a remix of generic UI sections.

For each experiment, record the concept, intended viewer experience, meaningful actions and the reason for its selection **before coding**. Follow the Work-defined evals rather than choosing an idea that merely performs well on convenient screenshots. No model-provider comparisons.

## Build, observe, improve

- Create an **actually runnable and interactive** experience. Decorative motion alone cannot establish meaningful interaction. Do not claim interactivity based on an animated still or a screenshot.
- Verify the real opening and at least one substantive working/interactive state on desktop and phone. Check accessible input, reduced motion, error/sparse states where applicable, responsiveness, runtime errors and performance against Work's actual criteria.
- Run objective checks and personally inspect rendered pixels, interactions and temporal behavior. Store reproducible evidence tied to an exact commit/build. Distinguish simulations, fixtures and browser-only checks from real device/cloud behavior.
- Iterate to address visible or tested failures, not to satisfy a fixed cycle count. No self-declared score, aesthetic checklist, build success or passing snapshot substitutes for Work's independent eval or the owner's verdict.
- Use `experiments/<slug>/README.md` and `REPORT.md` as defined in the lab README. Record discarded attempts and decisive corrections; keep a compact final evidence set, not a large diary. Never call blocked, skipped or unrun cases passed.
- If Work's evals are missing, inconsistent or impracticable, report the specific blocker; do not invent a passing rubric. If the chosen concept is failing, change direction rather than polishing an ineffective foundation.

## Release boundary

Use this folder and only a **newly authorized, separately targeted PTI preview/Hosting lane**. Do not alter or deploy to existing wedding/PTI applications or shared production data merely to demonstrate an experiment. Document URL, source revision, build/eval results and live verification separately. Do not publish private materials to the public site.

## Handoff

End each experiment with: **artifact → evidence → eval verdict → owner's verdict/unknown → causal hypotheses → transferable learning**. Work owns the independent interpretation; only validated, repeatable lessons later inform a fresh Central design standard.
