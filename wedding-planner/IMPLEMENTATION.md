# Wedding implementation and verification

Base reviewed: PTI main `8548e6c4d59fadd979fac4ff21ed3b5be3e5668b`. Delivery branch: `codex/wedding-home`. This record is updated with observed release results; configuration alone is not deployment evidence.

Integrated subsequent main context through `ba4d473`: the family's requested `mahima_mayank.web.app` identity (underscores are invalid; closest valid target configured as `mahima-mayank`) and the additional source-backed menu review. Those culinary suggestions remain proposals; the initial menu selections were preserved.

## Delivered behavior

- Static, responsive invitation with couple identity, planned celebration dates, approved-content rendering, optional exact-moment countdown, safe venue directions, approved contact and a native social sharing image. Current public content is deliberately a save-the-date state because detailed invitation facts remain unconfirmed.
- Private shared family workspace: decisions, events/menus, individual guests grouped by household, per-event attendance, nightly stay demand, travel/stay notes, arrangements/vendors/costs, owner-managed membership and export.
- Same PTI Firebase project/database/Auth with a dedicated wedding Hosting target. The original broad signed-in rules exclude `weddingData`; verified family membership is separately enforced. A direct self-membership listener clears an already-open editor on revocation. Edits have revision checks and atomic immutable history. Export reads complete collections, including archived records/history, and is cancelled when the session changes.
- One-time import of all ten documented food/event services and seven genuine open decisions. No guest fixtures, invented ceremony order, venue or precise time is imported. All menu proposals and unclear readings keep their status/source. Existing operational records survive deployment.
- Dedicated verification/release workflow, exact baseline rule-drift guard, identical-rule race tolerance, temporary synthetic live-client checks and exact hosted-build/source-boundary checks. Wedding-only commits no longer trigger the general PTI Hosting workflow.

## Design evidence

Central plugin 0.1.0, source base `ba1235fe7b220842778414f3f70fca38e7df4c53`. Designer: `wedding_designer`; independent critic: `wedding_critic`; parent: design checkpoint and separate functional QA. Four actual reference images and mechanisms are in [BRIEF.md](design/BRIEF.md); reference assets are never in the Hosting build.

Three materially different directions were rendered and compared. Folded invitation was selected for its strong name hierarchy, paper-like framing and readable family ledger. Five substantive cycles cover sparse guest content, reading sizes, mobile navigation, grouped/sticky editors, dense menus, hospitality/costs, validation, loading/offline/unavailable/access removal and search recovery. See [CRITIQUE.md](design/CRITIQUE.md) and the corresponding `design/cycle*` images.

The parent personally inspected desktop/mobile at cycles 3 and 5, including guest opening, family interior, dense menu, editor and actual denied access. Final parent scores: identity 8.2; hierarchy 8.1; desktop/mobile craft 8.0; overall 8.1. Observable reasons: names/planned dates dominate; private decisions/status/owner/actions remain adjacent; menu and form hierarchy survive phone widths; errors keep useful recovery and erase private content on revoked access. The independent critic's final scores are 8.1/8.1/8.0, overall 8.1. No major visual blocker remains in observed states.

Verdict: **independently reviewed; family aesthetic acceptance pending**. No attention timing or human comprehension was measured. Reduced-motion static behavior was checked; motion was not separately rated. Agents used inherited capabilities throughout; no randomized stronger-model pass was run or claimed. Fonts are licensed, self-hosted Latin subsets; no fabricated couple portrait or story was used.

## Verification observed locally

| Check | Observed result |
|---|---|
| Model/public-content tests | 9 pass: people/attendance, nightly demand, validation, India wall-time conversion, honest decision/cost semantics, all-menu import, public truth, safe cross-midnight information, exact countdown |
| Family access/rules | 9 pass: anonymous/non-family denial, verified membership, escalation prevention, logged collaboration, stale/forged edits, attendance identity, input guards, archive-linked updates, revocation |
| Existing Venture shared-rules regressions | 9 pass against the combined rules, including membership, private sibling isolation and revocation |
| Actual Auth + Firestore emulator browser/store | Pass: two-account updates, competing editor conflict, complete archive/history export, already-open editor removal on revocation, sign-out clearing |
| Browser task scenarios | 9 pass: static no-JS invitation, zero public Firebase requests, keyboard and responsive reflow, no production demo bypass, decision validation/draft preservation, household/stay counts, offline failure, attendance editing, private seed exclusion |
| Rendered coverage | Actual Chromium at 1440, 390 and 360 CSS pixels; 720 CSS-pixel desktop zoom-equivalent check. Functional evidence uses synthetic family records and is labelled. This is not a real-device Google login or a full WCAG conformance audit. |
| TypeScript + production Vite build | Pass. Firebase SDK is loaded only by the family entry; public enhancement is under 1 KB minified. A Firestore bundle-size advisory does not affect the guest entry. |
| Wedding production dependency audit | Zero reported vulnerabilities in the observed audit |
| Shared PTI Angular regression | Production build passes, with existing stylesheet-budget advisories. Existing Karma suite: 1 pass / 8 fail because specs omit Firebase Auth/Firestore providers. Angular source and dependency lock are unchanged; this wedding change does not repair those unrelated tests. Logs retained in `.wedding-qa/pti-test.log` and `pti-build.log`. |

Independent security review also verified self-membership observation and archive-linked updates on an isolated emulator. It found no remaining broad-rule bypass or seed-overwrite issue. The review did not inspect live cloud configuration or a real human Google OAuth popup.

## Release and remaining facts

Release state: **local implementation verified; remote CI and cloud activation pending**. The main-branch workflow will supply activation evidence for rules, Google provider configuration, seed preservation, live client checks and Hosting asset comparison. Do not infer these outcomes from source configuration.

Still needed from the family: approved programme/audiences, venue addresses and maps, actual start/arrival times, exact countdown moment, contact, guest and stay records, final catering approvals, and optional photographs/Hindi wording. Missing facts do not block maintaining the private proposed record. Countdown, venue details and contact appear publicly only after an approved developer release.
