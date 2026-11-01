# Historical Creations import integration

Current verdict: **local checks passed; authorized direct-main release**.
Live release and transfer evidence is recorded separately after execution.
Owner scope: automatically show the four existing Phase2 A/B and Phase5 P017 A/B
results in authenticated Studio -> Creations using its existing approved-PC,
private Firestore chunks and verified browser blob transport. No picker,
session-only import, Research view, new route, new inference or automatic Drive
save. The original person reference and P017 are provenance metadata only.

## Patch and record contract

- `tools/velum-worker/historical-import.mjs`: offline preparation of a fixed four-file
  catalog, pinned output/source/pose hashes, manifest and settings checks, escaped
  junction rejection, CPU-only thumbnail callback, and a transport-injected,
  bounded immutable transfer with resume/conflict/approval checks. No production
  client, credential loader, executable upload command or live-worker hook.
- `personal-harness/firestore.rules`: a historical-only addition to the existing
  jobs/chunks/thumbs path. Only the approved pinned anonymous PC may create the
  four cataloged imports. Other users and anonymous reads remain denied. An
  import becomes ready only after its chunks and thumbnail exist. Metadata and
  chunk replacement remain forbidden. Existing explicit owner feedback/save
  receipts accept ready imports. The pre-existing concurrent Research rules
  block was preserved byte-for-byte; no Research capability was connected.
- `velum-gallery/studio-archive.mjs`: distinguish historical records and ready
  output from executable jobs; use recorded F paths rather than inventing H
  originals. Existing Drafts still means completed inference jobs; historical
  imports appear in All/model/date and, after explicit owner actions, existing
  Kept/Saved/Removed filters.
- `velum-gallery/studio.mjs`: reuse existing chunk decoding and cleanup; merge
  newly arriving historical records into an open All feed, refresh at most four
  staged metadata records, and retry thumbnails when an import becomes ready.
  Prompt iteration is unavailable when historical prompt text was not imported.
- `velum-gallery/studio-view.mjs`: reuse the grid/details/canvas, show 2A/2B/5A/5B
  badges, historical transfer wording, recorded provenance, and UNKNOWN quality.
- `velum-gallery/studio.css`: one badge stacking correction (`z-index:1`).
- This design record.

Records live at existing `jobs/history-phase2-a`, `history-phase2-b`,
`history-phase5-a`, `history-phase5-b`, with schemaVersion 4,
`recordType: historical-import`, and `importState: staging | ready`.
They have **no inference status, request expiry, fabricated consent, worker
claim, new generation timestamp or invented prompt**. `createdAt`/`importedAt`
record the first import; `provenance.recordedAt` separately preserves the local
result metadata file mtime, explicitly labeled as file time. This keeps newly
imported history visible near the top without calling it fresh generation.

Phase2 A uses the successful `A-attempt2` output; the failed first attempt is
not imported. Phase2 has no pose target and preserves its historical unresolved
source-role evidence. Phase5's same original is owner-designated person input;
P017 is a standing side-view outline, pose only. A/B normalization differences
are described without asserting improvement. Prompt text remains local;
intent/composed-prompt hashes and allowlisted settings preserve lineage.
Identity, pose, photorealism and winner remain UNKNOWN.

## Local evidence and checks

Real local source: `F:\Workspace\Support\LocalCodexBridge\scratch\velum-eval`.
The four PNGs were SHA-checked against fixed pins and their result/manifests,
fully decoded locally with installed Pillow, and confirmed 512 x 768. Original
and P017 bytes were independently rehashed. Total generated-image size:
1,796,039 bytes; existing transport preparation yields seven chunks and four
bounded JPEG thumbnails. Private bytes/thumbnails were retained only in local
process memory, not copied into source, screenshots, Hosting or cloud storage.

All review artifacts are ignored under `.velum-qa/historical-local/`:

- `check.mjs`, `rules-check.mjs`: disposable preparation and focused local
  smoke scripts; no tracked test suite was added or extended.
- `metadata.json`: local prepared record metadata only; no image/chunk bytes.
- `preparation-evidence.json`, `rules-evidence.json`, `ui-evidence.json`.
- `desktop-grid.png`, `mobile-grid.png`, `mobile-details.png`,
  `mobile-provenance.png`: synthetic assets only, explicitly fixture-labeled.
- `reviewer-desktop-grid.png`, `reviewer-mobile-grid.png`,
  `reviewer-mobile-provenance.png`: independently opened synthetic UI.
- `baseline-firestore.rules`, `historical-rules-only.patch`,
  `baseline-status.txt`, `concurrent-hashes.json`: scope/preservation evidence.
- `emulator-out.log`, `emulator-err.log`, `emulator.pid`, `browser-temp/`:
  local smoke runtime artifacts. No existing live service was restarted.

Checks performed:

1. Existing Studio UI/archive tests: 14 passed; source syntax and scoped
   `git diff --check` passed; Home-contract check passed. No exhaustive suite,
   build, commit or release was attempted.
2. Injected-memory transfer smoke: interruption/resume with new preparation
   timestamps, idempotent retry, conflict rejection, approval revocation.
3. Synthetic-only isolated Firestore emulator smoke on loopback port 18086:
   catalog restriction, approved-device writes, owner reads, other/anonymous
   denial, staging readiness, immutable records/chunks and device revocation.
   No production Firestore access or credential inspection.
4. Actual Chrome fixture: existing index/CSS/controller with local Firebase
   stubs, external requests blocked. Desktop 1440 x 900 and phone 390 x 844;
   four cards, all details, verified synthetic blobs, no extra Studio mode,
   no horizontal overflow or page errors. Late-arriving staged history becomes
   ready in the already open feed, including its thumbnail. Quick Exit and
   sign-out revoke blob URLs and remove private UI state. Zero cloud writes.
5. Independent read-only reviewer (gpt-6.1-sol, xhigh) inspected the patch and
   separately opened the actual synthetic Chrome fixture at both viewport
   sizes. Badge stacking, remaining readiness predicates, retry timestamps and
   staged thumbnail findings were corrected and rerendered. No remaining
   blocker for local preparation. CUA was unavailable; installed Playwright
   and Chrome provided the actual rendered review. Private image pixels were
   never exposed to either reviewer or screenshot tools.

Mechanical integration only: preserve the incumbent Operate surface and its
accepted image-first grid/details layout. Central packaged guidance 0.2.2,
base `fa6fdd1a246b31b7b71a55a9ca5748b70d0dfb4f`. No direction reset, aesthetic
approval, image quality score or human acceptance is claimed.

## Authorized release and live verification

The owner authorized finishing this scoped integration directly on main using the
existing deployment pipeline and approved PC private transport. No additional
generic approval gate applies. Pending unrelated Research/Morsel changes must
remain uncommitted; only this integration's seven-file scope is released.

Required pre-commit PTI checks passed: 107 ChromeHeadless tests and production
build (existing style budget/stylesheet warnings). The existing deployment
pipeline must finish its rules/client checks before transfer. The one-time
adapter invocation reuses the existing import-safe Queue class and installed
DeviceStore/session helpers, with no live worker restart or new inference.
Only the four cataloged images, seven chunks and four thumbnails may transfer;
original/P017 remain provenance metadata. Verify all complete remote records,
reassembled hashes, owner-only rules, and authenticated Creations visibility.
Keep screenshots containing private pixels on this PC, or mask image pixels
before inspecting the rendered layout remotely. Normal Creations must still
work. No owner image-quality acceptance is implied.

The prior local-only checkpoint performed no external writes, uploads, Git
commits/pushes, deployment or live-service restart. The release continuation
records actual results in ignored local release evidence; do not infer live
success from the local checks above.
