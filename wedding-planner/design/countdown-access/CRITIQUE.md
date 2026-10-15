# Countdown and family access — independent visual review

Reviewer: wedding_critic. Bounded extension of the existing Botanical candidate, not a direction reset. Current extension verdict: **critic visual pass** on final candidate `22c25dc3fc0c4a9cdc8f6fee22d5ac162419ab657f335db5d49b28fe9c8bdb20`, with five inspected rounds and 25 exact final renders. Owner aesthetic acceptance is not inferred. Prior Botanical evidence remains in ../botanical/CRITIQUE.md. Central visual-design-director 0.1.0 base ba1235fe7b220842778414f3f70fca38e7df4c53; critic guide and ui-visual-verifier reloaded. Parent owns backend/rules/full functional QA; designer owns frontend; critic owns this record and review evidence only.

## Scope and truth

A centred countdown belongs to the invitation. The owner requested the countdown; the parent selected **18 January 2027, 00:00 IST (+05:30)** as a transparent implementation boundary, explicitly labelled as the first planned celebration day. This is not an owner-confirmed exact event time or ceremony time. The dedicated #/access page shows real Google sign-in identities and their access state: Pending, Admin, Family, Viewer, Blocked. Pending sees no private plan; Viewer reads without edit; Family edits; Admin manages. The protected owner UID retains Admin. Synthetic accounts used in review must be labelled as such and are not wedding guests or actual authorised family.

## Critical dimensions declared before scoring

1. **Botanical identity and eye path:** names/art remain dominant; the centred countdown feels integrated with ivory, blush, sage and the existing typography, without becoming a dashboard or implying a ceremony instant.
2. **Permission and task clarity:** signed-in identity, current role, intended change and Save action are distinguishable; Pending has a clear next step; Admin/Family/Viewer/Blocked meanings and protected owner are understandable at realistic list density.
3. **Responsive/state craft:** readable countdown and access controls at 1440, 390 and 360px; long emails, dense accounts, loading, pending, viewer and error states retain hierarchy without clipping or private-plan leakage. Visual scoring does not establish authorization enforcement.

Each critical dimension must independently reach 8+ in current rendered evidence; functional QA is separate. Five narrow substantive render/review cycles are planned by the designer. Record only cycles actually inspected. Owner aesthetic acceptance cannot be inferred from internal review.

## Evidence and findings

No implementation or deployment by critic.


## Round 1 — centred live countdown

Independently opened the actual invitation at http://127.0.0.1:5177/ in installed Chrome, observed seconds changing, and captured/viewed 1440x1000, 390x844 and 360x844 in .wedding-qa/critic-countdown-access/round1-invitation-{1440,390,360}.png. Readable page state and browser observations retained in round1-observed.json. Also personally viewed designer round1-no-js-390.png and round1-complete-390.png. The earlier 5173 attempt never reached the wedding page and produced no acceptance evidence.

**Invitation-only scores:** Botanical identity 8.2, target clarity 8.0, responsive craft 8.2. Overall extension is unverified until the access journey is rendered and inspected.

The names/art retain the dominant composition of the prior Botanical invitation. A single ivory countdown overlaps the lower scenic edge and is genuinely centred on desktop; the phone preserves the same reading order. All four numeric units and their labels fit 360 without clipping. The date line explicitly says 18 January 2027, midnight IST; completion says 18 January is here rather than inventing a ceremony time.

**Highest-priority refinement:** bring the no-JS phrase “first day of our planned celebrations” into live target context, so the midnight instant reads explicitly as a date boundary. Retain type, palette, imagery, spacing and navigation. Three generic risks are justified/resolved: the four numeric components represent actual time units; the single card holds one requested countdown rather than a dashboard grid; the programme/venue note appears once rather than repeating unknown-detail blocks.

**Separate limited browser observations:** live seconds changed at all three widths; observed no page errors or horizontal overflow. This is not a backend/date-math/access-control test verdict. No final candidate or owner acceptance claimed.


## Round 2 — dense access list and assignment

Independently drove actual #/access in Chrome with visualStoreSource('admin'), a browser-only intercepted store containing ten labelled synthetic accounts. Opened all-account and pending filters at 1440/390/360; personally viewed own all-account 1440/390, pending 390/360, changed-role 390 and expanded role-guide 390 captures in .wedding-qa/critic-countdown-access/. Own observations are retained in round2-observed.json. These fixtures prove frontend rendering, not Google authentication or authorization.

**Observed access scores:** identity 8.2, permission/task clarity 7.8, responsive craft 7.6, overall 7.8. The current phone state blocks visual acceptance.

Desktop has a coherent identity/current-role/change-action arrangement, readable owner protection, and compact meaningful role badges. The changed Family dropdown remains distinct from the unchanged Awaiting approval badge; Save becomes active. Legacy Editor appears as Family. Role help is available without permanently displaying a long permissions essay.

**Corrections sent immediately:** (1) at 390 and 360 the current “Awaiting approval” option is clipped because the dropdown/Save form remains indented beneath the avatar; use the available row width or a concise Pending option. (2) the generic subtitle repeats the account explanation, then generous toolbar spacing pushes the first pending Save to about 800px down the phone page; cut the generic subtitle and tighten intro/toolbar rhythm. Retain type, colour, roster rows, owner treatment and filters; refine only composition/spacing/control width. No new visual direction is needed.

Three generic risks: the single shared list panel is justified by account comparison; role badge plus dropdown is justified by current-versus-draft state; the repeated introductory copy is defective because it delays the working task on phone. Strongest gap from the compact family reference is time-to-task, not lack of decoration.

**Separate limited interaction observations:** selected Family for one pending synthetic account, pressed Save, observed success and pending count 2→1. Expanded role help and changed filters. No page errors or horizontal overflow in this run; role enforcement, concurrent changes and actual sign-in registration remain parent QA. Pending, Viewer, errors and loading await later rendered review.


## Round 3 — phone controls, pending identity and Viewer journey

Independently opened actual app states with the browser-only visual fixture. Own round 3 evidence in .wedding-qa/critic-countdown-access/; personally viewed pending-roster 390, role-choice 360, pending 1440/390, blocked 390, viewer-home 390, viewer-menu 390, viewer-attendance 390 and non-admin-access 390. Additional captures are not implicitly inspected. Initial assertion selected hidden role-guide text; corrected to visible main text and reran before judging.

**Scores:** identity 8.2, permission/task clarity 8.1, responsive craft 8.0, overall 8.1. No major visual blocker in these observed states; final acceptance remains pending later states and candidate binding.

The full-width phone role form now fits Awaiting approval at 360/390, with active Save distinct from unchanged current-role badge. Removing the generic subtitle reduces the delay before real accounts. Pending identifies the signed-in account, explains admin review and automatic opening after approval, and offers another account without showing the plan. Viewer home and the full documented Sangeet menu remain useful; attendance shows a status rather than a disabled editing form. The dedicated access route gives non-admins a clear return home.

**Next refinements sent:** the expected Blocked state repeats the cannot-open/contact-admin message in intro and alert; remove the duplicate expected-status alert. Viewer attendance totals wrap 3+1 at 390; a deliberate 2×2 arrangement would improve rhythm. Retain imagery, palette, identity grid, roster/current-role hierarchy and full-width form; refine the two local state compositions only.

Three generic risks: the short Viewer notice is justified by a meaningful capability difference; role badges plus editable choice are justified by current-versus-draft state; duplicated Blocked copy is redundant and should be removed. The compact family reference supports preserving working content rather than replacing disabled capabilities with decorative filler.

**Separate limited browser observations:** actually navigated Viewer home→Catering→Sangeet, then attendance and #/access; observed zero menu add/edit/archive controls and zero attendance selects. All captured state viewports had no horizontal overflow. These are rendered fixture observations, not security enforcement. Parent owns round 3 checkpoint and full QA; errors/loading and final release evidence remain unreviewed.


## Round 4 — recoverable errors, loading and role transitions

Independently drove Chrome with browser-only synthetic error/delay/state fixtures: failed save→Use current role at 1440/390/360; saving→approved at 390; loading at 1440/390; opened Sangeet menu editor→Viewer→Pending at 390; corrected Blocked and Viewer attendance at 390. Own evidence and observed state checks: .wedding-qa/critic-countdown-access/round4-*. Personally viewed failure 1440/360, reset 390, saving 390, loading 1440/390, downgraded-viewer 390, returned-pending 390, blocked 390 and viewer-attendance 390. Also viewed designer countdown-resumed 1440/390 renders. Other captures are not implicitly inspected.

**Scores:** identity 8.2, permission/task clarity 8.1, responsive craft 8.1, overall 8.1. No unresolved visual blocker in the observed states.

The error stays inside the affected account row, with the draft Family choice still visible and a readable Use current role action. Saving has a visible local state; untouched accounts retain their controls. Reset returns the visible choice to Pending and clears the error. Loading retains the established entry composition. The synthetic role downgrade closes the editor and presents Viewer context; Pending returns to a coherent identity/approval screen. Blocked no longer repeats the expected error paragraph. Four attendance totals now form an intentional 2×2 phone arrangement. The public countdown explicitly names the first day of planned celebrations alongside midnight IST; the prior target-context refinement is resolved.

Retain all affected layers: type, palette, artwork, row composition, responsive forms and contextual feedback. Three generic risks are resolved/justified: local error panel explains a specific failed account change; loading reuses the real invitation language rather than invented dashboard skeletons; duplicated Blocked messaging has been removed. No new decorative layer is needed. Highest priority is final frozen-state evidence and actual backend QA, not additional visual work.

**Separate limited interaction verdict:** Use current role reset to pending with disabled Save at all three widths. The browser-intercepted downgrade closed the open dialog, and all captured pages had no horizontal overflow. These fixtures do not verify real role enforcement or concurrency. Designer lifecycle evidence uses synthetic pagehide/pageshow events; viewed stills do not establish actual BFCache navigation or motion quality. Parent assigned the stronger review to round 4; my scores were sent before reading that report. Final candidate binding and parent full QA remain pending.


Round 4 supplement: the parent’s separate stronger review identified an orphaned final letter in Tasks & Decisions at 360px. Designer corrected the narrow heading word-break/font fit; critic personally viewed `round4-home-refined-360.png` and confirmed complete words on deliberate lines. Designer reported accidental regeneration of its round-3 paths; the critic’s independently retained historical round-3 images above remain the original evidence. No historical review is silently rebound to overwritten designer files.


## Round 5 — final candidate, sparse/search states and exact render binding

**Final visual verdict: pass, no unresolved visual blocker in the inspected extension.** Candidate: 22c25dc3fc0c4a9cdc8f6fee22d5ac162419ab657f335db5d49b28fe9c8bdb20. All 25 unique final images in states.json were personally viewed, including invitation 1440/390/360, no-JS/completion 390, full roster 1440/390/360, pending filter 1440/390, changed choice/no-match/account 390, pending 1440/390/360, Viewer home 1440/390/360, Viewer menu/attendance/admin-restriction 390, blocked/loading/failed-offline-role 390. Exact paths and current SHA256 values are in critic-reviewed.json. This does not imply parent reviewed every image.

| Botanical identity | Permission/task clarity | Responsive/state craft | Overall |
|---:|---:|---:|---:|
| 8.2 | 8.1 | 8.1 | 8.1 |

Identity 8.2: names and actual floral artwork retain the selected Romantic Botanical composition; the centred ivory countdown belongs to its lower scenic edge rather than competing with the couple. The first-planned-day/midnight IST context is visible. Family access uses the established typography and restrained sage/blush status language without turning the family home into an administration dashboard.

Clarity 8.1: current role, proposed dropdown choice and enabled Save remain distinct. Protected owner has a lock and no editing control. Pending accounts have an explicit identity, approval state and next step; Viewer keeps useful programme/menu/attendance content with a clear read-only notice. Search no-match gives a specific recovery action, and account-local offline feedback preserves the proposed choice. Existing family access and pending profiles share one understandable roster.

Craft 8.1: all four countdown units remain readable at 360; full-width role controls no longer truncate Awaiting approval. Long account names/emails remain associated with the correct row, dense lists are filterable, and the repaired 360px Tasks & Decisions title uses whole words. The phone attendance totals form two intentional rows. Sparse, loading, blocked and error states maintain spacing and readable content rather than exposing empty working controls.

Three generic-risk decisions are justified: the numeric grid expresses four real countdown units; the badge/dropdown pair expresses current-versus-proposed access; one ruled account list supports comparison without speculative metrics or a tile per permission. Retain type, palette, artwork, countdown placement, roster composition, navigation and responsive forms. No layer needs replacement or further visual refinement for this candidate. Personal facts beyond the supplied names/planned dates still depend on actual family decisions; artwork is imagined and role identities in these renders are synthetic.

**Final independent browser evidence:** reopened current app in installed Chrome at 1440/360 for the invitation and 390 for pending→Viewer assignment, no-match search→Show all accounts recovery and account menu. Cached observations: .wedding-qa/critic-countdown-access/final-browser-observed.json. Verified every entry in build-fingerprint.json against current source/public/dist/capture-fixture bytes before review, then rechecked before writing this verdict. The final image hashes in critic-reviewed.json bind the review to the actually viewed files, not merely a filename or plausible screenshot description.

**Separate functional verdict and limits:** parent reports actual Auth/Firestore role journeys, legacy Editor compatibility, stale assignment checks and final 12 browser tasks passing. My limited browser interactions and synthetic role-transition rendering do not replace that suite or prove server enforcement; QA success did not raise visual scores. Static reduced-motion captures and synthetic pagehide/pageshow coverage do not establish motion quality or actual BFCache navigation. The owner requested a countdown; the labelled first-day midnight boundary is the parent’s implementation choice, not an approved ceremony time. Remaining next step is parent candidate/release judgment and owner aesthetic review, with no further visual change requested by critic.


Historical evidence preservation: the original independently captured round-3 pending-roster 390 file is now durably copied byte-for-byte from `.wedding-qa/critic-countdown-access/round3-pending-roster-390.png` to `design/countdown-access/critic-round3-pending-roster-390.png`, SHA256 `5c1c0df467c0c88bb8958faef88d8208133f39176149560040942b9a3817b672`. This preserves the original round-3 capture; it is not a new render and is not part of the 25 final candidate images.
