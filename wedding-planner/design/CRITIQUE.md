# Independent visual critique

Critic: `wedding_critic`. Central 0.1.0, base `ba1235fe7b220842778414f3f70fca38e7df4c53`. Owner verdict: no direction accepted. Current visual verdict: **critic visual review PASS after five substantive cycles, including supplemental access-denied evidence; parent checkpoints and separate QA control the full agent-reviewed gate**. Scores are comparative judgments, not measured guest comprehension or owner approval.

## Direction gate — 15 October 2026

Independently read repository AGENTS, Wedding Record, both audience documents, evaluation guide, design brief, Central visual-design-director and critic guide, and ui-visual-verifier. Independently viewed all four actual reference images in `references/`: heirloom, editorial, schedule, working-product. Viewed `directions-desktop.png` and all six `direction-{1,2,3}-{desktop,mobile}.png` files, actual Chromium renders of `exploration.html`.

The desktop evidence is a 1440px comparison board with approximately 447px concept columns. Mobile evidence is a 390px browser with approximately 362px concept content. This establishes comparable direction studies, not a full-width desktop application. The source is a labelled visual prototype with nonfunctional control representations. No application existed as a baseline before these studies.

| Candidate | Personal invitation identity | Useful hierarchy/readability | Desktop/mobile compositional craft | Overall | Visible reasons |
|---|---:|---:|---:|---:|---|
| A — Folded invitation | 7.8 | 7.4 | 7.7 | 7.6 | Names dominate; paper margins, pomegranate ink and repeated rules link invitation to interior. The names have the clearest ceremony and mobile balance. Tiny second M makes the monogram seem accidental. Family text/control sizing is too fine for comfortable planning. |
| B — January journal | 7.1 | 7.1 | 7.0 | 7.1 | Asymmetric names and numbered list offer a distinct editorial structure. The oversized vertical January competes with the couple and crowds the mobile name/date composition. Generic new-chapter copy occupies more attention than practical detail. |
| C — Woven celebration | 7.3 | 7.5 | 7.5 | 7.4 | Serial dates and frame are clear; dark/ochre composition has character. All-capital names and strong flat material feel more formal register than personal invitation; the public and family surfaces share less typographic warmth. |

**Recommendation:** develop A, retaining the family ledger's directness. This is a direction recommendation, not an 8+ acceptance claim. Every declared dimension remains below final acceptance.

### Three generic-risk decisions per candidate

| Candidate | Decision 1 | Decision 2 | Decision 3 |
|---|---|---|---|
| A | Centred serif invitation: justified by occasion and heirloom reference, but improve distinctive type proportions. | Monogram: refine; two incidental overprinted Ms alone do not yet establish a crafted personal signature. | Equal cards: resolved; actual decisions use rule-separated rows with status nearby. |
| B | Huge decorative month: defective here; it competes with the named people at mobile size. | Numbered working list: justified for order and scanning, though numbers should signify real sequence or disappear. | Generic slogan: refine; its visual prominence is unsupported by personal material. |
| C | Repeated linear texture: justified as a restrained material, but must not become meaningless ornament. | Frame/all caps: refine; coupled with heavy ochre it gives an institutional rather than intimate emphasis. | Family register: justified; compact rows serve real open decisions, without a generic KPI/card dashboard. |

### Layer decisions and reference gaps

- **A:** retain colour, centred name composition and ruled family layout. Refine type, mobile spacing, navigation and monogram. Replace generic slogan with restrained invitation wording approved by family; absence of personal story is preferable to invented content. Motion is unobserved.
- **B:** retain asymmetric name grouping and deliberate heading/list contrast. Refine colour/spacing and numbered navigation. Replace the competing month watermark and dominant generic slogan. Motion is unobserved.
- **C:** retain serial-date concept and direct working rows. Refine type, colour weight, frame spacing and family navigation. Replace overprominent material if it continues to dominate the people. Motion is unobserved.

The heirloom reference uses margins to give names ceremony; A comes closest. The editorial reference demonstrates stronger name-scale confidence across devices. The schedule reference makes an expressive opening yield to useful details; no current candidate yet demonstrates a real event programme. The working-product reference keeps owner and action adjacent and readable; all studies need larger working text and explicit owner/edit affordances on real data.

**Highest-priority correction:** make family working text and actions comfortably readable, then show planned status beside the public dates. The board's provenance warning does not qualify a guest screen shared on its own. Final content must not imply confirmed programmes, venues, countdowns or menus.

## Separate QA verdict

**Not run / prototype only.** Actual screenshot viewing found no visible horizontal clipping in the supplied concepts, but this does not establish keyboard behavior, contrast ratios, scrolling, auth, saves, permission isolation, persistence, loading/errors, real menu density or functional navigation. Browser plugin inventory was empty, so the critic used `view_image` on actual Chromium render files rather than an interactive browser. Parent/QA must verify those flows independently. Full-width desktop and mobile application states remain required in the implementation loop.

## Implementation cycle 1 — full responsive invitation and overview

Viewed `cycle1-{guest,overview}-{1440,390}.png`, actual Chromium renders of `/` and `/family/?demo=1` on port 5174. Family preview is explicitly labelled synthetic; the displayed preview coordinator and arrival-welcome record are not wedding facts.

| Identity | Hierarchy/readability | Desktop/mobile craft | Overall |
|---:|---:|---:|---:|
| 8.0 | 7.2 | 7.8 | 7.7 |

The full-width desktop pair of names is confident and ceremonious; mobile stacks them cleanly. The public date now says celebrations planned for, fixing the factual qualification gap. Shared pomegranate rules and serif headings make the family interior recognisably part of the occasion. The fine supporting text, metadata and navigation are still too small for comfortable family work. The public page gives multiple large sections to unavailable programme, venue, directions and stay information, adding scroll without new guest value.

Three generic-risk assessments: **centred serif composition justified** by the invitation and executed with a clear name hierarchy; **repeated empty-info sections defective** because template completeness is dominating available content; **family card dashboard resolved** by the actual ruled list, although the large date panel and statistics should not displace decisions on mobile.

Retain colour, primary type composition, rules and restrained monogram. Refine supporting type, navigation and working controls. Replace the repeated public placeholder structure with one concise pending-information block. No imagery is needed until real assets exist; motion remains unobserved.

**Highest-priority correction:** readability uplift in the family interior and consolidation of sparse public content. The next substantive evidence must include real menu density and an edit form. Strongest reference gap remains the working reference's easy owner/action proximity at readable size.

**Visual verdict:** direction retained; not accepted. **QA verdict:** not run by critic. No clipping is visible in these four screenshots; behavior, access, saves and responsive interaction require separate QA.

## Implementation cycle 2 — readable working text and sparse public state

Viewed all eight `cycle2-{guest,overview,menu,editor}-{1440,390}.png` images. Same routes; menu disclosure and actual occasion editor are now rendered. The example event and three-line example menu remain explicitly synthetic, not documented wedding arrangements.

| Identity | Hierarchy/readability | Desktop/mobile craft | Overall |
|---:|---:|---:|---:|
| 8.1 | 7.5 | 7.7 | 7.8 |

The larger family body, owner and action text is visibly more comfortable; rows retain air. Hiding unavailable visiting details removes a large block of repetitive public placeholders. The public composition and planned-date wording remain coherent. The mobile family navigation now cuts off Arrangements without a visible scroll cue. The long occasion dialog presents essentials and optional detail at equal weight, and its Save action is absent from the visible region on both supplied editor captures. This is not proof the action is unreachable, but its location is unclear from the current working view.

Three generic-risk assessments: **empty-section overproduction resolved** in the sparse public state; **long generic form defective** until essential fields and save actions establish a clear working hierarchy; **decorative planner metrics justified but secondary**, because the actual decision/action remains first.

Retain primary type, warm materials, spacing uplift and public sparse composition. Refine mobile navigation and event row layout. Replace the undifferentiated form with essential fields plus grouped optional location/menu information and a visible action footer while the form body scrolls. Motion is unobserved.

**Highest-priority correction:** a comprehensible edit task with visible Save/Cancel, followed by explicit mobile access to all four sections. The menu screenshot shows only three fictional dish lines; documented Sangeet proposal density or equivalent labelled long synthetic content must be inspected before judging the catering view. The reference gap is now interaction hierarchy rather than invitation direction.

**Visual verdict:** direction improving, retained; not accepted. **QA verdict:** not run by critic. Parent must test dialog scroll/focus/save and mobile navigation. No two-round visual stall occurred.

## Implementation cycle 3 — navigation, editing and dense menu

Viewed all ten `cycle3-{guest,overview,menu,editor,editor-extras}-{1440,390}.png` images, including initial editor position and expanded/scrolled optional details. Menu evidence now contains a clearly labelled long synthetic menu. Save toast is visible in the menu capture; this image establishes feedback rendering, not backend persistence.

| Identity | Hierarchy/readability | Desktop/mobile craft | Overall |
|---:|---:|---:|---:|
| 8.1 | 7.8 | 7.9 | 7.9 |

The intentional two-by-two mobile navigation makes all four destinations visible. The editor now has a clear title/close region, scrolling form body and continuously visible Cancel/Save footer; this is a substantial improvement in the actual working task. Optional logistics/source detail is separated from essentials. The dense menu fits without clipping, but category labels have the same typographic weight as dishes, making scanning slower. Its one-column desktop panel leaves much unused horizontal space, while the mobile date rail unnecessarily narrows the expanded menu. The public line visibly reads “momentswe’ll” and needs a space.

Three generic-risk assessments: **mobile app strip resolved** by intentional navigation composition; **generic long form resolved structurally** by grouped detail and visible action hierarchy; **unformatted text dump remains defective** for a dense multi-category menu, despite its honest synthetic label and readable line spacing.

Retain invitation direction, mobile navigation and editor structure. Refine menu typography into distinct category groups and use desktop width deliberately; let the mobile disclosure occupy the full content width by moving the date into the event header. Fix the visible copy spacing. Motion remains unobserved.

**Highest-priority correction:** menu category hierarchy and mobile use of width. Inspect guests, arrangements and sparse/error/login states next. No direction reset is warranted: previously failing working dimensions have visibly improved.

**Visual verdict:** retained; close but not accepted. **QA verdict:** not run by critic; parent must independently verify scrolling, actual Save/Cancel, dropdown access and persistence. Parent's round-three personal checkpoint is separate from these scores.

## Implementation cycle 4 — guests, arrangements, attendance and menu hierarchy

Viewed all ten `cycle4-{guests,empty,arrangements,menu,attendance}-{1440,390}.png` images. They include two explicitly synthetic people in one household, recorded stay nights, an unmatched search, a long arrangement with synthetic costs, grouped dense menu, and an attendance dialog with confirmed and unknown kept separate. No mock names, bookings or prices are treated as wedding facts.

| Identity | Hierarchy/readability | Desktop/mobile craft | Overall |
|---:|---:|---:|---:|
| 8.1 | 8.0 | 8.0 | 8.0 |

Menu category headings now establish a scan path; the desktop two-column group layout uses width effectively, and mobile disclosure uses full width after moving the date into the header. Household/person distinction, adjacent Details actions, nightly people counts and reservation caveat are readable. Long names and arrangement text wrap without visible clipping. The actual attendance dialog retains usable selectors beside people on mobile. The unmatched-search copy still suggests adding people rather than clearing or changing the search. A centred success toast overlays core rows/menu in several captures; it should occupy a safer feedback region.

Three generic-risk assessments: **menu text-dump resolved** by category hierarchy and responsive group composition; **repetitive metric cards resolved**, with quiet inline counts and explicit meaning; **generic empty-state copy needs refinement** because unmatched search is a recovery task rather than a first-use task.

Retain type, colour, navigation, menu groups, list hierarchy and editor styling. Refine empty-search recovery copy/action and toast placement. No layer warrants replacement. Imagery remains deliberately absent pending real couple assets; motion remains unobserved.

**Highest-priority correction:** clear-search recovery and less obstructive feedback. Remaining required evidence: login, access denied, loading, failed save and final guest renders. These observed states meet the critic's visual threshold; the whole application is not yet accepted.

**Visual verdict:** observed working states reach 8+; final acceptance pending fifth-cycle state coverage and parent checkpoint. **QA verdict:** not run by critic. Screenshots do not verify correct counts, save persistence, access or motion; parent owns those checks.

## Implementation cycle 5 — sparse recovery, feedback and failure states

Viewed all twenty `cycle5-{guest,login,overview,validation,offline,empty-overview,search-empty,account,loading,unavailable}-{1440,390}.png` images. Public captures use reduced motion. Family editing and list captures retain the explicit local synthetic preview label. The designer describes loading/unavailable as actual test-browser Firebase SDK request hold/abort, not a successful sign-in or membership denial. The critic reviewed rendered pixels; the designer's account is not independent functional verification.

| Identity | Hierarchy/readability | Desktop/mobile craft | Overall |
|---:|---:|---:|---:|
| 8.1 | 8.1 | 8.0 | 8.1 |

The final sparse public invitation has confident name hierarchy, accurately planned dates, one coherent pending-details section and a clean closing. Login carries the same paper/ink identity and keeps Google sign-in primary; mobile prioritises the task over the large monogram panel. Loading and service-unavailable messages are legible and do not hide the invitation route. Validation/offline errors stay next to visible footer actions while entered text remains in the dialog. Clear-search recovery is now specific and actionable. Feedback is shorter and placed at the viewport edge; it can still temporarily cover content on mobile but no longer occupies the desktop working centre. No visible clipping or broken long-text composition is evident in these states.

Three generic-risk assessments: **generic empty copy resolved** with search-specific recovery; **template spectacle avoided** through accurate sparse content, no stock couple imagery and restrained name-led ceremony; **business dashboard chrome resolved** with shared wedding typography, ruled records and human task language. The monogram is intentionally modest rather than a substitute for future personal photography or approved invitation artwork.

Retain type, colour, spacing, composition, navigation, menu presentation and dialog structure. Refine later only against real family content and owner preference. No layer warrants replacement. Reduced-motion static rendering is reviewed; motion quality and timing were not observed by the critic.

**Highest-priority remaining verification:** render an actual unauthorized-membership/access-denied state through a safe development/emulator path. SDK unavailability does not establish that state. No production bypass should be introduced to manufacture evidence. For mobile validation, QA should ensure the relevant invalid field is focused/scrolled into view after the footer message.

**Visual verdict:** all observed declared dimensions meet 8+; no major visual issue in the reviewed states. Five substantive cycles are retained. Full gate remains incomplete until access-denied evidence or an explicit residual gap, parent's own final score/checkpoints and separate QA are recorded. This is not owner acceptance. **QA verdict:** not run by critic; auth, permission revocation, persistence, counts, focus, real saving, performance and deployment remain parent/QA responsibilities.

### Cycle 5 supplemental — actual access removal

Independently viewed `cycle5-denied-1440.png` and `cycle5-denied-390.png`, provided by parent after an actual synthetic-account Auth/Firestore emulator membership removal. The visible state says family access has been removed and presents an account-switch action. The private working interior is absent; the invitation remains accessible. Both viewports preserve readable notice and recovery hierarchy without clipping. This closes the missing visual state. It does not by itself prove authorization security.

Final critic scores remain **8.1 identity / 8.1 hierarchy and readability / 8.0 desktop-mobile craft / 8.1 overall**. **Critic visual review: PASS.** There is no major visual issue in the final reviewed states. Parent reports independent emulator/browser integration passing active-editor revocation, concurrent stale-save rejection, archive/history export and sign-out; that is a separate functional verdict, not a reason for these visual scores.

Remaining visual limits: critic did not observe motion directly; reduced-motion static output was viewed. Owner aesthetic acceptance has not been given. Parent must personally inspect the final candidate and retain its own scores/QA in the acceptance record before claiming the full gate passed.
