# Visual Experiments

**Goal:** Build working visual experiences in PTI, evaluate real outcomes, and use supported learnings to later rewrite `Wolfrine/Central/design`. Do not change Central during experiments.

## Roles and order

1. **Chat** maintains the project structure and harness.
2. **Work** defines versioned, concept-neutral evals in [evals/](evals/README.md) before concept selection, then independently reviews results.
3. **Codex** selects its own concept, creates a runnable experience, runs the evals, and improves it based on observed results.
4. **Owner** accepts or rejects the actual experience. Do not infer owner approval.

## Evidence

Keep each attempt in `experiments/<slug>/`. Include source and one short `README.md` recording: concept, how to run it, eval version and results, actual evidence, observed corrections, remaining issues and conclusions. Separate observations from hypotheses. Retain only evidence useful for verification.

A single successful experiment does not establish a general design rule.

**Status at setup (16 October 2026):** harness only. Work evals, Codex concept, implementation and hosting have not been created in this folder.
