# Codex usage panel — independent visual critique

Date: 2026-10-24
Reviewer: `visual_critic` (separate from designer and parent QA)
Baseline: `ca8749824e0f88b49f2bab64e3008299ea58de5e`
Central: packaged `0.1.0`, source `ba1235fe7b220842778414f3f70fca38e7df4c53`.

## Review contract

This is a bounded refinement of the owner-selected warm-light PTI Home direction. The panel belongs between the welcome area and pinned apps. It reports allowance windows, reset timing, source-dated daily usage and observation health. It must preserve Home's purpose as the app launcher.

The following dimensions are declared before viewing the candidate. Every dimension and the overall score must independently reach 8/10 for visual acceptance; functional QA is a separate verdict.

| Critical dimension | Observable pass condition |
| --- | --- |
| Allowance and status comprehension | Used versus remaining percentages are unambiguous; reset timing and source dates are visible; partial, stale and unavailable data cannot be mistaken for fresh live readings. |
| Fit with existing Home | Warm neutrals, ink, coral and typographic hierarchy read as the same application; the panel does not introduce an unrelated monitoring-dashboard language or overwhelm the launcher. |
| Desktop/mobile readable composition | Values, window names, timestamps and health messages remain legible and coherent on desktop and narrow mobile; pinned apps remain discoverable below a compact monitor. |

Initial structure concern: the baseline active AGENTS/design memory directs agents to CEO/dashboard surfaces that this task retires. The implementation must correct active guidance, preserve the historical intent in the archive, and verify no obsolete navigation remains.

## Current verdict

**Critic pass on the current local candidate.** Five substantive state/refinement rounds were reviewed, with real rejection/correction in rounds 3 and 5, plus a post-review over-allowance edge check. Final independent scores are comprehension **8.5**, warm-light fit **8.6**, responsive composition **8.4**, overall **8.5**. No visual blocker remains in the inspected local states. Parent checkpoint/QA is reported separately below; exact deployable-build binding and live signed-in account verification are not established by this critic verdict. Local fixture data is explicitly synthetic.

## Review cycles

### Round 1 — fresh allowance and daily usage

- Evidence: actual Angular render at `http://127.0.0.1:4318/?state=fresh`, IAB screenshots personally inspected at 1440×1000 and 390×844. The visible banner says synthetic readings and no authentication/database access. Image materialization/candidate hashes remain the parent/designer evidence record's responsibility.
- Scores: comprehension **8.3**, warm-light fit **8.6**, responsive composition **8.0**, overall **8.2**.
- Visible strengths: 37% used and 63% remaining have distinct positions; the bar reports allowance, and daily 1,234,567 is separately labeled with its source date. Coral, serif heading, warm neutral surface and fine rules belong to Home. Pinned apps remain visible on desktop; their heading is within the mobile first viewport.
- Priority refinement: source date, reset and footer observation text are visually tiny next to the numbers. Strengthen utility text slightly while preserving the compact monitor footprint. Narrow 320px and adverse states remain unobserved.
- Generic-risk assessments: single connection card **justified** by the account boundary; progress bar **justified** by returned percentage; paired allowance/token columns **justified** by separate source semantics.
- Layers: retain typography family, color and overall composition; refine utility-text scale/contrast; retain meaningful bar and absence of decorative graphics. No new imagery or motion is needed.
- Strongest reference gap: the existing Home gives app labels more immediate legibility than the monitor's freshness metadata; freshness deserves comparable reading effort.
- Visual verdict: **fresh-state pass, overall gate pending**. QA is separate and was not scored by the critic.

### Round 2 — stronger metadata, multiple windows and unsupported daily usage

- Candidate refinement: reset/source-date text increased to 12px and footer to 11px, with stronger warm-ink color. This visually addresses round 1's most consequential finding.
- Evidence: `?state=multiple` at 1440×1000 and 320×568 (top and scrolled footer); `?state=unsupported` at 1440×1000 and 390×844, all personally inspected in IAB. All carry the synthetic fixture banner.
- Scores: comprehension **8.5**, warm-light fit **8.6**, responsive composition **8.3**, overall **8.4**.
- Visible strengths: weekly and 5-hour windows read as distinct related allowances, with separate percentages and reset timing. Unsupported daily usage displays `Partial`, `Unavailable` and `Not supported by this Codex version` without discarding valid allowance. Narrow 320px stacks the windows, source date and footer coherently.
- Generic-risk assessments: extra outer cards **resolved** by using restrained internal columns; repeated number/bar pairs **justified** by different returned windows; unavailable daily section **justified** because it communicates support limits rather than showing a zero.
- Layers: retain revised metadata type, warm color, internal rules and responsive stacking. No imagery/motion intervention needed.
- Strongest reference gap: no remaining significant gap in these states; adverse-state historical-value comprehension is the next unverified risk.
- Visual verdict: **round 2 pass**. Parent QA and retained-image binding remain separate.

Five substantive state/refinement reviews are required; unchanged rescoring will not count. Parent QA and final parent inspection must be recorded separately.

### Round 3a — historical values, offline and elapsed reset (rejected)

- Evidence: `?state=stale`, `?state=offline`, `?state=expired`, each at 1440×1000 and 390×844, personally inspected in IAB. Synthetic fixture banner is visible.
- Scores before correction: comprehension **7.7**, warm-light fit **8.5**, responsive composition **7.4**, overall **7.7**.
- Blocker 1: stale desktop compresses the single weekly allowance and bar to roughly 235px, leaving a very large empty gap before daily usage. Fresh/offline spans the allowance region. The warning should retain the allowance's normal full-width composition.
- Blocker 2: elapsed-reset state shows green `Up to date` while the value's reset line says `Awaiting updated allowance`. The global endorsement conflicts with the historical value below. Use a neutral or amber awaiting/partial status for the affected snapshot.
- Visible strength: offline explicitly displays `Offline` and `Offline · saved reading` while retaining the observation timestamp; this communicates the source condition clearly.
- Generic-risk assessments: repeated stale notices **justified** by independent source health; warning-induced sparse layout **defective**; unchanged green health badge after reset **defective** because its meaning contradicts the value's freshness.
- Layers: retain color family, meaningful progress bars and source timestamps; refine status color/wording and stale desktop composition. No full direction reset needed after this first failing review.
- Visual verdict: **rejected pending the two corrections**. Parent QA remains separate.

### Round 3b — corrected historical-value presentation

- Corrections: stale notice no longer distorts the allowance columns; elapsed-reset header becomes amber `Awaiting allowance`.
- Evidence: revised `?state=stale` and `?state=expired` personally inspected at 1440×1000 and 390×844 in IAB.
- Scores: comprehension **8.6**, warm-light fit **8.6**, responsive composition **8.4**, overall **8.5**.
- Visible result: stale allowance uses the full allowance region again, with the warning above its window. Expired header and reset note now communicate the same awaiting condition. Mobile retains clean type and spacing without clipping.
- Generic-risk assessments: sparse warning composition **resolved**; conflicting fresh badge **resolved**; retained historical percentage **justified** by explicit awaiting/stale language.
- Layers: retain corrected composition and status language. Both round 3a blockers are resolved against new renders.
- Visual verdict: **round 3 pass**. Parent checkpoint and QA remain separate requirements.

### Round 4 — loading, never connected and unavailable

- Candidate refinement: loading/never-connected badges use neutral taupe; green is reserved for current supported readings and amber signals adverse/partial states.
- Evidence: `?state=loading`, `?state=unconnected`, `?state=error`, `?state=unavailable`, each personally rendered/inspected at 1440×1000 and 390×844.
- Scores: comprehension **8.7**, warm-light fit **8.6**, responsive composition **8.5**, overall **8.6**.
- Visible result: `Connecting` and `Not connected` are distinct from `Unavailable`. Connection failure directs attention to monitor/sign-in, while missing source readings say `Not reported by Codex` and `No successful reading yet`. No numeric placeholders or invented zero balance appears. Empty panels stay compact and leave pinned apps prominent; longer mobile copy wraps cleanly.
- Generic-risk assessments: empty KPI skeleton **resolved** by prose; single card **justified** by account connection; semantic state color **justified** by meaning, without a new decorative language.
- Layers: retain restrained type, color, spacing and sparse-state composition. No additional graphics, imagery or motion required.
- Strongest reference gap: none significant in these visible states; long labels, cached/partial combinations and final narrow header remain to be checked.
- Visual verdict: **round 4 pass**. QA remains separate.

### Round 5a — long labels, cache and partial failure (conditional rejection)

- Evidence: `?state=long` at 1440×1000 and 320×568; `?state=cached` and `?state=partial` at 1440×1000 and 390×844; narrow `?state=expired` header at 320×568, personally inspected in IAB.
- Scores before correction: comprehension **7.9**, warm-light fit **8.6**, responsive composition **8.4**, overall **8.2**. The failing critical dimension blocks acceptance despite the overall score.
- Visible strengths: long source labels wrap without clipping. `Cached` and `Saved reading · waiting for server` communicate the retained value's transport state. At 320px, the longer awaiting badge causes the eyebrow to wrap but does not collide with the heading.
- Truth-label blocker: partial daily section has `Unavailable` and `No daily count reported`, yet its note says `Update failed · last good reading` even though this fixture's latest count is null. Use `last good reading` only when the panel actually displays one; otherwise report the update failure without implying a saved count.
- Generic-risk assessments: long-label typography **justified** as subordinate source identity; cache badge **justified** by transport state; unconditional saved-value note **defective** because it overstates the visible evidence.
- Layers: retain layout, wrapping and color; refine error-note content according to value presence.
- Visual verdict: **conditional rejection until the truth-label correction**. QA remains separate.

### Round 5b — corrected partial failure and final responsive check

- Correction: partial daily usage with no displayed saved value now says `Update failed · no saved reading`; it does not imply a historical token count exists.
- Evidence: corrected `?state=partial` at 1440×1000 and 390×844; final `?state=fresh` at 1440×1000, 390×844 and 320×568, personally inspected in IAB and saved as actual JPEG screenshots below.
- Scores: comprehension **8.6**, warm-light fit **8.6**, responsive composition **8.4**, overall **8.5**.
- Visible reasons: the failure note now matches the absent count, while the valid allowance remains usable. Fresh percentages, reset timing, source-dated daily count and observation timestamp retain a clear hierarchy. Desktop keeps pinned apps visible; mobile stacks data without collision, and short phone content remains vertically scrollable rather than shrinking type to fit one screen.
- Generic-risk assessments: saved-value overstatement **resolved**; single monitor card **justified** by one local account connection; numeric emphasis **justified** by the user's monitoring task with timestamp/status subordinate but legible.
- Layers: retain final typography, color, internal rules and responsive composition. No decorative imagery or extra navigation is introduced.
- Strongest remaining reference gap: the Home's approved artwork/hero remains the dominant desktop object; this is an intentional accepted-direction constraint, and the monitor stays compact below it.
- Visual verdict: **critic pass**. Parent final inspection/QA and live integration are separate.

## Retained final evidence and source binding

All filenames below are relative to this directory. File magic was verified as JPEG, and hashes came from `Get-FileHash -Algorithm SHA256`.

| Evidence | Viewport/state | SHA-256 |
| --- | --- | --- |
| `codex-usage-evidence/r5b-partial-desktop.jpg` | 1440×1000, partial source failure | `b4939e7f51a82d64412710b579794972df73bd30a049673d66853bfd471bf8ba` |
| `codex-usage-evidence/r5b-partial-mobile.jpg` | 390×844, partial source failure | `843353be96e2ba79e44c755411987e9b9dd505eb24ca025d5fa660f19680d078` |
| `codex-usage-evidence/r5b-fresh-desktop.jpg` | 1440×1000, fresh synthetic reading | `100127b9dffc508b3748109161e6fe578461fb12d890369560f6ba88c90a64b0` |
| `codex-usage-evidence/r5b-fresh-mobile.jpg` | 390×844, fresh synthetic reading | `981393878e9a3664a515f297cf4f436f63b183a8655c0d4d5af97185695eac89` |
| `codex-usage-evidence/r5b-fresh-shortphone.jpg` | 320×568, fresh synthetic reading top viewport | `90ab1cae8e20c1c54ba4a5e623c9644902b0e8c4809f6311658c179bc2ed6f07` |

Source SHA-256 at the final local inspection:

| Source | SHA-256 |
| --- | --- |
| `src/app/components/new-codex-usage/new-codex-usage.component.ts` | `c20ae89c477546212a93b5a0907973301c2b0c3c1139f5982f0bfd63db78c1cd` |
| `src/app/components/new-codex-usage/new-codex-usage.component.html` | `18e8436d523e2b480cade905089e51227cd9470c200f669b3c58bd02985aaf52` |
| `src/app/components/new-codex-usage/new-codex-usage.component.scss` | `a20d1729df58993ba0ad18c7c87f8e01df762e686a23a07c5c4a19a7fd508683` |
| `src/app/components/new-home/new-home.component.html` | `c5ff92375328732c534f2f7ce704480d4c7b3eaf7483862e73e106018e38404c` |
| `src/app/components/new-home/new-home.component.ts` | `3434906cbd140a135790fdb9abe8b4b9d1a76028a59b84d084ccb89f17ecec69` |
| `src/styles.scss` | `97dc89e47ec0074fa675083b1ec7a2d27e342b628e884fe997d9e972ecd4fa36` |
| `src/dev-usage-preview.ts` | `14909e06b873840578a2bf50340a6d2500d8c520ec0b12aed65fe535a1dfcef7` |

These are source fingerprints, not a claim of the exact deployable build's fingerprint. Original early-cycle screenshots are retained in the conversation tool output; they were not materialized into repository image files at the time. Final-state recreations must not be relabeled as original round 1/2/4 evidence. Parent owns the final build binding, separate QA, live signed-in check and formal overall acceptance record. Critic performed no production writes, login or deployment.

## Post-review edge check — source usage above 100 percent

The source may report 120% used. The implementation preserves this numeric reading, clamps derived remaining to 0%, and bounds the bar to its container. This is an affected-state check after round 5, not an invented additional implementation round.

- Evidence: parent captured actual CUA `?state=over` renders at 1440×1000 and 390×844. Critic independently viewed both retained files through `view_image`; the critic's CUA browser inventory had become empty, so no direct follow-up browser interaction is claimed.
- Visible finding: `120% used`, `0% remaining` and the full-width bar are coherent without clipping in either size. `Up to date` is worded as observation freshness and remains distinct from allowance headroom. No synthetic maximum replaces the displayed source percentage.
- Scores: comprehension **8.5**, warm-light fit **8.6**, responsive composition **8.4**, overall **8.5**. **Pass**, with no new visual blocker.
- Generic risks: saturated bar **justified** as bounded representation; unrounded source number **justified** as truth; green freshness badge **justified** by its explicit wording rather than a headroom judgment.
- Final evidence: `codex-usage-evidence/final-over-desktop.jpg` SHA-256 `9765b6e60593035d5bd008f6cd1cab8ac87e014b9c2d6d83477efb8e898bfbe8`; `codex-usage-evidence/final-over-mobile.jpg` SHA-256 `8efc1180ee612309aa43de8aaf13ab05e1cb8643b33643e7a25085735aa9d2ad`.

The following source fingerprints supersede affected round 5 source rows for the current edge-reviewed candidate; unchanged Home/global style hashes above still apply. They remain source fingerprints, not a deployable-build identity.

| Source relative to `pti-app/` | Final SHA-256 |
| --- | --- |
| `src/app/components/new-codex-usage/new-codex-usage.component.ts` | `ff3fa391c2b24426dac6a78810ecf307379160f2e96030ec8602764ef999b85f` |
| `src/app/components/new-codex-usage/new-codex-usage.component.html` | `c12800482fc5b8072606017a12dc795c9011c3a2467aae5680649b9f860e1f2e` |
| `src/app/components/new-codex-usage/new-codex-usage.component.scss` | `a20d1729df58993ba0ad18c7c87f8e01df762e686a23a07c5c4a19a7fd508683` |
| `src/app/services/codex-usage.service.ts` | `252ad90e30c225e24f689b58179fe8e9e9ed8f3b7309885215444648ecec7aaa` |
| `src/dev-usage-preview.ts` | `cb95a25094aab6837a51963eba4dd500b72583f40c3b7efbd45e36aac5bca487` |

Parent reported separate checkpoint 3 inspection of corrected stale desktop/expired mobile and checkpoint 5 fresh desktop/mobile. Parent's own visual scores are clarity 8.5, fit 8.7, responsive 8.4. Parent reported fixture QA for search (`Noveliaa` produced one result), restored pin/unpin, keyboard focus progression, absence of retired links and no overflow at desktop/mobile. Those are parent evidence, not critic-run QA. Live authenticated acceptance remains open pending credential setup and CI/deployment verification.
