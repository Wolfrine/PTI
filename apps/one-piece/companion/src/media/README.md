# Managed local media core

This module supplies bounded selected-episode preparation and playback to the companion HTTP API. It is not a network listener, Firebase authorizer, arbitrary proxy, or public Jellyfin instance. It uses Node built-ins only; no additional npm dependency is required.

The explicitly enabled `prepared-mp4` mode adds complete classic MP4 plus persisted original full-English VTT behind the same coordinator. See [prepared production contract and measured evidence](../../../../../docs/one-piece/evidence/jellyfin/PREPARED_CORE.md) for its recipe identity, cache v2 migration, one-at-a-time preparation, owned-tool recovery, exact static resource roles, actual cached-only production gate and remaining acceptance boundaries. The legacy HLS modes below remain available; the new mode is enabled only by runtime configuration after its device/browser gate.

## Dedicated engine and supervision

`dedicatedEngineDescriptor({ binaryDir, runtimeRoot, port })` returns the pinned Jellyfin 12.2 executable, launch arguments, loopback network XML, and managed paths. Defaults use `H:/PTI-OnePiece/runtime/jellyfin` and `127.0.0.1:18097`. `binaryDir` must point to the previously verified official portable bundle containing `jellyfin.exe`, `ffmpeg.exe`, and `ffprobe.exe`; do not download an unpinned latest build during startup.

The runtime owner must perform these steps in order:

1. Create the descriptor directories on H:, including an ACL-protected `private` directory. Save `networkXml` to `networkConfigPath` **before** starting the process. Start the exact executable with the returned arguments, hidden, and retain its verified executable/PID identity.
2. Confirm the process listens only on `127.0.0.1:18097`. Finish Jellyfin's one-time `/Startup/Configuration`, `/Startup/User`, `/Startup/RemoteAccess`, and `/Startup/Complete` setup locally with a random private administrator credential. Keep remote access and automatic port mapping disabled. Authenticate using `/Users/AuthenticateByName` with a standard `Authorization: MediaBrowser ...` client header. Store the returned token only in the private runtime state; never log it or send it to a viewer. Jellyfin 12.2 did not accept the older X-Emby client headers in the pilot.
3. Supply an async `tokenProvider`, the descriptor loopback URL, `managedRoots`, and `extraAccountingRoots: [runtimeRoot]` to `createMediaCoordinator`. Counting the whole data/runtime tree deliberately also counts fonts, metadata, logs, or other engine outputs that do not live in the two purgeable directories. Include any retained pilot/cache trees in accounting until they are deleted. An executable bundle outside the runtime tree is immutable tooling, not a media-cache eviction target.
4. Supply a **real** `onEmergencyStop` that verifies and stops every encoding/subtitle child of this exact engine before resolving. The factory refuses an absent callback. The runtime supervisor also owns process recovery and credential ACLs; the module never installs a Windows service, edits firewall rules, or exposes engine administration.
5. Call `initialize({ hardwareAcceleration: 'nvenc' })` only on a tested compatible GPU; `'none'` remains supported. Initialization checks loopback configuration and 12.2, clears every scheduled task trigger, disables providers/realtime monitoring/images/trickplay/LUFS, and creates one local bounded-cache movie library. Production refuses unrelated libraries. `allowOtherLibrariesForPilot` exists only for the isolated historical comparison harness and must remain false in production.

`/Library/Refresh` is used only to discover a newly cached local file inside this dedicated finite library. An item refresh did not discover new filesystem children in the real 12.2 pilot. Never put catalogue-wide Archive STRMs or remote originals in that library.

## API contract

```js
const media = createMediaCoordinator({
  catalog, cacheRoot: 'H:/PTI-OnePiece/runtime/media',
  managedRoots: descriptor.managedRoots,
  extraAccountingRoots: [descriptor.directories.data, descriptor.directories.cache,
    descriptor.directories.logs],
  jellyfin: { baseUrl: descriptor.baseUrl, tokenProvider,
    ffprobePath: path.join(binaryDir, 'ffprobe.exe') },
  onEmergencyStop: stopVerifiedEngineChildren
});
await media.initialize({ hardwareAcceleration: 'nvenc' });
const playback = await media.openSession({
  sessionId, profileId, episodeNumber, signal, onProgress,
  mode: 'compatible-h264', takeover: false
});
```

The parent must authorize Firebase identity, family membership, profile ownership, origin, and viewing-lease authority before calling this interface. The HTTP API accepts episode/source IDs, never filenames or source URLs. A fourth viewing lease and an implicit same-profile takeover are denied. Modes are an allowlist, not a browser-provided engine profile. `compatible-h264` copies compatible H.264/AAC and converts later HEVC to H.264/AAC; optional `hevc-fmp4` is refused unless the installation explicitly enables it after actual receiver/client proof. Track selection uses inspected language/content metadata, not filename indices or defaults. It rejects ambiguous full-English tracks and filters songs/signs/forced captions.

`cast-h264` is the receiver-specific baseline: forced H.264 with aligned two-second TS HLS segments. It retains the Japanese/full-English track selection, travels with a prepared next context and adoption, and requires bounded selected-track timing inspection. Root's destination layer changes to this mode before Cast admission and restores `compatible-h264` on local handback. Actual receiver acceptance is recorded separately; mode registration is not a claim that hardware has passed. A copied two-second source-1 candidate is preserved in the compatibility evidence but is not enabled for untested GOPs or receivers.

Supply `ffprobePath` from the same pinned bundle. The local-only inspector reads small metadata and at most eight seconds of tail packets per selected video/audio, rejects links/URLs/missing or inconsistent timing, and shares completed probes by cached-file identity. It never performs a whole-file probe to fill missing metadata. Effective presentation duration uses selected tracks, preserving container runtime as a diagnostic. This prevents source 1001's longer unselected English audio from creating an empty Japanese HLS tail. Only the VOD tail/last EXTINF is trimmed before resource authorization; source timestamps and global English cue timing remain intact. Legacy harnesses without this injection retain historical container-duration behavior and do not verify the corrected path.

`openSession` resolves only after the selected original passes size/MD5 verification, inspected Japanese/full-English selection is known, complete WebVTT is returned, and a real first HLS media segment (plus initialization segment when applicable) is available. Progress distinguishes download, verification, inspection, subtitle preparation, and playback preparation. `playback.preparation.firstSegmentMs` records the last warm-up cost. This visible preparation is not counted as an already-warm request. Rendering, audible Japanese, subtitle timing, and TV behavior remain separate acceptance tests.

`prepareEpisode(number, { sessionId })` permits only that lease's current or immediate next episode. Automatic next preparation verifies/downloads the original and extracts full-English WebVTT; it does not start a next-episode HLS encoder. Preparation jobs are shared per source, but each viewer has independent cancellation and pins. Cancelling the last interested viewer aborts a download and removes its partial file. A short shared caption-preparation task may finish after an individual viewer leaves, under its own pin/reservation and finite engine timeout.

For an actual receiver queue, the API explicitly calls `prepareNextPlayback(sessionId, { signal })` after the current episode is ready. This adds a separately pinned/reserved next context and warms its WebVTT and real first HLS segment while current playback remains authoritative. Simultaneous calls share the same queued preparation. The returned descriptor is private to the API ticket layer; `preparedNext(sessionId)` returns it after readiness, while `snapshot.next` exposes only preparation state. Both exact episode graphs can then be ticketed. `switchEpisode` adopts that prepared context and the same master URL rather than starting another job. An optional queue preparation denied for storage leaves the current episode usable. Manual navigation/close discards queued contexts. Three viewers with receiver queues can create six engine contexts, so this load has a distinct acceptance test; three current streams alone do not prove its capacity.

`switchEpisode(sessionId, number)` advances an existing viewing lease to the immediate next episode, including 1000→1001, without consuming another profile/session slot. Arbitrary manual selection must pass `{ explicitSelection: true }`. Episode 590 never silently becomes 591. The previous episode's already-authorized resources remain accessible for 30 seconds to drain receiver buffers; they are then stopped and revoked. `reportProgress` with an explicit old episode number is rejected. The parent must also check its authoritative lease revision and epoch before progress storage.

`getPlaybackResource(sessionId, relativePath, { signal, range })` returns a stream and safe headers, or `manifestText` and a discovered-resource list. Only the exact current/briefly-retained session resource graph is permitted; arbitrary same-engine paths, other items, other subtitle tracks, and other sessions are denied. Engine credentials are stripped from every reference. The parent must use `rewriteManifest` to convert **all** discovered URI references, including `EXT-X-MAP`, `EXT-X-KEY`, and `EXT-X-MEDIA`, to ticket-scoped companion URLs. Do not concatenate a generic engine-prefix proxy. Tickets and CORS are owned by the parent API. Refresh receiver playback tickets without exposing the engine credential.

Call `reportProgress` roughly every five seconds while playing/paused; Jellyfin uses this state for transcoding throttling. When Cast is active the receiver position is authoritative. Call `closeSession` on explicit end/disconnect and `shutdown` on supervisor shutdown. Idle leases are reclaimed after two hours.

## Storage and bounded failure

The default global allowance is 20 GiB with 2 GiB of free-disk headroom. Actual originals, partials, configured subtitles/transcodes, and extra accounting trees are counted once. Original downloads reserve the known remaining size; engine admission reserves a full episode at the constrained 10 Mbps cap plus container/caption allowance. The source adapter must supply an Archive original's exact byte length and MD5; current supported originals have a hard 2 GiB per-file ceiling. Downloads have at most three attempts of 180 seconds each, finite backoff, and bounded Retry-After. The one-off real smoke restricts its new episode download to one attempt.

Active/current/next originals and shared jobs are pinned. Only inactive originals are LRU-evicted. Partial files are discarded after cancellation or failed integrity checks. Atomic metadata supports restart; changed original mtimes trigger a fresh MD5 check. An idle damaged original is removed and automatically prepared again; a file still pinned by another viewer fails explicitly until affected playback ends. External files and links cannot become downloads/proxy targets. `importVerified` is an administrative pilot/migration helper restricted to separately configured import roots and is never a viewer endpoint.

Jellyfin output is controlled by conservative admission reservations, 30-second throttling, old-segment deletion, and a one-second watchdog. This is an application-level bound, not a filesystem quota against a malicious/unbounded external writer. On unexpected pressure the module revokes resources, cancels preparation, calls the required verified-process stop hook, and only then purges safe media extensions from the exact private transcode/subtitle directories. If process cancellation cannot be confirmed, the hook must fail and supervision must stop/recover the engine. Never configure a binary tree, shared server, or user media directory as a purgeable managed root.

## Evidence and verification

The four `test/media-*.test.mjs` suites exercise synthetic tiny fixtures: integrity/truncation/oversize, URL and redirect restrictions, finite retries/cancellation, shared jobs, eviction/admission, disk pressure, profile takeover, track ambiguity, exact resource authorization, HLS URI rewriting, and transitions. They do not prove playback or devices.

`test/media-real.mjs` is explicitly opt-in and operates only on private H: runtime paths. By default it imports the two already MD5-verified pilot originals for episodes 1 and 1001. `PTI_RUN_TRANSITION_1000=1` additionally permits one bounded original download for episode 1000, with automatic prefetch disabled so no episode 1002 is fetched. It records real WebVTT cues, H.264/AAC segment probes, cold preparation versus post-ready request/seek timings, three distinct GPU jobs, storage, and same-lease cross-source transition. Sanitized results are in `docs/one-piece/evidence/jellyfin/production-core.json`. The prior timing that exposed 5.4–5.8-second concurrent cold segment startup is preserved in `production-core-before-first-segment-preparation.json`.

`test/media-real-queue.mjs` is a separate cached-only opt-in. Its downloader always rejects; it can only reuse the MD5-verified originals already present. It records source-1 copy-mode forward/backward seeks and three simultaneous current1000/next1001 queue contexts, real next-episode seeks, and adoption without duplicate contexts. Results are in `production-core-queue.json`.

The real harnesses are headless: they do not establish visual subtitle timing, audible language, color accuracy, real Cast, HDMI, a 60-minute three-stream capacity result, mobile installation, or production authentication/network routing. Those remain end-to-end acceptance gates owned by the parent implementation.

`test/media-cast-compat-real.mjs` is an opt-in cached-only comparison for the exact 1000/1001 originals. It compares segment PTS/keyframes with EXTINF at start, 600s and the complete remaining late tail; binary samples remain on H:. The measured copied three-second seek mismatch, rejected one-second manifest, selected two-second Cast profile, selected-duration correction, and narrower copied two-second candidate are documented in `docs/one-piece/evidence/cast-media-compat/README.md`. No TV is controlled by that harness. The separately named `media-timing.test.mjs` uses explicit fixture metadata and is included by `test/run.mjs` automatically.
