# Wedding planner evals — specification v0.1

Status: **specified, not run**. These are candidate acceptance criteria researched by Work. They have not been calibrated with the family or applied to an implementation. No success rate, visual score or production readiness is claimed.

## Purpose

Evaluate whether this small wedding app and its planning outputs deliver the [public guest promise](../guest-experience/README.md) and [private family promise](../family-workspace/README.md). Use the [domain guide](../research/DOMAIN_GUIDE.md) for context and [source index](../research/README.md) for evidence boundaries.

There is **no requirement to add an LLM, chatbot, automated planner or evaluation framework to the app**. Scenarios can assess an ordinary web app, an agent's research/planning answer, or a Codex-produced implementation. Software tests may implement objective assertions; human assessment remains necessary for hospitality, usefulness and visual taste.

## Three evaluation layers

| Layer | Question | Evidence |
| --- | --- | --- |
| Domain/planning quality | Does the resulting plan handle the relevant people, events and dependencies accurately? | Confirmed inputs, calculations, proposed plan, unresolved decisions and family judgment |
| Product usability | Can the intended guest/family member find or record that understanding with reasonable effort? | Actual browser task on desktop and mobile; persisted outcome and relevant authorization checks |
| Agent/harness quality, when comparing configurations | Does a different instruction/context setup improve the same work reliably? | Same tasks, starting data and available tools; versioned configuration, output, interventions and resource use |

A domain outcome need not be a dedicated feature. A clear note, simple shared arrangement or external source can be sufficient. Conversely, a model correctly answering a JSON fixture does not prove the app supports that task.

## Reading cases.json

The initial pack contains **65 scenarios across 22 domains**: 48 objective checks, 9 browser checks and 8 judgment reviews. These counts describe proposed grading methods, not executed tests.

The suite is intentionally self-contained and synthetic. `input` objects are **conceptual fixtures, not an application schema or a database migration**. Adapt them to the implementation while preserving the factual conditions. Each case records domain IDs, target, applicability, severity, polarity, grader, input, task, pass assertions and evidence needed. No fixture belongs in production wedding data.

Targets:

- `planning`: assess a proposed arrangement or planning answer. A person or model may supply it.
- `application`: execute the user task and inspect real data/permissions, not only text output.
- `both`: check the domain result and its actual availability through the app separately.

Graders:

- `objective`: arithmetic, identity, timing, states or authorization with an exact expected result; implement deterministic checks where practical.
- `browser`: actual task completion and rendered behavior, including reload/other session where specified.
- `calibrated_review`: compare concrete outputs against family-approved examples. A model judge is provisional until its agreement with human labels is checked.

## Running an honest evaluation

1. Select the applicable cases for the work; record app commit, agent configuration if relevant, fixture version, date and environment. Use a clean test account/environment with synthetic data. Protect other PTI apps and real wedding data.
2. Establish expected results before seeing the candidate. Use the input and pass assertions as the reference. Do not require a particular layout, tool-call order or invented unstated field.
3. Run application cases as the stated role. Capture task steps, relevant desktop/mobile renders, persisted result and appropriate access-test evidence. The absence of a button is insufficient proof of authorization.
4. Grade each assertion. Record `pass`, `fail`, `blocked`, `not_run`, or justified `not_applicable`, with evidence. Blocked/unrun cases are not passes. A missing applicable capability is not automatically not-applicable.
5. For optional domains, mark not-applicable only with the family-approved exclusion or explicit scope decision. Public factual accuracy, the public/private boundary, authorized family access and honest state reporting remain core.
6. For judgment cases, first build a small labelled set of outputs the family accepts/rejects and the reasons. Check that a proposed model judge distinguishes these cases, including attractive but wrong outputs. Judge uncertain evidence as unknown. Keep visual taste, functional QA and planning quality separate.
7. Compare repeated trials for nondeterministic agent outputs. Three repeats can expose obvious instability but are not statistical proof. Deterministic calculations do not need arbitrary repeated runs. Retain cases the candidate has not been tuned on for later comparison; **this public v0.1 pack is not a hidden holdout**.
8. Turn real family corrections and failures into new regression cases. Update expected results only when facts/intent change, with the reason preserved. Sources S17–S20 motivate this method; fixture thresholds and proposed verdicts are project choices.

## Verdicts without misleading scores

Any failed core blocker stops a readiness claim for the affected release. Confirm all applicable core cases, document open major issues, and seek family acceptance for judgment dimensions. Show results by domain and assertion, plus failures and exclusions. An average cannot conceal exposed private data or incorrect invitation times.

For a harness comparison, hold model, task, starting state, tools and budget stable while changing the targeted instructions/context. Then compare the model change separately. Report accepted outcomes, repeatability, human intervention, duration and cost when observable. Do not infer the cause of an improvement from a single run.

No arbitrary “8/10” threshold establishes hospitality or design quality. There is no claim that this synthetic suite is comprehensive for all Indian weddings. Sources, real invitation facts and family feedback should refine it.

## Minimal result record

A result can be stored as a single JSON or Markdown report for each evaluated version. It should contain: case ID; app/config/fixture versions; applicability and rationale; per-assertion verdict; observed result; evidence reference; evaluator; known limits; and follow-up owner for an unresolved issue. Record no real guest personal information in public reports or screenshots.

**Current results:** all cases have `status: not_run`; no application exists in the inspected wedding-planner folder. This statement concerns the inspected source tree, not all possible external deployments.

## Suggested first end-to-end review

Use the linked suite to test a fictional three-day wedding from confirmed invitation through arrivals, overnight stays, meals, a timing change, vidai, checkout and settlement. Include a local guest, a visiting household, an elder needing step-free access, a dietary restriction and an authenticated non-family account. Then have a family member perform the corresponding tasks. This tests relationships without requiring a large administrative product.
