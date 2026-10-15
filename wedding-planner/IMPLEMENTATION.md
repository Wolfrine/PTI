# Wedding implementation and verification

## Current Botanical redesign

The owner rejected the earlier folded-invitation design for weak appearance and excessive journey burden. Its historical visual scores below are superseded. Current implementation and acceptance evidence are tracked in [the Botanical brief](design/botanical/BRIEF.md), [independent critique](design/botanical/CRITIQUE.md), and the current release record that follows. Family approval of the new aesthetic remains pending.

Implementation base: main `2fe53ab`, branch `codex/wedding-botanical`. Same PTI repository, Firebase project, owner/workspace, and Hosting identity. No record migration, reseed or security-rule change is part of this redesign. Original floral artwork is imagined scenery; [provenance and final image-generation prompt](design/botanical/ARTWORK.md) are retained separately from wedding facts.

The public experience now uses the selected Romantic Botanical scene and a short, truthful save-the-date composition. The family home has a function timeline and four entrances. Catering groups services by day; comparison shows two selected menus. Guests, stays/travel and tasks use readable detail pages with focused editors. Responsibilities has direct access beside decisions. Real hash routes, breadcrumbs and browser Back replace the former overloaded tab journey. Source/provenance and account actions remain secondary. Static guest content needs no JavaScript or Firebase request.

Observed redesign verification: TypeScript/Vite production build; ten model tests; twelve browser task scenarios at 1440/390/360; nine wedding rules tests and thirteen Venture tests on shared emulators; production dependency audit with zero reported vulnerabilities. Actual Auth/Firestore emulator tests cover two-account collaboration, full hidden-field preservation after a menu-only edit, revision conflicts, cancel/reopen recovery, archive/history export, immediate draft/toast clearing on active membership removal, and sign-out. The underlying store, model, schema and rules are unchanged.

The original Angular production build passes with existing stylesheet advisories. Its unrelated Karma baseline still has one pass/eight failures because specs lack Firebase Auth/Firestore providers; Angular code and dependencies were not changed. These failing checks are not presented as passing.

The final UI was rendered and personally inspected on desktop and phone, including complete documented menus and labelled synthetic logistics, focused forms, empty/search/loading/offline/validation states and actual emulator access removal. Five substantive implementation rounds follow three distinct direction candidates. The randomly selected round-3 stronger review used gpt-6-astra/high; it identified hierarchy gaps subsequently addressed. Screenshots and review records are under `design/botanical`; reference boards and generated scenery do not establish wedding facts. This is agent review, with family aesthetic approval and real human Google popup sign-in still pending.

Release status: **merged and live** through [PR #38](https://github.com/Wolfrine/PTI/pull/38), merge `a0f74b66ca49f729fdd1cf621ef1ec49d6985de3`. [PR verification](https://github.com/Wolfrine/PTI/actions/runs/38728022755) and [main release](https://github.com/Wolfrine/PTI/actions/runs/38728388645) succeeded. Main passed all ten isolated live authorization checks and verified all nineteen hosted assets against its tested build; development/source routes returned 404. Activation reported `seeded: false`.

After deployment, the parent personally inspected the live invitation and signed-out family entry at 1440/390. Browser checks passed with no overflow, page/CSP console errors or public Firebase requests. A fresh read-only query of all five workspace collections exactly matched the pre-redesign snapshot, including existing document metadata: ten services and seven decisions unchanged, and guest/attendance/arrangement collections still empty. No synthetic family records were published or imported. Private interactions were verified on emulators, and authorization with isolated cloud test accounts; a human Google popup sign-in remains unverified. Final live results are retained in [the release record](design/botanical/RELEASE.md).

## Historical first release — visual direction subsequently rejected

Base reviewed: PTI main `8548e6c4d59fadd979fac4ff21ed3b5be3e5668b`. Delivery branch: `codex/wedding-home`. This record is updated with observed release results; configuration alone is not deployment evidence.

Integrated subsequent main context through `ba4d473`: the family's requested `mahima_mayank.web.app` identity (underscores are invalid; closest valid target configured as `mahima-mayank`) and the additional source-backed menu review. Those culinary suggestions remain proposals; the initial menu selections were preserved.

Also preserved main `8d07d59` and its four schematic design references. They describe optional mood explorations, explicitly carry unverified mockup details, and do not record a family-selected direction. The implementation remains the separately rendered/reviewed folded invitation direction, with human aesthetic acceptance pending.

## Delivered behavior

- Static, responsive invitation with couple identity, planned celebration dates, approved-content rendering, optional exact-moment countdown, safe venue directions, approved contact and a native social sharing image. Current public content is deliberately a save-the-date state because detailed invitation facts remain unconfirmed.
- Private shared family workspace: decisions, events/menus, individual guests grouped by household, per-event attendance, nightly stay demand, travel/stay notes, arrangements/vendors/costs, owner-managed membership and export.
- Same PTI Firebase project/database/Auth with a dedicated wedding Hosting target. The original broad signed-in rules exclude `weddingData`; verified family membership is separately enforced. A direct self-membership listener clears an already-open editor on revocation. Edits have revision checks and atomic immutable history. Export reads complete collections, including archived records/history, retries overlapping edits using bracketing immutable-history reads, and is cancelled when the session changes.
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
| Model/public-content tests | 10 pass: consistent concurrent export/retry/session cancellation, people/attendance, nightly demand, validation, India wall-time conversion, honest decision/cost semantics, all-menu import, public truth, safe cross-midnight information, exact countdown |
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

Release state: **merged and live**. [PR #37](https://github.com/Wolfrine/PTI/pull/37) merged as `2b9e54f9548e374b961a9c9b90c3be4ce87063a6`. [Main release 38715831944](https://github.com/Wolfrine/PTI/actions/runs/38715831944) passed the full wedding suite, activated the shared rules and dedicated site, verified Google provider/domain configuration, imported the documented proposals once, passed all ten live client authorization checks, and compared all 16 hosted assets with the tested build. The database remains `(default)` in `asia-south1` within the existing `pti-app-2ab59` project. Temporary synthetic cloud accounts and their isolated workspace were cleaned up successfully.

Live URLs: [invitation](https://mahima-mayank.web.app/) and [family workspace](https://mahima-mayank.web.app/family/). The hosted guest and signed-out family pages were personally inspected at 1440 and 390 CSS pixels after deployment. Browser checks passed for both sizes: no horizontal overflow, no page/CSP console errors, indexing discouraged, and no public Firebase requests. Local screenshots and the check record are in `.wedding-qa/live-*`. Private family interactions were verified using synthetic emulator accounts; live authorization was verified using isolated synthetic cloud accounts. A real human Google popup sign-in and family aesthetic acceptance remain unverified.

The first remote run passed all wedding tests but failed on the account's exhausted GitHub artifact quota. Release now uses the exact tested build in the same job; optional evidence uploads may warn without blocking it, and activation evidence is also printed in the job log. Existing Personal PWA verification likewise passed its checks and failed only at artifact upload. Two unrelated SEFPO workflow definitions already fail on main.

Still needed from the family: approved programme/audiences, venue addresses and maps, actual start/arrival times, exact countdown moment, contact, guest and stay records, final catering approvals, and optional photographs/Hindi wording. Missing facts do not block maintaining the private proposed record. Countdown, venue details and contact appear publicly only after an approved developer release.
