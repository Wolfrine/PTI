# Atlas independent visual review

Reviewer: atlas_visual_critic. Parent handles QA separately. Starting repository candidate: cee67b732634a7ccb12906d4c4c27e5b93377de4. Central release 0.1.0, base ba1235fe7b220842778414f3f70fca38e7df4c53. Read the director skill, critic guide, root AGENTS and Home design memory.

## Current owner verdict

New Atlas surface. Light, grand, modern and intuitive; no dark styling, repetitive card grid or scene/photo background. Several sectors should be simultaneously legible and evoke wider thought. Core job: locate a sector, understand a subject's existing knowledge, and inspect our work/evidence without equating activity with mastery.

## Predeclared critical dimensions

1. Sector and subject clarity: sector names and a selected subject's place are unambiguous without a tooltip; drill-down and return are visible; a mobile user can reach a subject without deciphering an unlabeled diagram.
2. Expansive composition: the first working viewport communicates several distinct areas, with deliberate scale/rhythm and one dominant knowledge object; not twelve interchangeable KPI cards or a decorative network.
3. Evidence and progression truth: humanity's knowledge and personal work are visibly distinct; counts have a defined scope; pending evidence is not styled as validated understanding; sources/dates are findable.
4. Responsive readability: desktop and 390/320px layouts preserve hierarchy and legible controls; long subject/source labels neither clip nor become tiny; focus and sparse/error states remain understandable.

Each dimension must independently reach 8/10 with visible reasons. Initial directions are not accepted until actual desktop/mobile renders exist. Five substantive review cycles follow credible direction selection. Current verdict: unverified.

## Existing PTI context personally inspected

No Atlas baseline exists. The existing PTI Home desktop/mobile render files `pti-app/design/codex-usage-evidence/parent-final-fresh-desktop.jpg` and `parent-final-fresh-mobile.jpg` were inspected. They are labeled synthetic fixture captures. Preserve warm-neutral background, restrained coral identity and clear Home return, but Atlas should have its own working knowledge surface; do not copy Home's room photo or app-card grid into Atlas.

## Reference images personally inspected

### Open Knowledge Maps working map

File: references/okm-working-map.png

Source: https://raw.githubusercontent.com/OpenKnowledgeMaps/Headstart/master/headstart.png

Context: actual repository UI screenshot, found through https://github.com/OpenKnowledgeMaps/Headstart . Wide desktop working state for digital education, spatial topic clusters beside document results.

Useful mechanism: overview and detail coexist; selecting a region can ground a precise source list. Explicit corpus size, source and time range frame what the map means.

Do not copy: crowded overlapping text, circular area implying magnitude without clear meaning, tiny truncated labels, or source-list typography. Atlas can use spatial separation without copying this collision-prone bubble layout.

### Open Knowledge Maps discovery concept

File: references/okm-concept-overview.png

Source: https://openknowledgemaps.org/img/future-of-discovery/1-start-page.png

Context: explicitly a future-concept sketch on https://openknowledgemaps.org/about , not a verified shipped interface.

Useful mechanism: broad discipline labels distributed across one calm open field; search enters the same landscape instead of replacing it. Several disciplines are perceived simultaneously.

Do not copy: anonymous circles, decorative dots, low-contrast labels, schematic placeholders, or pretend this image demonstrates a completed product.

### Our World in Data sourced chart

File: references/owid-sourced-chart.png

Source: https://ourworldindata.org/grapher/co-emissions-per-capita.png?tab=chart

Context: actual chart graphic linked from https://ourworldindata.org/redesigning-our-interactive-data-visualizations . It is a rendered chart, not a full current application screenshot.

Useful mechanism: a specific question/title leads, content is the dominant object, labels attach directly to the relevant series, and source/time/method qualifications remain visible beneath. Small typography/color differences communicate meaning without boxes.

Do not copy: the quantitative line-chart form for non-quantified personal understanding, or use arbitrary percentages just to fill the layout. This reference supports typographic hierarchy and provenance, not sector navigation.

The image references/okm-illustration-not-ui.png is an explanatory illustration discovered during lookup and is excluded from design-reference evidence.

### D3 zoomable treemap

File: references/d3-zoomable-treemap.jpg

Source page: https://observablehq.com/@d3/zoomable-treemap

Image URL observed in that page's og:image metadata: https://images.observableusercontent.com/thumbnail/f9497e80832db90c4469afba796cce32286507af92f747b937e48397d97e000a.jpg

Context: low-resolution preview of a working hierarchical example, not a full product screen. Personally inspected.

Useful mechanism: adjacency and containment express a branch's relationship to the whole in one canvas.

Disposition: cautionary reference. Reject its area-as-value composition for Atlas unless area has a defined truthful quantity. Its tiny/cropped labels and gray blocks are unsuitable for the owner's readable, expansive view; do not recreate a card grid as a treemap without semantic purpose.

## Candidate reviews

Personally inspected all six `candidate-{field,index,orbit}-{desktop,mobile}.png` renders, generated from the same synthetic representative content. These are direction studies, not implemented functionality or owner-accepted results. Root independently inspecting as well.

| Direction | Clarity | Expansive composition | Evidence truth | Responsive readability | Disposition |
| --- | ---: | ---: | ---: | ---: | --- |
| Field | 7.5 | 7 | 7 | 6.5 | Selected as most credible starting direction; not accepted |
| Index | 8 | 5 | 7 | 6.5 | Clear catalogue; insufficient landscape quality |
| Orbit | 6 | 6 | 7 | 6 | Decorative centrality/relationships; no clear gain |

Field: all twelve disciplines remain clearly visible on desktop and its typographic openness is the closest match to breadth without scenes. However, identical pale ellipses arranged 4 by 3 still read as repeated cards. Mobile contours become tightly packed; the selected-subject detail occurs after the entire sector list, around 1400px below the top. Secondary descriptions are faint. The literal subject title is relegated to a small breadcrumb while a poetic headline dominates.

Index: strong scanning and direct labels, but the two-column ledger is a conventional directory rather than an expansive field. On mobile, one long list consumes the working viewport and puts detail below it. Our-work dots visually touch the ends of selected names.

Orbit: outer ellipse, inner ellipse and central lens imply a model that the content does not explain; Software and data is duplicated at center and perimeter. Labels shrink substantially compared with Field. Mobile loses the orbit and becomes a repeated grid, so its mechanism provides little durable value.

All three correctly distinguish humanity's knowledge from personal progression and explicitly say evidence is pending and understanding unassessed. Actual source entries, freshness and approved/pending evidence comparisons are absent, so truthfulness cannot yet score 8.

### Structural instructions for implemented cycle 1

1. Build one open, typographic knowledge field, not an oval per sector. Use spacing, rhythm and restrained meaningful grouping; avoid fake magnitude, relationship edges or centrality.
2. Lead the detail with its literal subject title, e.g. Data systems. Clarify the sector-to-subject step.
3. Make selected sector subjects and selected subject detail immediately reachable. Mobile should advance/replace the working view or move focus to detail with an obvious back action, rather than forcing repeated scrolls past all twelve sectors.
4. Reduce mobile hero/header height while preserving multiple-sector visibility.
5. Increase secondary-label legibility. In actual detail, show scoped counts, pending/approved distinctions and source freshness.

Direction studies do not count toward the five substantive implemented review cycles. Current overall verdict: promising direction selected; not accepted.

## Implemented cycle 1

Actual Angular renders personally inspected: `cycle-1-overview-desktop.png`, `cycle-1-overview-mobile.png`, `cycle-1-sector-desktop.png`, `cycle-1-subject-desktop.png`, `cycle-1-subject-mobile.png`, `cycle-1-review-desktop.png`, `cycle-1-reviewed-mobile.png`. They are explicitly local synthetic fixtures with no authentication or database access. Review desktop was a full-page long capture, so detailed typography judgment relies primarily on the subject/detail renders, not a downscaled review thumbnail.

Scores: sector/subject clarity 8; expansive composition 6.5; evidence/progression truth 8; responsive readability 7. Overall 7.3. Verdict: not accepted.

Visible gains: the subject's literal name now leads; sector-to-subject navigation is explicit; the seed disclaimer avoids claiming a complete knowledge account; reviewed-mobile clearly distinguishes a green Linked record, amber Awaiting review record and separate self-reported Learning position. No mastery percentage is fabricated.

Remaining defects:

- The desktop landscape is twelve equal hairline cells with slight row staggering; it is calm but still catalogue-like. Selecting a sector replaces the whole field, losing the surrounding disciplines. The proposed selected-sector expansion with real child subjects is the right next structural test.
- Mobile navigation cuts Sources at the right edge without a visible overflow cue. All destinations must remain discoverable.
- In subject-mobile, personal position and evidence are far below the initial subject viewport. Add compact jump controls for Knowledge, Our position and Evidence; compact the repeated Atlas hero during drill-down.
- In subject-desktop, each evidence date wraps into the Inspect evidence action (`2026Inspect evidence`). Use separate block rows and spacing.
- Secondary labels remain light/small. Maintain readable body labels and verify 320px after structural fixes.

Requested cycle 2 captures: overview desktop/mobile, expanded sector desktop, subject desktop/mobile, and at least one empty or no-results state. QA remains parent's separate responsibility.

### Cycle 2 capture validity incident

The first `cycle-2-overview-desktop.png` showed a live TS2307 compiler-error overlay for `./atlas-field.component` during component extraction. No cycle 2 score was issued. Parent confirmed a live-capture race, will build a frozen preview bundle, add page-error/overlay gating, and recapture the whole set. The failed capture is not counted as an accepted review cycle. Unobstructed companion renders were inspected only for preliminary feedback: default-browser jump buttons need styling; outline subjects with zero references should not display an apparent subject-specific reference-check date.

## Implemented cycle 2 (frozen recapture)

Personally inspected refreshed `cycle-2-{overview-desktop,overview-mobile,sector-desktop,subject-desktop,subject-mobile,partial-mobile,outline-desktop}.png` from the built preview snapshot, after parent replaced the invalid live-capture set. No overlay is visible. Parent reports page-error/compiler-overlay gating. Build/tests remain separate QA and do not add design credit.

Scores: clarity 8; expansive composition 7.5; evidence truth 7.5; responsive readability 8. Holistic overall 7.7. Verdict: not accepted.

Substantive change: focused Computing and intelligence occupies a large left pane with three actual subjects while twelve sectors remain visible alongside it. Depth now varies with selection rather than fake magnitude. The mobile drill header is more compact; all five top destinations are visible at this captured width; evidence action/date spacing is repaired. Partial loading explicitly says the loaded selection is incomplete and labels unknown review state as Review not loaded.

Outstanding issues:

- Knowledge / Our position / Evidence controls render as browser-default gray rectangular buttons, unlike the otherwise deliberate page. Make a coherent in-page navigation treatment with focus state.
- Physics says no source references have been mapped, immediately followed by Public references last checked 29 Oct. Do not display an apparent subject-specific freshness claim with zero references. This visible contradiction reduces truth score from cycle 1.
- The generic right rail has an oversized maxim competing with the focused sector; make this supporting summary quieter/compact and allow the working landscape more space.
- The sector-desktop capture still shows the full-sector list replacing neighbors. Verify the intended selection flow: in-field focus should preserve context; an explicit full-sector view can be a separate action.
- Consider 36 starting subjects rather than 36 seed subjects because many are only unpopulated outlines. Avoid implying every subject already has sourced knowledge.

Cycle 3 should cover the revised hierarchy plus no-results, error, 320px and long source/title states. Parent personal inspection is due on cycle 3.

## Implemented cycle 3

Personally inspected all nine completed frozen captures: `cycle-3-{overview-desktop,overview-mobile,focus-desktop,subject-mobile,sources-desktop,sources-invalid-mobile,empty-search-mobile,error-mobile,long-source-mobile}.png`. Parent confirms focus-desktop followed a real sector click, and source validation followed browser interaction. Root personal checkpoint requested after this independent verdict.

Scores: clarity 8.2; expansive composition 8; evidence truth 7; responsive readability 7.5. Holistic overall 7.7. Verdict: not accepted.

Visible gains: Engineering and materials focus pane updates its real subjects while all twelve surrounding sectors remain visible. This resolves the contextual-navigation uncertainty from cycle 2. The quieter Our place, so far support rail no longer competes with the focused sector. In-page controls are now coherent borderless navigation rather than default-browser buttons. The outline freshness fix was reported by designer, but no outline image was in this set; it still needs visible verification later. Starting-subject wording appropriately describes incomplete coverage. The source approval screen explains bounded permission and shows an invalid broad URL error adjacent to the form.

Remaining defects discovered in edge states:

- Error-mobile shows a disabled Unassessed position and evidence count 0 with No evidence mapped even though the account load failed. Unknown is not zero, and an unloaded position is not a self-report. Show Position not loaded and Evidence unavailable with a dash; explicitly qualify any stale retained data.
- Empty-search-mobile at 320px displays the full long query as a five-line giant heading. Use a fixed Search results title and a compact, wrapped query line so the recovery action remains near the first working viewport.
- Long-source-mobile safely wraps the URL but lets arbitrary locator text dominate the entry. Show the meaningful source/host summary plus an expandable full locator; exact permission scope must remain inspectable, not silently truncated.

Cycle 4 targets: corrected error and no-results at 320px, normal/linked subject, exact-record inspection affordance, keyboard-focused navigation, and a visible outline freshness check. Screenshot readability does not certify computed contrast or keyboard behavior; those remain root QA.

## Implemented cycle 4

Personally inspected six frozen captures: `cycle-4-{overview-desktop,overview-mobile,error-mobile,empty-search-mobile,long-source-mobile,partial-mobile}.png`.

Scores: clarity 8.2; expansive composition 8; evidence truth 8.3; responsive readability 8. Holistic overall 8.2. Verdict: provisional visual threshold reached for this rendered set, not final acceptance. The required fifth substantive review and parent's final personal inspection remain outstanding.

Visible gains: error state now says Position not loaded and uses an unavailable evidence dash with a truthful explanation. Partial state says the position is not loaded and offers Load more progression; review status remains Review not loaded. Missing data no longer masquerades as zero or unassessed. Search has a fixed title and compact query. Long locator is summarized by source/host with an Inspect exact approval disclosure, preserving an explicit path to full scope.

Last meaningful refinement: at 320px, active search retains the large overview hero and two-line primary navigation; about 440px precede the working content and Explore all sectors is near 900px. Use the compact Atlas hero for active search as for drilled views, so recovery is closer to the initial viewport. Avoid arbitrary decoration or score inflation merely to create a fifth cycle.

Final capture requirements: overview desktop/mobile; normal and linked subject; outline without misleading reference-check date; expanded long locator; exact-record inspection and keyboard focus; source approval success/paused state where supported. Computed contrast, interactions, storage and deployment checks remain separate root QA.

## Implemented cycle 5: final independent review

Current verdict: **AGENT-REVIEWED** for the exact candidate and evidence set below. This is not owner acceptance, not a production-data validation, and not a substitute for parent's personal final inspection. No blocking visual defect was found in these inspected states. Five substantive implemented review cycles are complete; the discarded live compiler-overlay capture was not counted as an additional cycle.

After the critic's final scores were sent and recorded, root confirmed personal inspection of all seventeen final renders and no visual release blockers. The scores below remain the critic's independent scores, formed before receiving root's final scores.

Candidate identifier supplied by root (production build, catalogue and fixture): `94859f309309ee98048bafa242825b9203c7133378b004317badee51590b01ef`.

Evidence root: `pti-app/design/atlas/evidence/final/`.

`capture-manifest.json` SHA256 independently computed: `902dd90d73b4a0f63b117ef2fe8c3c75b677f483dec94fd6786523f4c60135e7`.

All seventeen final PNGs were personally inspected in small batches. The very long review-desktop and inspect-mobile captures were additionally viewed at original resolution so this judgment did not rely on tiny full-page thumbnails. Every PNG's SHA256 was independently recomputed and matches the capture manifest. The production candidate identifier is root's binding; the critic independently verified the image/manifest hashes, not the production build digest.

### Final scores

| Critical dimension | Score | Visible evidence |
| --- | ---: | --- |
| Sector and subject clarity | 8.5 | Literal sector/subject names, semantic desktop sector subtitles, upfront map key, clear hierarchy between sector focus and three actual child subjects, breadcrumbs and subject jump controls. |
| Expansive composition | 8.1 | Twelve sectors coexist with an expanded focused branch; calm open background and unequal semantic hierarchy replace oval cards/orbits. The support rail is subordinate. It remains an editorial atlas, not an unusually immersive spatial visualization, so this is not a 9-level novelty claim. |
| Evidence and progression truth | 8.4 | Separate self-report, Linked and Awaiting review states; explicit incomplete/loading/error explanations; no false reference-check date on the Physics outline; source approval does not imply collection; receipts disclose incomplete/missing capture metadata. |
| Responsive readability | 8.3 | 320px error/loading/search and 390px normal/linked/source/receipt views preserve labels, status explanations and controls. The compact active-search header restores the recovery action to the first working viewport. Long exact locators expand and wrap without hiding scope. |
| Holistic overall | 8.3 | Purposeful, coherent first release with no blocking visual issue in the reviewed states. |

Root separately reports passing interaction/viewport/contrast/runtime/build tests. Those checks did not increase any aesthetic score. The full-page inspect-mobile image shows the review queue, not its scroll position or a keyboard-focus ring; the critic does not claim it proves scrolling/focus behavior. That behavioral verification remains root QA.

### Three generic-risk dispositions

1. **Repeated generic card grid — justified after structural change.** A regular sector index remains because equal scanability is useful, but boxed oval cells and repeated numeric metadata no longer dominate desktop. A larger selected branch, real child subjects, semantic subtitles and a quieter personal-context rail give the regions distinct jobs. Review forms repeat because they are a consistent record-review workflow, not decorative dashboard tiles. This residual regularity is reflected in the restrained 8.1 composition score.
2. **Decorative futuristic metaphor or generic landing-page hero — resolved.** No scene/photo background, decorative orbit, unlabeled network or invented spatial centrality remains. The overview uses grand type to establish scope; drilled and search mobile states compact that branding so the actual subject or recovery action leads. Visible hierarchy now communicates selection rather than an arbitrary importance score.
3. **KPI-dashboard treatment of knowledge/mastery — resolved.** The map key defines Our work as recorded evidence or self-report. Counts describe loaded records, not universal knowledge or mastery. Pending, linked, unknown, loading and empty states are visibly distinct. The Physics outline admits missing foundations and sources; the history receipt admits missing capture scope instead of making a completeness claim.

### Visible comparison with references and baseline

- Against the Open Knowledge Maps working screenshot: the useful overview-plus-detail mechanism is retained, with explicit selected-sector subjects, while overlapping bubbles, tiny topic labels and ambiguous area-as-magnitude are absent.
- Against the Open Knowledge Maps discovery concept: the final page preserves simultaneous broad disciplines and an open, light field, but replaces anonymous circles with named, actionable sectors and truthful selection depth. The concept is still not represented as a shipped reference product.
- Against the Our World in Data graphic: titles, semantic labels and provenance do the work; sources are explicit and uncertainty has text. No quantitative chart form is borrowed for non-quantified understanding.
- Against the D3 treemap preview: hierarchy is visible without claiming that an area size measures the amount or value of knowledge.
- Against the inspected PTI Home synthetic baseline: warm light tones, serif hierarchy, restrained coral identity and the PTI return remain coherent. The room photo and application-card grid are not copied into Atlas.
- Against cycle 1: focus and breadth now coexist; mobile Sources is discoverable; subject jump navigation exists; date/actions no longer collide; error/partial records no longer masquerade as zero or Unassessed; semantic desktop subtitles and upfront legend reduce repetitive metadata.

### Nonblocking limits

- The source-success-mobile capture retains the earlier approval confirmation inside its form after the source is paused. The latest top notice and the record's Paused control state are clear, so this does not block review; clearing the earlier form confirmation after a later source action would remove small temporal ambiguity in future polish.
- This visual review uses clearly labeled synthetic fixtures. It makes no claim that personal production evidence is exhaustive, that a live account is functioning, or that the owner has accepted the design.

### Exact reviewed image hashes

| File | SHA256 |
| --- | --- |
| final-overview-desktop.png | `9e9cf3b86dda0c3a52c19bd58b3939c2ffb5743514abd80f297dab2082d1cf4c` |
| final-overview-mobile.png | `62f4835da3b70f9bea2248b125a490ce1e9f91f5fde18ad3112974340d00d41d` |
| final-subject-desktop.png | `9243d7ecbac5bc8386dff0cc468cbcfb93d307fcc1136d0decc6e676632a67f1` |
| final-subject-mobile.png | `1f3fd57b624c83663f0980ea9e374716a2191d06964d46b89d7f200a0cdf3618` |
| final-linked-mobile.png | `4528bbe612acb0ab7f3082c3326599e7798260c39dc09833e0a494c1212699ab` |
| final-outline-desktop.png | `9473202370fc33dd4320c6ccbe6000b3e8565630eb09b50f7b9e54c94b9b76d4` |
| final-review-desktop.png | `366a0aae48269868b34d2889f503b27cb4a12646a0184fa922b7fdc1cb32e472` |
| final-sources-desktop.png | `b733330ca846c159f4b32ea45602c4ec63a0f1ca9db94ef04630a659f1f01f7f` |
| final-source-success-mobile.png | `edbd4e90f35541163afee7e4946f147beafe8eb5d295d4a3a0763e5c417fc4db` |
| final-long-source-mobile.png | `38e307b2aeda61a5b0829392399ad1418793729f5818fa9b3e717f2b807f778c` |
| final-inspect-mobile.png | `6b66ad827679645923653f4d8a8c3968aaec63357afa39e1827dd1d100cc1081` |
| final-history-mobile.png | `356b29b360f165806045148c5cdc1fe621d6e4915a7d663e1da90dd12dfed3f7` |
| final-error-mobile.png | `e766745f342b07fa03318ad985a8ecd4ada46eecc79d842af10c970356ba7cd1` |
| final-partial-mobile.png | `45248f29fa624ac4909df71d1759a63a37dbd65206733443fab5f9fc7fb90691` |
| final-loading-mobile.png | `e5658ba5ed81ffb9b92b257527a3e9d31206281611c54e60e8f831e2bb77c35f` |
| final-empty-desktop.png | `eeff51c150127be5caa14cd6395dcaa0a79ab54882d84da1b5ac02cc6348efc9` |
| final-empty-search-mobile.png | `e0f6ce5711093cd2d9deabd1d8232b77cf4269083ecfb1670ded237cef03cae1` |

