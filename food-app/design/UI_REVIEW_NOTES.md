# Morsel UI review

## Current verdict — reopened on 2026-10-01

The owner has rejected the quality of the current ecosystem designs and requested a corrective audit. Morsel's current visual direction is **reopened**, not owner-accepted. The active implementation is the supper-club direction documented in `README.md`; `SUPPER_CLUB_REVIEW.md` contains historical agent review, not owner approval. Its originality scores (critic 7.9, parent 7.8) must not be hidden by an overall mean above 8.

Next candidate must pass appetite/food identity, recognition and immediate meal-action clarity independently, against rendered comparable food-product references and this rejected baseline. Review authenticated or clearly labelled fixture-backed meal states as well as the signed-out/empty entry. The 2026-10-01 cross-product audit observed only the public Morsel entry; it does not establish authenticated or mobile quality.

All acceptance language below is historical. Do not inherit it as current authority.

## Historical atelier review — superseded; experiential quality later rejected

The living food atelier redesign passed six substantive designer–critic cycles at **8.00/10**, with all six Central dimensions rated 8. The full cycle record is [REDESIGN_REVIEW.md](REDESIGN_REVIEW.md); it supersedes the earlier hero-led visual acceptance below.

Reviewed real-history local renders at 1440×1100, 390×844 and 320×740, plus editing, saved-result continuity, exact discovery, explicit preferences, receipt drafts, source inspection, keyboard and recovery states. The first phone meal action is inside the viewport; saved meals preserve identity and edit the existing session. Only changed food pieces animate. Reduced motion and pause preserve navigation and editing.

Corrected hidden modal save/settings/validation errors, false unsaved toggle state, misleading no-result pagination and focus lost on receipt rerender. Failed writes retain drafts; failed removal retains the memory; retry is visible. Semantic receipt aliases do not repeat as separate directions or bypass exclusions, while original stored IDs and portion distinctions remain intact. Explicitly added sides survive saved-meal editing.

Functional checks: 22 food-model tests and 16 related Personal core checks pass; 18 MCP checks pass. The standalone browser journey passes desktop and both phones, including exact saved edits and preserved notes/focus. Private recovery evidence and fixtures stay outside Git. Angular production build passes; the unchanged scaffold test runner is blocked by Chrome launch restrictions in this execution environment and is not counted as passing. Release verification remains a separate final step.

Accepted limits: name-based sensory heuristics, illustrative family sprites, incomplete menu prices/portions, a long historical journal and restrained motion. No current availability, calibrated affinity or observed user feeling is claimed. The existing Gmail trigger needs a genuine future event to demonstrate a fresh end-to-end delivery; this redesign does not create an autonomous Dot.

Reviewed rendered release a7474bb at 1440×1100, 390×844 and 320×740. Desktop keeps controls and three decisions together. The 390px layout now introduces the first choice in the initial viewport. The smallest layout stacks all controls and decisions without horizontal page overflow. Meal artwork, mood label and caption no longer overlap.

Playwright passed mood selection, recommendation explanations, explicit feedback, receipt details, Taste, Discover and motion control at all three sizes. Six receipt/ranking tests and sixteen MCP tests pass. Follow-up verification waits for finite animations before capturing secondary views and checks navigation while motion is paused. Continuous scene motion pauses independently of view entrance so new views remain visible.

Accepted design: forest table, warm accents, original illustrative pixel food, visible food-mood controls, three explainable directions, quieter receipt and taste views. Data remains private in user-scoped Firestore; public sample screenshots contain fictional receipts only.

Limits: receipt timestamps are not placement times, baskets may be shared, cuisine/flavour labels are name heuristics, and historical basket prices are not current menu prices. Discovery offers ideas and search links, not verified restaurant availability. Gmail event capture is configured separately; a future real event is still required to verify its complete delivery path.

Final receipt review corrected header variants that repeat the restaurant name before delivery copy, and aggregates identical dish lines into quantity while preserving original lines. A dish contributes one order signal per receipt. Live Hosting, owner read access and outsider/unsigned denial were verified at release 7cf9479; subsequent normalization changes rerun the receipt/MCP/live checks without reinstalling browsers when no visual source changes.

## Personal food studio review — 2026-10-01

Rendered the new decision flow at 1440×1100, 390×844 and 320×740. Reviewed actual home, meal editor, receipt and editable Taste renders; exercised Discover, source links and motion pause. Rejected the first expanded mobile setup: the first meal began at y=1011. After condensed typography/context, disclosed cue editing and moving optional cues below the shortlist, it begins at y=725 on 390×844. The smallest layout stacks the craving input and action; all page widths remain bounded.

Accepted the editable table over a chat-first concierge: meal pieces remain editable and changes are visible. Corrected accompaniments mislabeled as contrasts and added editable food-mood-specific preferences so confirmation is visible later. Original pixel art stays illustrative. No rendered private history is bundled or committed.

18 receipt/model tests cover cue negation, ambiguous notes, shared consumption, contextual dislikes, feedback-driven ranking, same-restaurant pairing, unknown/stale prices, temporary rejection, swaps and conservative receipt matching. 18 MCP tests include deployable food tools: explicit feedback validation, pause, deduplication, transactional reconciliation and menu provenance. Related Personal model checks and Angular production build pass. The unchanged PTI Angular scaffold suite runs with the headless-shell browser, but 8 of its 9 tests fail because Auth/Firestore mocks are missing; it is not counted as passing. No Angular source changed in this release.

The complete studio browser journey passes at all three sizes with fictional menus and no cloud writes. A private local fixture of the existing 93 orders also yields three coherent directions and bounded phone width; the fixture lives outside the repository. Release verification checks owner writes and outsider/unsigned denial for the four new editable collections, rejects unapproved schemas/client receipt and research writes, and deletes all temporary records.

Limits: deterministic food-word/name rules are inspectable heuristics, not semantic LLM understanding or measured nutrition. Menu prices and portions are incomplete; no calibrated percentages or delivery promises. The Gmail trigger remains existing infrastructure; a future genuine receipt is needed to observe the live event delivery path. Optional cues are on-open assistance, not a newly scheduled autonomous Dot.
