# Botanical redesign — current design contract

Current verdict: **agent-reviewed; owner aesthetic review pending**. The previous folded-invitation design is **owner-rejected** for weak visual character and excessive journey burden. Its historical numerical scores do not establish acceptance of this redesign.

Implementation base: PTI main `2fe53ab`; branch `codex/wedding-botanical`. Central plugin `0.1.0`, source `ba1235fe7b220842778414f3f70fca38e7df4c53`. Parent: scope, asset production, functional QA and release. Designer: `wedding_designer`. Independent critic: `wedding_critic`. A randomly selected stronger review is assigned to implementation round **3** (PowerShell Get-Random, range 2–5); actual capability and evidence will be recorded when it runs.

## Owner choices and inspected references

The owner supplied four original JPG boards and selected **Romantic Botanical**, with an **original floral wedding scene**, no depicted real couple or venue. Main now retains the original PNG versions under `design/concepts/`. These are concept art, not wedding facts or a required feature backlog.

- Image 1 / Romantic Botanical: floral canopy, layered foliage, warm light, blush and sage, clear names over quiet reading space. This is the visual direction. Do not copy depicted people, venue, slogans, countdown or ceremony assertions.
- Image 4 / Editorial Ivory: compact celebration timeline followed by clear planning entrances. Borrow this information hierarchy, not a competing visual theme or its invented dates.
- Image 2 / Contemporary Two-Mode: clear guest/family separation and practical summaries. Avoid its dashboard overhead, repeated navigation and speculative metrics.
- Image 3 / Heritage Maroon: event recognition and summary-to-detail affordances. Do not adopt the rejected darker aesthetic, progress ring or invented confirmed statuses.

The parent and independent critic personally viewed all four attached originals in the review turn. Rejected current guest and signed-out pages were freshly rendered at 1440 and 390 CSS pixels; synthetic authenticated home, event list and editor were also rendered and viewed. The four schematics previously available were insufficient references and have been replaced on main by originals.

## Product truth and journeys

Public: Mahima Mishra and Mayank Awasthi; celebrations planned for 18–20 January 2027. Programme, exact moments, venues and contact are not approved. Design a rich, concise save-the-date state now and a coherent later approved-event state. No repeated date/monogram sections, empty modules, fabricated story or public catering transcript. Guest entry remains static and independent of Firebase.

Family: read first, act in context. Home has a compact programme timeline and four clear entrances: Catering, Guests, Stays & Travel, Tasks & Decisions. Family sections use breadcrumbs, deep links and browser Back. Meals are catering services; Carnival remains a food section unless family explicitly establishes a function. Reception remains undated. Decisions have one working location. Show vendor/cost/source/history details only in context; retain underlying records.

Targeted edits preserve untouched fields, revision conflicts, atomic history, membership protections and data ownership. Never reseed or migrate existing wedding records for a visual redesign. Guest entry is short; hospitality and travel are separate focused tasks. Attendance is separate from menu editing and remains per person and occasion.

## Direction and acceptance gates

Direction checkpoint: three genuinely different scene-integrated compositions were rendered at 1440/390 with guest, family home, meal reading and focused menu edit (24 retained images). Parent compared all three guest/home compositions and the working interiors. Independent critic inspected all 24. A, **Garden invitation**, is the chosen implementation basis. Its first phone treatment crossed dense foliage; a revised eight-image pass recomposed the names onto quiet ivory with the scene below, increased working typography, condensed unknown logistics and reduced attendance to a contextual action. Parent viewed the revised phone states; critic independently confirmed the basis credible. This is a direction decision, not final acceptance. Optional owner composition feedback was requested with A recommended; no alternate preference had arrived before proceeding under the approved plan.

First render three materially different Botanical compositions with comparable guest, family home and meal detail/edit content at desktop and phone widths. Compare actual pixels with the originals before selecting a basis. Then complete at least five substantive implementation/review cycles; owner can steer throughout. Viewport-fit tests and build success cannot raise visual scores.

Critical dimensions, declared before scoring:

1. **Botanical invitation identity:** actual coherent floral/scenic artwork, layered but quiet reading space, soft blush/sage/ivory and personal name hierarchy comparable to Image 1. A colour swap on the rejected border layout fails.
2. **Task hierarchy and journey clarity:** home establishes the celebration and clear destinations; useful records precede decorative copy; each edit addresses one task without a broad unrelated form. No duplicate decisions or menu/attendance coupling.
3. **Desktop and mobile craft:** mobile recomposes rather than prolongs the desktop layout; readable contrast, image crops, names, compact records and controls fit at 1440, 390 and 360 CSS pixels.

Required evidence: current sparse invitation and later approved-content fixture; family home; realistic complete catering transcript; focused menu edit; guest basics; stay and travel; tasks/decision; attendance; account; loading/empty/error/offline; actual revocation. Synthetic family examples must be labelled and excluded from production. Review relevant motion/reduced motion, keyboard, Back/deep-link state and draft preservation separately from visual judgment.

Agent acceptance requires independent critic and parent ≥8 on every declared dimension, no known material blocker and separate QA. Record only observed outcomes. Family aesthetic approval remains distinct from implementation authorization.

## Parent checkpoint — round 3

Personally viewed current guest, home, grouped Catering and complete Sangeet at desktop and phone sizes, the focused Reception menu editor, and the explicitly synthetic future-content phone view. Compared these with the original Botanical and compact family prototypes and the rejected live baseline. Scores after the critic's round-3 finding: **8.5 identity / 7.7 hierarchy / 8.1 craft / 7.9 overall**. The original scene and quiet name space establish the selected invitation character; grouped services and focused editing are materially clearer. Hierarchy remains below acceptance: Tasks buries responsibilities and Compare publishes an excessive all-menu transcript. Mobile home and Catering controls can be more compact.

Separate QA through round 3: ten model tests; eleven browser task scenarios; actual emulator two-account collaboration, menu-only hidden-field preservation, rejected stale revision, cancel/reopen recovery, archive/history export, active revocation and sign-out passed. Nine wedding rules tests and thirteen Venture tests passed on the shared emulator. Keyboard testing found the family skip-link/router conflict and failed-attendance presentation; these were repaired and the added regressions passed. QA results did not raise visual scores.

The randomly selected **round-3 stronger pass actually ran with gpt-6-astra / high**. Its [independent report](STRONGER-ROUND3.md) identifies the same hierarchy gaps; it personally viewed retained renders, with live CUA unavailable to that supplemental agent. The primary critic independently drove the running app; the parent drove IAB and the test browser. No claim is made that the stronger pass performed interaction QA.

## Parent checkpoint — round 5 and current candidate

Personally inspected the exact 27 final renders identified by the independent critic, including desktop/phone invitation, home, grouped Catering, full Sangeet/Reception, menu editor and sign-in; phone guest/stay/tasks/attendance/account, validation/offline/loading/unavailable/search/empty states; and actual emulator revocation at both widths. Additional supporting desktop/phone working views were also inspected. The initial final-capture run had a public/private filename collision; it was caught, corrected to unique invitation/guest-detail identities, recaptured, and checked before acceptance. Current capture inventory is 47 unique state/viewport/path combinations. It does not mean all 47 were independently visually scored.

Final parent scores: **8.5 identity / 8.3 hierarchy / 8.2 craft / 8.3 overall**. The floral canopy now frames names in quiet space and recomposes on phone. Home provides four understandable destinations. Day-grouped services, direct responsibilities, selected-pair menus, wide long-value facts and focused editors remove the major journey burden. The historical flat-border hero, repeated summary panels and broad menu editor are replaced. No major visual blocker remains in the reviewed states. Independent critic: **8.2 / 8.1 / 8.1 / 8.1**. These are agent judgments, not measured human perception or family approval.

Separate QA: final TypeScript/Vite build and ten model tests pass; twelve browser task scenarios cover route/deep-link/Back, static no-JS public truth, zero public Firebase requests, 1440/390/360 reflow, keyboard skip, scoped forms, selected menus, direct responsibilities, invalid/offline drafts and failed attendance recovery. Actual Auth/Firestore emulator collaboration, hidden-field preservation, stale-save rejection, cancel/reopen, archive/history export, membership removal and sign-out pass. Revocation clears the open editor, input and stale toast. Nine wedding rules and thirteen Venture tests pass. Production dependency audit reports zero vulnerabilities. Main Angular build passes, with the unrelated existing one-pass/eight-failure missing-provider Karma baseline named in IMPLEMENTATION.md.

Candidate fingerprint **4623ff3e66a198a526ce4a3953241db5d917f9e6aab568bcde89702f6569baf4** binds deployable asset hashes, source and fixture/capture logic. [Build inventory](build-fingerprint.json), [critic inspected set](critic-reviewed.json), and [formal shared acceptance record](../acceptance.json) retain the exact evidence. The Central evidence validator passes; that confirms its declared evidence contract, not aesthetic truth. The 47-state [capture manifest](states.json) is broader QA evidence. Human Google popup sign-in, owner taste approval and final programme/venue facts remain outside the observed acceptance.
