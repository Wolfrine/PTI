# Merged PTI home launcher: independent integration QA

**Scoped result: passed.** The exact merged `NewHomeComponent` renders on desktop and mobile. One Piece launches by full document navigation with `/one-piece/?ngsw-bypass=true`; native Ctrl-click and middle-click preserve that href. This is a fixture result, not a deployed authentication, PWA, or media acceptance.

Source: implementation HEAD `27d48d61618d39b7d61e167d7be7709bd9b25052` with upstream `203f81a42db943a6be8c199d9dafdb44a3639d0a` being merged. `source-binding.json` records raw checkout, upstream Git-object, and normalized-LF hashes. Six of seven inspected files preserve upstream content; the only functional delta is TypeScript adding the canonical One Piece app, `documentNavigation`, its full document dispatch branch, and removing the superseded workbench placeholder. `upstream-integration.patch` is the complete inspected delta.

The rendered TypeScript SHA-256 is `432487f0ae525db035222dae90231d0e77ccb9175c17d7faf4ae2c9c2c0d24e8` (normalized LF: `e2ac538f4eba6cd5fb70a91d81d6f2f8d3a500f6b3a136fa0cdbc7ab30881836`). No production source was edited in this QA lane.

## Evidence

- `captures.json`: seven SHA-bound PNG/AX pairs. Desktop 1440 × 1000; mobile-sized 390 × 844. Screenshots were actually viewed by the independent reviewer.
- `browser-observations.json`: no horizontal overflow or broken images in the measured states; external home CSS applied with 133 observed rules. No warning/error console messages observed at the desktop and mobile checkpoints.
- `document-requests.json`: five actual document GETs with `Sec-Fetch-Dest: document`, `Sec-Fetch-Mode: navigate`, and the exact query-preserving destination. Three plain launches cover desktop directory, mobile pinned card, and mobile recent card. Two modified launches cover Ctrl-click and middle-click native new tabs.
- `click-events.json`: actual click/default-prevention observations. Ctrl and middle click remain unprevented. Plain One Piece clicks are intercepted by the production handler, then result in real document requests. No One Piece route reached the mock Router.
- `integration-verdict.json`: separate visual and functional verdicts, compilation timing, stable source checks, asset hashes, cleanup, and limitations.

The CSS returned HTTP 200 from the fixture and matched both the production source and root's newly built complete artifact at `pti-app/dist/pti-app/browser/assets/styles/pti-home.css`: `4ed79bedb600eead53d11f5e245b6d13946107363b643cf5aa36fbb2f784f95c`. The production index retains `/assets/styles/pti-home.css`. This addresses the absolute-path critical-inlining warning at the artifact level; live Hosting remains a separate check.

## Visual judgment

The existing upstream composition, typography, artwork, spacing, and responsive navigation are preserved. One Piece fits the directory card, filtered search result, recent card, and seven-item pinned grid without visible label clipping or horizontal overflow. The Personal category contains four apps including One Piece. Removing the workbench placeholder avoids a contradictory second destination.

This was a deterministic integration into the current upstream direction. It does not create a new direction, renew a design acceptance, or establish owner acceptance. The upstream `pti-app/design/home-direction-2026-10-18.md` itself distinguishes its prototype selection from a formal implementation acceptance.

## Reproduction and boundaries

`harness-setup.mjs`, `harness-bootstrap.ts`, `harness.angular.json`, and `harness-server.mjs` describe the dev-only isolated H-drive fixture. It copies the exact component, template, style, and assets; reuses the existing Angular dependencies via a junction; supplies only a Router mock; removes Google sign-in and the PWA manifest from its own temporary index. Nothing adds an authentication bypass to production.

Fixture build: `H:/PTI-OnePiece/tools/node/node.exe H:/PTI-OnePiece/pti-angular-dependencies/node_modules/@angular/cli/bin/ng.js build home-qa`, from `H:/PTI-OnePiece/home-integration-qa`. Actual compile: 12:58:57.510–12:59:17.670 UTC on 2026-10-18; Angular generation 16.963 seconds; exit 0; exec session 86848. Root was notified so the concurrent capacity test can retain that CPU-load overlap. Chrome browser surface 3 was used; the installed Chrome executable reported version 155.0.8059.80.

One early automation action batched a category click immediately after a smooth scroll and activated Dashboard. The trace is retained. A fresh snapshot followed by the settled Personal-category click passed. The early action is neither counted as a category pass nor established as a production defect.

No real Firebase sign-in, physical Android, installed PWA, root service-worker upgrade, deployed route, video, Cast, or television was tested here. Meta/Shift behavior was inspected in source rather than physically exercised. The navigation target was a labelled proof page, not the One Piece application. All three reviewer-created tabs were closed and the viewport override reset; the existing live PTI worker tabs, engine, GPU, TV, and media were untouched.
