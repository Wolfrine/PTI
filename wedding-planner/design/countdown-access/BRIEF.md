# Countdown and family access — bounded extension

Extends the agent-reviewed Botanical direction. Existing art, names, planned date range and short public journey remain. The owner requested a countdown. The implementation uses the clearly labelled **start-of-day boundary** 18 January 2027 at midnight IST (`2027-01-18T00:00:00+05:30`), an implementation choice stated by the parent; this does not establish a ceremony time.

Designer: `wedding_designer`; independent visual critic: `wedding_critic`; parent: backend/rules/functional QA and final judgment. Central 0.1.0 visual-design-director and UI visual verifier apply. No new direction exploration is needed for this bounded extension. Stronger review randomly assigned by parent to round 4.

Critical dimensions declared before scoring:

1. Invitation identity and short eye path: names/art remain dominant; a truly centred ivory/blush/sage countdown belongs to the invitation without duplicated empty-information cards.
2. Permission clarity: identity, current role, assignment and save action remain understandable at realistic account density; owner is visibly protected and pending accounts have a clear next step.
3. Responsive/state craft: 1440/390/360 layouts keep readable controls and four countdown units; pending, viewer, loading and error states disclose only permitted information.

Five substantive review rounds: countdown composition; realistic access-list density; phone roles/pending/viewer; errors/loading/role changes; final desktop/mobile. App rendering and independent critique establish visual evidence separately from parent functional QA. Synthetic access identities are test-only browser fixtures, never production wedding data.

## Current cycle record

Current verdict: **agent-reviewed; owner aesthetic review pending**. The [candidate-bound acceptance record](acceptance.json) passes the evidence validator for the seven final renders personally viewed by both parent and critic. The critic separately viewed all 25 supplemental states. No owner aesthetic acceptance is implied.

| Round | Actual evidence and consequential change | Independent visual result |
| --- | --- | --- |
| 1 | Centred countdown at 1440/390/360; static no-JS and completed390. Added explicit first-day context after critique. | Invitation identity8.2 / clarity8.0 / craft8.2; access unverified. |
| 2 | Ten synthetic accounts, current role vs assignment, owner protection, pending filter and role guide. Phone control clipping and repeated intro found. | Access identity8.2 / clarity7.8 / craft7.6; correction required. |
| 3 | Full-width phone role controls; shorter intro; pending/blocked identity; Viewer home/menu/attendance and non-admin access. | 8.2 / 8.1 / 8.0, overall8.1. Parent personally viewed desktop/phone pending roster, pending390 and Viewer390. |
| 4 | Failed/saving/approved role, scoped error/reset, loading, editor→Viewer→Pending, Blocked duplication removed, phone attendance2×2. Countdown lifecycle stops/resumes without duplicate timers. | Critic8.2 / 8.1 / 8.1, overall8.1. A separate gpt-6-astra stronger reviewer identified360 heading orphan, fixed with full-word wrapping and narrow-phone type adjustment; retained as round4-home-refined-360.png. Updated stronger review8.4 / 8.2 / 8.1, overall8.2; parent also viewed the repair. |
| 5 | Final invitation plus role/account/search/error states at desktop/phone, including360 home and countdown. Bound to source/public/dist and fixture/capture hashes. | Critic8.2 / 8.1 / 8.1, overall8.1. Parent8.3 / 8.2 / 8.2, overall8.2; separate functional QA passes. No unresolved visual blocker. |

Round3 designer captures were regenerated during the narrow-phone correction. The critic’s independently retained original round3 evidence in `.wedding-qa/critic-countdown-access/` remains the historical reviewed set; the unique round4 correction and final round5 files establish the corrected state.

[lifecycle.json](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/wedding-planner/design/countdown-access/lifecycle.json) verifies controlled pagehide/pageshow events and a browser clock; it does not claim observed native BFCache navigation. Visual fixture transitions do not prove backend authorization. Parent owns the actual Auth/Firestore role-transition, protected-owner, conflict, rules and release checks. Source TypeScript and Vite production build pass after the final heading repair. The final candidate is identified by [build-fingerprint.json](build-fingerprint.json), with state captures linked from [https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/wedding-planner/design/countdown-access/states.json](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/wedding-planner/design/countdown-access/states.json).
