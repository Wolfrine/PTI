# Visual experience evals v1.0.0

**Status: ready for concept selection.** Criteria precede the concept. No experience has been built, tested or accepted here. Codex chooses the concept, medium, style and implementation. These evals judge outcomes, not effect count, complexity, realism, palette or a prescribed layout.

## Two gates

1. **Technical:** repeatable browser checks plus the manual checks automation cannot cover.
2. **Experience:** humans directly use the candidate and judge the rubric below. Automated passes, screenshots and agent scores cannot establish exceptional quality.

Use `pass`, `fail`, `blocked`, `not_run`, `not_applicable` for individual checks. Missing tooling/evidence is `blocked` or `not_run`, never pass. Work must approve a reason for any `not_applicable`; core interaction and the six dimensions cannot be waived. The owner verdict is separate.

## Observable rubric (human judgment)

Score each dimension **0 absent/broken; 1 superficial or materially impaired; 2 competent; 3 strong throughout the tested journey; 4 exceptional, supported by specific observed moments**. A still image can support composition judgment, not the interaction/motion scores. Use the conditions below to distinguish levels 2–4; record a counterexample as well as supporting evidence.

| Dimension | Competent (2) | Strong / exceptional (3 / 4) | Failure / superficial signal (0–1) |
|---|---|---|---|
| Visual impact | Focal subject/action is readable; elements belong together. | 3: hierarchy, detail and composition hold in initial and changed states. 4: after use, reviewer can recall a distinctive visual relationship and explain how it strengthened the experience. | Impressive opening conceals weak working states; competing effects obscure the subject; only adjectives support the score. |
| Meaningful interaction | A real input produces understandable feedback. | 3: two different inputs/paths produce predictably different, worthwhile outcomes. 4: the reviewer discovers a relationship, capability or expressive possibility that a still or passive recording cannot provide. A single deep mechanism qualifies. | Cursor glow, tilt, particles or toggles are the entire response; inputs do not affect the core experience; scripted playback ignores choices. |
| Motion | Changes are legible and continuous. Stillness is valid. | 3: timing/continuity reveal cause, state or spatial relationships without competing with control. 4: an observed transition materially improves understanding, expression or feeling; reduced motion preserves the essential outcome. | Constant movement substitutes for development; abrupt jumps lose orientation; input fights animation; discomfort or essential meaning disappears when motion is reduced. |
| Usability | The primary action and its result can be found and understood. | 3: unaided first use, feedback, recovery and keyboard use succeed without material friction. 4: unfamiliar use still feels clear, forgiving and controlled. | Explanation is needed to find the experience; invisible controls, focus traps, unreadable labels, unrecoverable states or hover-only essentials. |
| Responsiveness | Core experience works at tested sizes. | 3: hierarchy, reachable controls and meaningful outcomes survive narrow portrait, landscape and resize. 4: each form feels deliberately composed and equally capable. | Cropping conceals the action; overlap, tiny targets, orientation dead ends or desktop-only interaction. Scaling everything smaller is not sufficient. |
| Performance | The experience is usable and meets declared budgets. | 3: cold entry, repeated input and sustained motion remain responsive on recorded desktop and physical-phone tests. 4: no perceptible interruption of the core experience across that evidence. | Loading spectacle masks delay; stalls, input backlog, degradation or lab-only evidence is presented as device validation. |

**Depth test:** compare the initial/passively observed candidate with actual use. Ask: “What could I change, learn, explore or express, and what happened because of my action?” If removing interaction would preserve almost all value, meaningful interaction is at most 1. Extra effects/features do not repair this failure. Do not demand a game, narrative, utility, 3D, generated imagery or a minimum number of controls.

## Fixed review procedure

Work checks the adapter's two declared outcomes against the actual core experience; it may not test an incidental button while leaving the principal promise untested. Codex writes the adapter **after** selecting its concept and before using results to justify acceptance; freeze the rubric/budgets for that evaluation.

An independent human reviewer sees no creator/model identity or self-score before rating. Observe the opening for 5 seconds, then use it unaided for 90 seconds. Record time to first successful action (target <=10 seconds; longer requires a concrete usability finding). Try both input variations, recovery, rapid changes, keyboard, phone and reduced motion. After five minutes away, note one remembered visual relationship and one action/consequence. Record events and evidence locations, not inferred emotions or measured-attention claims.

For comparisons, use the same task, device, viewport and time allowance; randomize candidate order. Before declaring **exceptional-supported**, obtain a human review independent of implementation (the owner may review): every dimension >=3, visual impact and meaningful interaction both 4, all technical/manual gates pass, and no unresolved material defect. Additional reviewers record scores independently before discussion; keep individual scores and do not average away a weak dimension. Any disagreement crossing a threshold remains unresolved until reviewers repeat the disputed case. Agent-only review is **provisional**, with missing validation named. Record reviewer count; one person's verdict does not establish broad audience appeal. Owner acceptance/rejection is always explicit and separate. These are local decision rules, not a universal scientific beauty metric; calibrate future versions against owner verdicts without rewriting old results.

## Executable browser checks

Requires Node >=20. From this directory:

```sh
npm ci
npx playwright install chromium
npm test
# Start the chosen experience with its own documented command, then:
node run.mjs http://127.0.0.1:8080 ../experiments/<slug>/eval-scenario.mjs ../experiments/<slug>/evidence/<run-id>
```

An installed Chromium may be supplied with `EVAL_CHROMIUM_EXECUTABLE=/absolute/path`; the report records the actual browser version. Copy [scenario.template.mjs](scenario.template.mjs) into the chosen experiment and implement its five hooks. Assertions must inspect real rendered/accessible outcomes, not application success flags. Use actual keyboard/pointer/touch input; do not assign app state, call internal handlers, synthesize DOM events or bypass normal focus. The template deliberately fails. Adapter assertions remain reviewable code, not independent proof.

| ID | Automated case / pass condition | Evidence / limits |
|---|---|---|
| A1 | Load and both outcomes: no uncaught exceptions, console errors, failed requests or HTTP >=400; core rendered ready/initial assertions succeed. | Runtime log; errors remain failures. Classify environmental blockers honestly; do not silently allow-list. |
| A2 | Two different input variations each reach their declared outcome; recover to initial state; 10 alternating inputs reach the final expected state. | Hook assertions, before/after PNGs, video, trace. Runner checks the contract's execution, Work checks its relevance and assertion strength. |
| A3 | Repeat A1/A2 on 1440x900 pointer, 1440x900 keyboard, 390x844 touch, 320x568 touch, 844x390 touch, and reduced-motion desktop keyboard. Check document overflow at initial/outcome/recovery states (<=1px tolerance). Resize the pointer session portrait and back; recheck outcome. | Named profile evidence. DOM geometry cannot find canvas clipping, occlusion, focus styling or touch-target problems. |
| A4 | Three fresh-context cold trials per desktop and mobile lab profile: all trials collected; p75 readiness upper bound <=2500ms and p75 of each trial's p95 rAF interval <=34ms over >=10 seconds following real actions. | Raw samples, network/CPU settings, browser/OS/CPU versions. Mobile lab uses 4x CPU, 1.6Mbps down, 750Kbps up, 150ms latency. Budgets are local policy. rAF scheduling is a proxy, not rendered FPS or GPU/device proof. |

No auto-retries or best-run selection. Report all three performance trials; invalid/missing samples block the performance gate. Percentiles use nearest rank (p75 of three is the worst trial). Readiness is the time at which the externally observed ready hook finishes (includes polling/driver overhead), **not LCP**. The runner makes no INP, WCAG-conformance, GPU or battery claim. A fast empty page still fails the experience gate.

## Required manual technical checks (M1–M4)

- **M1 accessibility/usability:** keyboard-only core action and recovery, visible focus without trap, meaningful control names, readable content at 200% zoom, text/UI contrast, non-color cues, and touch targets >=24 CSS px or WCAG spacing/exception. Inspect canvas/WebGL accessibility as well as DOM. Fail any essential inaccessible action.
- **M2 motion:** inspect normal and OS reduced-motion playback; nonessential motion can be disabled, and long automatic movement alongside other content can be paused/stopped/hidden where applicable. No hazardous flashing. Test continuity during interruption and direction changes. CSS media emulation alone does not prove these outcomes.
- **M3 responsive/device:** run the same core journey on at least one named physical phone and a second browser engine; resize/orient without losing essential state or control. Record device, OS, engine and result. Emulation is insufficient for this gate.
- **M4 performance:** on that phone, record cold start plus >=30 seconds of active use. Use a browser performance trace to inspect at least five discrete actions' input-to-next-paint feedback (target <=200ms) and sustained stalls. For continuous gestures inspect tracking lag; if event timing is unsupported, retain a timestamped recording/trace and mark the numeric check blocked until measured. Increasing slowness, a stall >100ms during core action, or breached feedback budget fails; do not label a handful of samples “field INP”. Record loading/asset fallback behavior when one required resource is unavailable; no permanent blank screen or silent frozen control.

## Evidence and decisions

Use [review-template.md](review-template.md) in the experiment README. Required: candidate commit + dirty status, eval version + eval-file hashes, adapter hash and two expected consequences, exact run command/URL, UTC time, environment, every check/status, raw report, initial/changed desktop/mobile PNGs, and uninterrupted normal/reduced-motion interaction videos/traces. Verify the server serves that revision; for separate builds retain the build command and output hash. Git metadata alone does not attest served code. The runner writes hashes of evidence files in `report.json`; preserve the folder and commit or link immutable evidence. Final review requires committed candidate/adapter code; dirty runs are provisional. It exits **0 automated pass, 1 observed failure, 2 blocked setup**. Exit 0 leaves all human/manual checks unverified.

Work independently checks retained evidence and reproduces the two outcomes plus one undeclared ordinary input variation. After corrections rerun affected profiles and performance if timing/render work changed; full gates apply to the final revision. Link prior failures; never relabel old evidence as the new revision. Retain only the latest full evidence plus material failure/regression evidence. Promote an observed defect to a regression case; change evals through a separately explained version update, never to pass the current candidate.

## Basis (primary sources, checked 2026-10-16)

- [Anthropic: Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents): evaluate actual outcomes; combine code and judgment; distinguish capability from regression checks.
- [OpenAI: Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices): scoped criteria, repeatable cases, comparison and human calibration.
- [Playwright emulation](https://playwright.dev/docs/emulation) and [assertions](https://playwright.dev/docs/test-assertions): reproducible browser settings and observable assertions.
- [W3C: motion from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), [pause/stop/hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html), [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): specific accessibility checks. Reduced-motion support is a lab requirement, not a claim that every cited criterion is WCAG AA.
- [web.dev: Web Vitals](https://web.dev/articles/vitals): LCP/INP/CLS describe different phenomena; field good thresholds are assessed at the 75th percentile. Our readiness and rAF metrics are explicitly different lab proxies.

**Suite validation (2026-10-16):** dependency lock installed; syntax checks and all 7 tests passed using Node 24.19.0, Playwright 1.62.1 and alternate Chromium 153.0.8010.0 (bundled browser download unavailable). The synthetic mechanism passed; injected overflow, wrong outcomes and runtime/HTTP errors failed; placeholders and evidence overwrite were blocked. This validates evaluator behavior, not any experience or human verdict.
