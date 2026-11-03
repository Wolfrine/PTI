# Studio reference picker refinement

Current verdict: **independent critic reviewed; parent integration/QA and owner acceptance pending**. This is an in-place reference-selection refinement of Studio 2.0, not a new visual direction. The inherited Studio record remains agent-reviewed with owner acceptance pending.

Central snapshot: `7bbc11087318cbf52b024d9a8bb633ef047f032f`; loaded Visual Design Director, designer guide and Redesign playbook. Task lane: bounded existing-product refinement. Native roles: parent `/root`, designer `/root/picker_designer`, separate read-only critic `/root/visual_critic`. Parent owns integration, signed-in evidence and separate QA. No inference was run by the designer.

## Job and change contract

Studio is an **Operate** surface. The immediate job is to inspect private source images, choose them in model-input order, and understand the available slots before sending a request. The visual idea is a private working lightbox using Studio's existing materials, with a persistent selection/action edge.

The designer personally inspected the actual current-app empty Studio renders at 1440×900 and 390×844 before edits. Those auth fixtures use synthetic signed-in state and no media. Preserved copies are `.velum-qa/e2e-evidence/before-studio-1440.png` and `before-studio-390.png`. Paired isolated Studio renders also preserve the incumbent open source menu and two-reference composer. The incumbent Drive choice used a browser prompt/name list; a native Google Picker comparison was unavailable and remains **unverified**. No thumbnail-picker baseline was invented.

| Decision | Scope and reason |
| --- | --- |
| Retain | Canvas/composer relationship, rose-black materials, Georgia headings, Create/Creations navigation, PIN behavior and Quick Exit. The closed composer should retain the matched baseline's height and eye path. |
| Refine | Replace name-only reference choice with identifiable thumbnails, a larger focused preview, explicit model order, count/remove/reorder controls, folder/search context and bounded loading/error/retry states. |
| Replace | Only the Drive name-list selection interaction; no Studio composition, brand, authentication or source-storage replacement. |
| Explore | Initial phone preview sizing and optional-pose placement were compared as local alternatives. The small preview and always-visible Pose row were rejected because they weakened inspection and crowded the closed composer. |

First-glance review hypotheses, not measured attention: the reference images should dominate the picker; the folder/search context and selection count should be understood next; Add, Close and Quick Exit should remain discoverable throughout the task.

## Critical dimensions declared before scoring

1. **Studio identity and hierarchy:** protected canvas/mode navigation stays intact; the picker uses Studio's rose-black/Georgia direction without a new brand or dashboard composition.
2. **Selection, preview and order clarity:** thumbnails identify files; a focused preview provides a larger inspection; model order and subject roles are visible; users can reach remove/reorder directly.
3. **Responsive control fit:** desktop and 390px phone controls remain readable and reachable; the dialog body scrolls beneath persistent privacy and Add controls; no modal horizontal overflow.
4. **Truthful private states:** loading, empty, failed and already-attached states differ; slot counts use the verified model cap including an image pose; cancellation/lock discard private picker state; no media or generation success is invented.

## Targeted review record

| Round | Actual evidence and finding | Change and independent verdict |
| --- | --- | --- |
| 1 | Desktop/phone closed composer, open/selected/search picker and empty/loading/error states. Critic: identity 8.3; selection/preview/order 7.4; responsive fit 7.5; truthful/private visible states 7.8; overall 7.7, **hold**. Order controls were below the full grid, sparse-state footer rose, and inline Pose crowded the phone composer. | Added persistent Review order, anchored the footer with a flexible scrolling body, moved Pose into existing Settings with parent agreement, corrected label encoding and added a disclosure chevron. |
| 2 | Matched desktop/phone order and preview states plus restored closed composer. Order/remove/reorder became visible. Critic found the 90×115 phone focused preview smaller than the grid thumbnail. | Replaced that preview treatment with a full-width contained image bounded at 340px; Preview scrolls directly to it while preserving Add and privacy controls. |
| 3 | Critic personally viewed the larger phone preview, sparse states, default-off/selected expanded Settings at both sizes, and matched two-reference composers. | Independent overall visual verdict **8.2/10**, no remaining visible blocker in supplied states. Identity **8.3**, selection/preview/order **8.3**, responsive fit **8.1**, truthful/private visible states **8.2**. Parent visual/integration QA and owner acceptance remain separate. |

A taller composer after references are attached is a deliberate control-fit tradeoff: the new rows expose role, order, and 44px phone controls. The empty closed composer returns to the incumbent composition. Parent must verify scrolling through references to Generate in its integrated flow.

The critic's comparative verdict: canvas/modes/rose-black/Georgia **unchanged**; image recognition/search/order/roles/preview **better**; selected cards **taller** than old compact chips, with parent scroll/Generate QA still required. Direct independent browser interaction was unavailable; the critic judged actual rendered PNGs. The retained report and final image hashes are `.velum-qa/e2e-evidence/critic-final.md`. This limitation does not turn the render review into full flow acceptance.

## Evidence and verification

All new SVG imagery is visibly marked **SYNTHETIC**. These are local UI fixtures with no cloud, private media or inference. They cannot prove Google consent, authenticated Drive thumbnail access, actual pose validity, identity matching, generation quality or successful publication. No production login bypass was added.

Ignored local browser evidence lives under `.velum-qa/e2e-evidence/`:

- `before-composer-*`, `before-sources-*`, `before-references-*` and `after-composer-*`, `after-references-*` use matched isolated Studio content at 1440×900 / 390×844.
- `picker-open-*`, `picker-selected-*`, `picker-preview-*`, `picker-order-*`, `picker-search-*`, `picker-empty-*`, `picker-loading-*`, `picker-error-*` cover the actual new component at both sizes.
- `pose-settings-off-*` and `pose-settings-selected-*` cover the expanded default-off and selected Settings UI at both sizes.
- `picker-checks.json` records the isolated render/behavior run. `picker-evidence-manifest.json` retains source/evidence hashes for this candidate.

Designer personally viewed the incumbent desktop/phone, desktop open picker, phone selection/order/large preview/closed composer, selected phone Settings and default-off desktop Settings. The independent critic inspected the full supplied state set. Evidence is browser viewport coverage, not a physical phone or keyboard claim.

Separate technical checks by the designer:

- `node --test velum-gallery/tests/studio-reference-picker-browser.test.mjs`: **3 passed, 0 skipped** in actual installed Chrome. Covers ordered selection and cap, already-attached IDs, folder/search/recents/pagination, keyboard cancel/focus restoration, retry, late-response abort, repeated choose, Quick Exit cleanup, default-off pose/cap/unresolved gating, original/effective prompts and source-role lineage.
- `node --test velum-gallery/tests/studio-ui.test.mjs`: **7 passed**.
- Module syntax checks and scoped `git diff --check`: passed.
- `.velum-qa/verify-reference-picker.mjs`: actual Chrome at both viewports; eight grouped assertions passed with no page errors. These checks do not raise visual scores.

## API and integration handoff

`createReferencePicker({drive})` returns `{choose, clear}`. `choose({limit, selectedIds=[]})` resolves to ordered file metadata with `id`, `name`, `thumbnailLink`, `folderId`, `folderLabel`, `mimeType`. `limit` is the number of **available new slots**; `selectedIds` are already-attached images and are labelled/excluded. Cancel resolves `[]`. Every request gets an AbortSignal and a response epoch guard. `clear()` closes, aborts, resolves an outstanding choice, clears the DOM and clears in-memory recents. No recent metadata persists to localStorage/sessionStorage. Quick Exit clears first, then dispatches the existing `velum:quick-exit` event.

Drive integration supplies `listReferences({folder,search,cursor,signal})`; the picker never reads originals or owns OAuth. Parent reads selected originals with `readReference(file)` and owns lock/sign-out cleanup, source preparation and generation.

Composer subject rows expose `data-reference-up`, `data-reference-down`, and `data-remove-reference` indexes. Parent owns mutation. Pose controls keep the requested IDs in Settings; `state.poseEnabled`, `poseCategory`, `poseTwoPerson`, `pose`, `poseLoading`, `poseError` render there. Enabled image poses count toward the cap. Missing/loading/failed poses block Generate, as does an enabled pose without a subject. The parent must enforce the same rules during submission.

Details show original prompt, separate effective prompt, actual settings (or clearly requested-only settings), pose instruction/catalog/file identity, and ordered subject/pose source IDs. For comparison images the parent supplies actual source URLs via `state.referencePreviews[sha256]` as a URL or `{url}`. Without one, the renderer exposes `data-source-reference=index` to request a source preview; provided images use `loading="lazy"`. No source image is fabricated.

Remaining work belongs to parent delivery: integrate real Drive reads and preview loading, verify parent Quick Exit/PIN/auth races, exercise subject+pose generation and 10-slot Qwen behavior, inspect the integrated desktop/phone working flow, run required repository/build/deployment checks, and report owner acceptance separately. Rollback remains the pre-edit `main` source revision `60f8a466b078148c5b12cf51da5456d2c6fb7d1c` plus preserved baseline images. This lane makes no commit or deployment.
