# Stronger independent review — round 4

Reviewer: `countdown_stronger_r4`, actual gpt-6-astra; 15 October 2026. Supplemental visual review only; no application edits. Central 0.1.0, source `ba1235fe7b220842778414f3f70fca38e7df4c53`. Loaded project AGENTS, Botanical BRIEF, countdown/access BRIEF, Central skill and critic guide, agent-output-quality and ui-visual-verifier. HEAD observed: `075b1e390c285aba3868f00b17e935dc193ca80c`; candidate includes ongoing uncommitted work. Existing direction is agent-reviewed, owner aesthetic approval pending.

## Findings first

1. **Repair the 360px home destination label before final acceptance.** In `round3-viewer-home-360.png`, Tasks & Decisions wraps into “Tasks & / Decision / s”. The isolated final letter makes the destination look broken and lengthens its tile. This is a concrete narrow-width craft defect, despite the manifest reporting no horizontal overflow. Preserve the accepted destination composition; give this heading enough usable width or adjust its narrow-width type/layout. Recapture the current Viewer home at 360 and 390. This older retained state is not silently treated as proof that a later source revision still has the defect; a current replacement image is required to close it.
2. **Minor transient obstruction:** `round4-approved-role-390.png` and `round4-approved-role-360.png` show the success toast over the second account's identifying details. The message is clear and the role form remains usable. Prefer verifying its short duration and return of unobscured content in final interaction QA; this alone does not block visual acceptance.
3. **Current 360px countdown evidence is missing.** The current round-4 390px render adds “To the first day of our planned celebrations”; the retained round-1 360px render predates that line. The composition looks credible at 390 and the earlier four-unit layout fits at 360, but final evidence should include the current content at 360.

The primary countdown, access roster, protected owner, pending identity, failed-save recovery, saving, Viewer menu/attendance, blocked and loading compositions otherwise show no material visual blocker in the inspected images.

## Independent scores

These scores were formed from pixels before reading the primary critic's round-4 scores. They are visual judgments, not measured perception or owner approval.

| Declared dimension | Score | Visible reason |
| --- | ---: | --- |
| Invitation identity and short eye path | 8.4 | Names sit in quiet ivory, the floral canopy supplies the specific wedding identity, and the centred countdown overlaps the scene edge without replacing the names as the dominant object. Phone recomposes the artwork beneath the names. The midnight IST boundary is explicitly tied to the first planned celebration day. |
| Permission clarity | 8.2 | Desktop separates identity, current role and draft assignment; mobile retains that distinction with a full-width form. Owner has Admin plus Workspace owner and Protected access, with no editable dropdown. Pending count/filter, inline failure, reset action and Viewer notice explain the relevant task. |
| Responsive/state craft | 7.9 pending repair/evidence | Access forms and long identities fit at 360/390; pending and blocked put status before artwork; attendance uses a deliberate 2×2 layout. The orphan “s” in the retained 360px Viewer home is visibly unfinished, and the current 360px countdown has not been retained here. |
| Overall | 8.1 | A coherent bounded Botanical extension with useful access operations. The narrow home-label defect prevents an unconditional all-dimensions ≥8 verdict. |

**Round-4 supplemental verdict: preserve the direction; close the narrow-width finding and retain current final evidence. This report does not establish final acceptance.** An average above eight cannot override the craft dimension. No direction reset is warranted for this localized defect.

## Reference comparison and generic-risk assessment

Personally compared `../concepts/01-romantic-botanical.png` with current countdown and working access states. The scene, quiet name space, ivory material and sage/blush accents preserve the intended reference mechanisms without importing its fictitious couple, venue or programme. The strongest remaining reference gap is compact working-page rhythm on small phones: intro, role help, two rows of filters and search precede the account list, although pending Save is reachable and the list is far more operational than decorative dashboard cards.

- A single bordered roster is **justified** by account comparison; it does not turn every permission into an unrelated card.
- Role badge plus role dropdown is **justified** by current-versus-draft status, visibly demonstrated by the failed Family assignment beside Awaiting approval.
- The centred countdown panel is **justified** by one genuine date-boundary task. Its fine rules and restrained material belong to the invitation rather than adding speculative progress metrics.

Retain imagery, palette, type family, desktop composition, roster structure, owner treatment and navigation. Refine only the narrow home heading and, optionally, toast positioning. Motion is unscored because still images cannot establish it.

## Evidence personally viewed

Paths below are relative to this directory; the manifests were also read. An image existing in a manifest does not mean it was visually inspected.

- Public/reference: `../concepts/01-romantic-botanical.png`; `round4-countdown-resumed-1440.png`, `round4-countdown-resumed-390.png`; `round1-live-360.png`, `round1-no-js-390.png`, `round1-complete-390.png`.
- Roster/recovery: `round4-approved-role-1440.png`, `round4-approved-role-390.png`, `round4-approved-role-360.png`; `round4-failed-role-1440.png`, `round4-failed-role-360.png`; `round4-saving-role-390.png`; `round3-role-choice-390.png`.
- Capability/entry states: `round4-downgraded-viewer-1440.png`, `round4-downgraded-viewer-390.png`; `round4-returned-pending-1440.png`, `round4-returned-pending-360.png`; `round4-viewer-attendance-390.png`, `round4-blocked-390.png`, `round4-loading-390.png`; `round3-viewer-home-360.png`, `round3-non-admin-access-390.png`.

Read `round4.json`, `lifecycle.json`, relevant portions of `round3.json`/`round1.json`, `capture-round4.mjs`, and `visual-fixture.mjs`. Inspected current home-label and wrapping rules with `rg`. Read primary `CRITIQUE.md` only after forming the visual findings/scores; its current pass does not resolve the independently observed 360px home state.

## Verification limits and next action

Actual browser-produced PNGs were inspected with `view_image`. Independent live browser opening was attempted via CUA at `http://127.0.0.1:5177/`, but this reviewer received **Browser is not available: iab**. I did not independently execute interactions or backend tests, and do not claim the full live-review gate. The primary critic's independently driven browser work remains a separate evidence lane.

Account identities and role changes are explicitly synthetic browser interception fixtures, visibly labelled Local preview/Example records in the working screens. They demonstrate rendering, not actual Google account registration, permission enforcement, owner security or concurrency. Public names/date range are brief-defined product truth; the scene is illustrative artwork. Countdown completion uses a synthetic clock. Lifecycle manifest records synthetic pagehide/pageshow handling and explicitly does not prove real BFCache navigation.

Parent retains backend/security QA and final candidate binding. Next action: fix/verify the 360px destination heading, render the final countdown at 360, and have critic/parent inspect those exact final images before all-dimensions acceptance. No source or unrelated files changed by this reviewer.

## Repair verification — appended after the original review

Personally opened `round4-home-refined-360.png` with `view_image` after the designer's narrow-phone repair. “Tasks & Decisions” now uses two intact lines, “Tasks &” / “Decisions”, with no orphan letter. Its heading has room beside the icon, supporting copy remains readable, and the lower pair of destinations now has balanced height. The established two-column home composition, Viewer notice and celebration hierarchy are retained. **Finding 1 is resolved in this specific repaired 360px render.** The original finding and scores above remain historical evidence.

Updated supplemental visual scores for the evidence now inspected: **identity 8.4 / permission clarity 8.2 / responsive-state craft 8.1 / overall 8.2**. The craft increase is justified solely by the visible repaired heading and tile rhythm. No unresolved visual blocker remains in the inspected set. The success-toast observation remains a minor interaction-QA item.

This is a repaired round-4 visual verdict, not final candidate acceptance. The current 360px countdown with the added first-day explanation has not yet been supplied or inspected; round 5 must retain and inspect it. Live-browser and backend-verification limits above remain unchanged. Only this report was modified by the reviewer.
