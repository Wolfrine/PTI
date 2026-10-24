# Prepared runtime cache handoff — proposal, not execution

18 October 2026. The release reviewer inspected setup, configuration, package/activation, server wiring and cache persistence offline. No private runtime configuration was inspected or changed, and no cache was moved, packaged, activated or started in this lane. The duration/TV owners must finish and stop before any administrative relocation. The media worker independently confirmed the portability conditions below.

## Configuration and package result

`createNewRuntimeConfig()` explicitly selects `prepared-mp4` only in setup's new-configuration branch. The existing-configuration branch still returns its validated saved configuration. An omitted mode remains `compatible-h264`; the current household therefore needs a deliberate parent-owned mode change. The server wires that selection to coordinator default/verified modes, prepared engine support and the pinned FFmpeg/FFprobe paths. It includes configured accounting roots in addition to mandatory engine, production and pilot roots.

The package selector recursively includes committed `companion/src/**` and `scripts/**`, package metadata and the catalogue; this covers `prepared.mjs`, `prepared-processes.mjs`, `static-resource.mjs` and `timing.mjs`. Dirty/untracked selected source prevents packaging. The release contains code plus the pinned `jose` dependency, not media, private configuration or external executables. Verify stable H Node, the existing pinned Jellyfin/FFmpeg/FFprobe and Caddy binaries, Python, household CA storage and exact finite engine roots before claiming runtime independence from the worktree. No actual package was produced by this review.

## Proposed stopped whole-cache relocation

The intended final cache root is `H:\PTI-OnePiece\runtime\media`. Select the actual accepted production cache after the duration and TV gates; the earlier two-episode production handoff is historical evidence, not proof that a particular current tree contains all three required prepared episodes.

1. **Finish and release every owner.** Obtain the duration/TV owners' clean-stop results. Stop the managed task/launcher/supervisor and the specifically owned isolated engine/harnesses. Prove no associated tools, file writers, playback contexts, queued preparation, in-memory jobs, reservations or pins remain. A closed managed18097 alone does not establish that isolated18107 is stopped. Do not use global encoder termination or PID-only cleanup.
2. **Validate literal paths before a move.** Record the exact absolute source, target and optional old-target backup paths. They must be on H: inside `H:\PTI-OnePiece`, distinct and non-nested where a rename would invalidate another target. Resolve and inspect every existing ancestor and the complete tree for junctions, symlinks/reparse points or unexpected files; refuse any ambiguity. Preserve public evidence and protected configuration snapshots separately from media. Do not move identity, credentials, progress or engine databases with the cache.
3. **Require an idle on-disk tree.** `cache.json.tmp` must be absent. Require no `originals/**/*.part-*`; no staged or incomplete rendition pair; no `prepared-work/*.{progressive,video,captions}.part` or `.part.mp4`; and an empty `prepared-work/ownership` directory, including no `.tool.json` or `.tmp` intents. Empty directories may remain. Unknown scratch files block relocation. An ownership record embeds the original absolute stage path: recover it at that original path with exact process identity before considering a move. Never relocate a pending record and then pretend it refers to the new root.
4. **Capture a read-only inventory before initialization.** Preserve `cache.json` and all complete `originals`/`renditions` files, sizes, hashes and mtimes. Initialization can prune incomplete/untrusted entries, so inspect and retain the pre-initialization evidence first. For episodes1/1000/1001 record the canonical candidate, catalogue bytes/MD5, original retained/absent state, recipe, computed rendition ID, exact `video.mp4` and `video.en.vtt` bytes/SHA256, VTT cue count/timing identity and inspected Japanese/full-English track lineage. Require three complete accepted prepared pairs. Verify every retained original against its candidate. An intentionally evicted original is allowed only when clearly recorded and its prepared pair validates; three prepared pairs do not inherently require three originals. If the owner wants all three originals retained, use the existing verified local import from an already cached original under the same quota before handoff. Do not redownload, fabricate an original record or hand-merge selected manifest entries.
5. **Preflight the entire storage budget.** Count source and target caches, engine data/cache/logs/transcodes/subtitles, production probes, retained pilot material and the proposed old-target backup exactly once after canonical-root deduplication. Require projected usage at most21,474,836,480bytes and at least2,147,483,648bytes free after reservations. Existing nonempty `runtime\media` may be retained at a deliberately chosen sibling such as `runtime\media-legacy-<timestamp>` only after that exact root is added to `cacheAccountingRoots`. Same-volume directory rename avoids another video copy; a backup still consumes and must count its existing bytes. Keep the source-parent accounting root even when the source leaf has moved.
6. **Move the validated whole tree only.** After the release coordinator verifies the concrete inventory and stopped-state proof under the owner's existing implementation/setup authorization, rename the old target if required, then rename the complete selected source cache to the stable target on the same H volume. No further end-user approval is required for this already authorized administrative work. Preserve `cache.json`, complete originals/rendition pairs and mtimes. No selected-record copy, manifest surgery, live move or temporary second media tree. Save the exact before/after root mapping and rollback order.
7. **Verify before serving.** Repeat the inventory/hash/byte/mtime checks at the new root. `MediaCache.persist()` omits original `entry.path` and rendition `paths`; initialization reconstructs them from the configured canonical root. Recipe/presentation diagnostics do not grant a portable engine resource: configure the final exact original/rendition roots, then bind finite engine items afresh. Existing unrelated virtual-folder roots must fail closed, not trigger a broad library scan. Revalidate the three expected prepared pairs without source download; record any absent original honestly. Stop on unexplained missing files, recipe/version/track-lineage mismatch, altered caption timing or budget excess.
8. **Select and release deliberately.** The parent updates only the protected mode/accounting/root fields needed for this migration, preserving identity/progress and external tool bindings. Obtain a new hardened stop proof after all configuration edits; its saved configuration hash must match activation. Commit/package/verify the reviewed source, activate/start later and test prepared warm playback, range/HEAD/subtitles, progress and exact final engine bindings. Those are future live gates, not outcomes of this document.

Original catalogue identities to reconcile in the migration inventory:

| Episode | Candidate ID | Original bytes | Original MD5 |
|---|---|---:|---|
|1|`archive-5e522487ae563a852646`|357,167,311|`f22a5ae5381eb2f541f07de768a7ad89`|
|1000|`archive-1e32a8bb848fcfc16cb9`|742,925,306|`ebeeadb99c7c1f27ba1f90aade7ccce1`|
|1001|`archive-4e9255b8a504eb2e61c6`|844,716,819|`2610511c93fae62d4791e8284b6b96eb`|

These are catalogue identities, not a new hash verification of current H files. [The actual two-episode core evidence](../cast-media-compat/prepared-production-2026-10-18T12-10-13-858Z-ee58d2.json) contains1000/1001 recipe/video/caption hashes and233/328 cues. It intentionally removed an original for a restart test. Capture the final episode1 recipe and all three current prepared records in the actual migration evidence; do not substitute historical values for uninspected current files.

## First-release rollback limits

No accepted One Piece runtime/deployed app exists at this checkpoint. Two real retained H packages now exist: A=`27d48d61618d39b7d61e167d7be7709bd9b25052` and B=`6e5e18ec431038a8922e251469180942a8a917a8`. [The actual package comparison](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/evidence/runtime/same-payload-package-pair.json) records 132 files and 2,355,387 bytes each, every file hash equal, independently verified from the packaged module, neither activated and no rollback executed. Retain their exact manifests, tool/configuration provenance and cache-root mapping. A→B→A can exercise stopped activation, launcher and configuration switching, provided each activation has a fresh matching stop proof. Label it **same-payload operational rollback**, with no claim that it recovers from a changed-code regression. The first accepted payload becomes a meaningful retained baseline for a future different payload.

Keep the old target cache accounted until the release is accepted and the owner authorizes cleanup. Rollback must use a compatible retained code/configuration/cache mapping; activating an old code SHA alone does not reverse an administrative cache rename. Do not blindly restore a configuration that points to a now-moved cache.

For website rollback, capture the exact current complete PTI Hosting predecessor immediately before publishing. [The later read-only preflight](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/evidence/release-preflight-after-home.json),13:02UTC, records version `f9215f5f228de12a` / release `1792327537880000`; it supersedes the older October15 predecessor and must still be refreshed before release. Restore only the complete Hosting artifact with its PTI/sibling assets and routing. Preserve the new Firestore `onePieceData` exclusion/private namespace rules and their permission checks; never run an old full deployment workflow that restores the legacy permissive rules. Returning to a predecessor without One Piece may deliberately remove this feature while preserving PTI. Verify live assets, root/child worker migration and sibling routes after rollback. No Hosting or runtime rollback was executed here.

## Offline verification

`H:/PTI-OnePiece/tools/node/node.exe --test apps/one-piece/companion/test/runtime-config.test.mjs apps/one-piece/companion/test/runtime-release.test.mjs`: **9/9 passed**, zero skipped. `node --check apps/one-piece/companion/src/runtime/setup.mjs` passed. These are synthetic configuration/tree/stop-proof fixtures, not an installation, migration or H package test. The parent separately reports the complete current companion suite **194/194 passed**, including this setup change; this reviewer did not repeat that full run. Real duration, TV, Google pairing, physical devices and final release acceptance remain separate gates.

## One-time administrative tool — prepared offline, not run

Projectless `work/migrate-prepared-cache.mjs` implements the checklist for this installation only. Its default invocation prints a guarded skip without reading media or configuration. The release coordinator must independently review it before use; neither explicit operational mode has been run by the author. Syntax/default-skip and22 pure option/path/freshness assertions passed. Those checks did not inspect H media/configuration or call native process inspection.

After all duration/TV owners finish, disable the exact managed scheduled task, obtain the fresh hardened managed stop proof and retain the final matching isolated-engine cleanup report. The tool requires task `Disabled` or `Absent`, current config-matching managed proof at most five minutes old, isolated cleanup at most ten minutes old with matching handoff port, and fresh native absence checks for the owned processes/listeners. It performs Windows ancestor and recursive reparse checks, bounded regular-file inventories, all retained-original MD5, prepared recipe/metadata/faststart/caption-lineage checks and SHA256/size/mtime comparisons. Full-file hashing is intentionally deferred to the authorized actual handoff.

From the projectless directory, the two explicit phases are:

```powershell
# HANDOFF and FINAL_CLEANUP are the actual verified handoff/report paths.
H:/PTI-OnePiece/tools/node/node.exe work/migrate-prepared-cache.mjs --verify-idle --handoff HANDOFF --isolated-proof FINAL_CLEANUP
# SNAPSHOT is the exact H-private path returned by the verified-idle phase.
H:/PTI-OnePiece/tools/node/node.exe work/migrate-prepared-cache.mjs --relocate --snapshot SNAPSHOT
```

`--verify-idle` hashes the source/old target but changes no media/configuration; it creates an ACL-protected H-private snapshot plus exact pre-change config bytes and SDDL under `runtime\private\cache-migration`. `--relocate` binds the handoff/report/verifier/configuration and snapshot freshness, repeats inventory/idle checks, journals every intended/completed rename with flushed private files, renames whole directories on H, verifies source/backup bytes and mtimes, then changes only `playback` and `cacheAccountingRoots`. Full `H:\PTI-OnePiece\pilot\jellyfin`, production and runtime roots plus the retained old-target backup are counted; more than ten configured roots fails closed. No media is downloaded and no engine/library scan starts.

On failure, leave the task disabled and inspect the exact private `relocation.json` stage and root mapping. No automatic cleanup, rollback, unknown-file deletion, task enable or startup occurs. After success the old stop proof is invalid because configuration changed: obtain a new proof, activate the reviewed H release, then explicitly enable/start the managed task and run final acceptance. The tool's helper paths are bound to H packageB in its snapshot; it is an owner-run one-time admin tool, not a new production runtime dependency. Reviewed tool SHA256: `6f25c0659df3f6e6bdc450a3cb0efa90b54b84033b5da1ef375063295d26eaac`; any revision requires fresh source review and snapshot binding. The narrowed guard leaves unrelated legacy18096 alone and checks owned source/target/engine roots, recorded PIDs and managed/test ports; it never globally kills or vetoes every process using the pinned executables.

[The real H-volume rename canary](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/evidence/runtime/migration-rename-canary.json), 31 bytes, passed at 13:27 UTC with exact file/directory mtimes preserved and no real media accessed. It supports the relocation mechanism; it does not establish the actual media tree's integrity or constitute a real migration.

## Exact post-gate operator sequence — not executed by this review

Use these commands only after the real hour and final production Sony test pass and all owners have stopped. `FINAL_CLEANUP` must be the actual recent report with matching `completedAt`, `engine.port`, `engine.cleanup.proof` and `cleanup.coordinatorClosed`; a historical or differently shaped report is not a substitute. Set `SNAPSHOT` to the exact H-private filename returned by verification, not a guessed path. Existing approval covers this administration.

```powershell
$onePieceNode = 'H:\PTI-OnePiece\tools\node\node.exe'
$onePieceCode = 'H:\PTI-OnePiece\releases\6e5e18ec431038a8922e251469180942a8a917a8'
$onePiecePwsh = 'C:\Users\Sachit Tewary\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe'
$onePieceOps = 'C:\Users\Sachit Tewary\Documents\Codex\2026-10-18\build-a-personal-one-piece-streaming\work\migrate-prepared-cache.mjs'
$onePieceHandoff = 'F:\Workspace\Worktrees\PTI\one-piece-family\docs\one-piece\evidence\cast-media-compat\prepared-production-handoff.json'
Disable-ScheduledTask -TaskName 'PTI-OnePiece-Companion' -TaskPath '\'
& $onePiecePwsh -NoLogo -NoProfile -NonInteractive -File "$onePieceCode\apps\one-piece\companion\scripts\stop-runtime.ps1"
& $onePieceNode $onePieceOps --verify-idle --handoff $onePieceHandoff --isolated-proof FINAL_CLEANUP
# Renew the stop proof here if necessary, while the unchanged config is still stopped.
& $onePieceNode $onePieceOps --relocate --snapshot SNAPSHOT
# Configuration changed: a new proof is mandatory before activation.
& $onePiecePwsh -NoLogo -NoProfile -NonInteractive -File "$onePieceCode\apps\one-piece\companion\scripts\stop-runtime.ps1"
& $onePieceNode "$onePieceCode\apps\one-piece\companion\scripts\activate-release.mjs" --commit 6e5e18ec431038a8922e251469180942a8a917a8
Enable-ScheduledTask -TaskName 'PTI-OnePiece-Companion' -TaskPath '\'
Start-ScheduledTask -TaskName 'PTI-OnePiece-Companion' -TaskPath '\'
# Repeat this health check until status is online, with a 60-second startup bound.
Invoke-RestMethod -Uri 'https://onepiece.local:8443/api/health' -Headers @{Origin='https://pti-app-2ab59.web.app'} -TimeoutSec 5
& $onePieceNode "$onePieceCode\apps\one-piece\companion\scripts\verify-runtime.mjs"
```

Check each command's success before the next; do not paste the block as an unconditional batch. If migration/activation fails, leave the task disabled and use its private stage journal. To exercise a same-payload rollback after a healthy B start, disable and stop again, run the same activation command with `27d48d61618d39b7d61e167d7be7709bd9b25052`, enable/start and verify. Returning to B repeats that full stop/proof/activate/start/verify sequence. Do not repeat `package-release.mjs` for A/B: their retained directories already exist and packaging correctly refuses overwrite. If runtime source changes, package a new clean HEAD and review its actual manifest rather than relabel these packages.

For website release, mark the reviewed PR ready and merge its verified final head through the existing GitHub integration. `.github/workflows/firebase-deploy.yml` triggers on a push to `main`; it has no `workflow_dispatch`, so `gh workflow run` is not the release route. Its default `deploy` job waits for `verify_venture` and `verify_one_piece`, builds complete Angular+legacy food+One Piece assets, applies guarded shared rules, then executes `firebase deploy --project "$FIREBASE_PROJECT_ID" --only hosting:default --non-interactive`. Use that existing deployment identity; do not publish only the child directory. Existing Velum/Luminary/SEFPO/Venture jobs and optional MCP deployment also run under this workflow and need their own outcome accounting; they are not new One Piece implementations. A green overall/skipped-credential step alone is insufficient: record the actual default Hosting release/version and verify live assets, new/old PTI-worker paths and sibling routes.

For a necessary Hosting-only rollback, after confirming the freshly captured predecessor is still the correct one:

```text
firebase hosting:clone "pti-app-2ab59:@RETAINED_VERSION_ID" "pti-app-2ab59:live" --project pti-app-2ab59
```

Replace `RETAINED_VERSION_ID` with that real recorded version; this command immediately publishes it to the default site. It leaves Firestore rules untouched, as required. The version-clone syntax was checked against [Firebase's current primary documentation](https://firebase.google.com/docs/hosting/manage-hosting-resources#cli-commands-for-version-cloning). Do not rerun an old full workflow to restore an old site.

After the live app and H runtime are healthy, the owner must complete Google setup interactively. In a real local terminal, run `H:\PTI-OnePiece\tools\node\node.exe H:\PTI-OnePiece\releases\6e5e18ec431038a8922e251469180942a8a917a8\apps\one-piece\companion\scripts\show-local-setup.mjs`; the one-use code must stay in that terminal and must not enter automation evidence. Follow **Confirm owner account → Create family library**, save invitations, and have each invited viewer use **Accept invitation** and **Confirm with Google**. Real Google pairing/invitations, Android trust/PWA/playback, HDMI sound/picture, phone sleep/reconnection and reboot/logon remain unverified until those actual actions are observed.
