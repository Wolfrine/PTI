# Current acceptance refresh strategy

Prepared offline. **No acceptance pass is claimed.** Latest frozen candidate is `2b9695d3d712208858675d6bb8847b40f790544a49317f4065e24b33c347282a`, after the paused-ready buffering-status correction. The parent owns all fresh browser captures and final QA; the independent critic owns its endorsements.

## Preserve capture provenance

The 22 personally reviewed nonmedia/title pictures in `evidence/final-state-captures.json` and [evidence/critic-final-review.json](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/design/evidence/critic-final-review.json) were captured for **4de711…**. Keep their original paths, candidate labels, timestamps, checks and image hashes. They remain actual prior-candidate evidence. Do not rename or relabel them as current.

The intermediate **967e…** changed only the development frame observer. [evidence/frame-observer-refinement.json](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/design/evidence/frame-observer-refinement.json) and its two candidate bindings prove all ten production assets and the fixture source were byte-identical to 4de711. Inspection shows the observer is invoked only in `renderMediaFixture`; its import defines a function without changing a nonmedia render. That supports an unaffected-state argument, not a new capture claim. The later 2b9695… correction changes production player JavaScript and its content-versioned worker, so the earlier all-assets-identical proof must not be extended to this candidate.

## Central v2 limitation

The inspected Central 0.1.0 `references/implementation-evidence.md` requires final candidate-bound state evidence and fresh affected-state review. `scripts/validate_design_acceptance.py:140` specifically requires each evidence item's `candidate` to equal the independently supplied current fingerprint; it reports a different value as a **stale capture candidate**. Lines 180/192 also require current-candidate visual/QA reviews. The schema has no carry-forward or equivalent-assets branch.

Adding an ignored `captured_candidate` field while changing an old capture's required `candidate` would satisfy a superficial comparison without providing the contract's current capture. Do not do that. Leave prior pictures as historical evidence and refresh current records. No shared validator/plugin modification is proposed for this task.

## Exact current records needed

Capture **26 current states**: the following 11 nonmedia/title kinds at desktop 1440×1000 and mobile 390×844 (22 pictures), plus actual episode 1000 and 1001 Watch at both viewports (four pictures). These extend the old acceptance draft's 22-state declaration by adding the unconfirmed-disconnect and unsupported-delivery states at both widths.

| Nonmedia kind | Actual state marker / setup |
|---|---|
| library | Continue watching |
| fresh | Start watching |
| remote | Bedroom TV fixture remote, paused/playing synthetic state labelled |
| preparing | Downloading episode |
| offline | Connect to watch |
| empty | No episode found. |
| missing | Open the real fixture missing-590 dialog; Episode 590 is missing. |
| end | Open the real fixture collection-end dialog; Through episode 1085. |
| title-search | Explicitly enable verified titles and perform the real source-filename-title search; visibly show the matching episode 1001 row |
| disconnect-unconfirmed | Sign out on this device? and unconfirmed PC-disconnect copy |
| unsupported-delivery | This video format could not be opened, from shared errorCopy |

The four fresh media states need real video plus visible full English dialogue, actual selected-track/duration metadata and the existing synthetic-account label. Capture diagnostics before navigation and retain exact media mode, episode and presented-frame observations separately. The prior raw 6346.5 ms completion interval and decoder-failure records remain intact. A readyState value, captions mode, successful range response or headless decode does not by itself establish actual picture, visible English, Japanese listening or the five-second target. Verify the new paused-ready recovery surface actually clears Buffering without claiming playback.

For every new picture retain current candidate, captured time, requested/actual viewport, observed identity marker, exact file/hash, and actual checks: state_identity=true, overflow=false, broken_images=false, page_errors=false. Start diagnostics before the tested route, include its covered time window, and never substitute a later empty log for historical coverage. Do not invent an unrun check. Keep a missing check pending.

## Assembly after captures

1. Independently recompute the exact production/content/fixture/observer fingerprint. Keep the current binding and its archived predecessors; use the fresh manifest's actual filenames and hashes.
2. Update `required_states` and `evidence` together to exactly the 26 current states. Preserve original 4de711/967e manifests and prior media records as historical, separate from the active set.
3. Have the critic personally inspect all 26 current pictures and supply a current-candidate scoped judgment, all six dimensions/overall, and every inspected image hash. Do not copy old endorsements into its name. Parent visual review and QA likewise identify the current candidate and all 26 hashes; QA has no visual scores.
4. Preserve the three real references, three retained materially different directions, five historical substantive cycles and the parent's actual round-3/5 checkpoints. These are process history, not replacement current renders or extra cycles.
5. Keep owner verdict not-reviewed until an explicit final owner decision. Keep actual Google identity, Android/installation, Cast/HDMI/endurance/deployment and operational gates outside the scoped visual claim unless separately evidenced.
6. Set agent-reviewed only once the current scoped requirements and reviewer/QA records actually pass. Then run the unmodified Central v2 validator against the independently computed fingerprint. Retain output; structural validation does not create owner or full-product acceptance.

Current code evidence is 41 passing frontend regressions and production dead-code checks. The implementation lane performed no browser, engine or TV action for these changes. Fresh current media/nonmedia captures and parent/critic/QA endorsements remain pending.
