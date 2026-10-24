# Complete prepared playback: production media core

This is an explicit opt-in extension of the existing companion media/cache model. It does not enable a new default, replace the Firebase/ticket layer, expose Jellyfin, or declare browser/mobile/family acceptance. The older HLS results and failures remain preserved.

## Why this path was implemented

The actual Sony could play and transition with the aligned two-second HLS profile, but its measured warm seeks still included5.758s and6.545s recoveries. Complete classical MP4 plus the original full-English WebVTT passed the separate Sony prototype: seven advancing seeks699–2247ms, natural1000→1001, selected Japanese end without the extra English-audio tail, and ticket-revoking return. A ready file loaded on an already active receiver in1.296s; cold receiver launch took7.688s. These measurements support a prepared path; they do not establish universal startup within five seconds.

The prior feasibility evidence lives in `../cast-media-compat/PREPARED_MP4_RESULTS.md`, the dated `prepared-mp4-*.json` files and the actual receiver records maintained by the hardware owner. Those runs used a narrow prototype binding. The new `prepared-production-*.json` records identify the production coordinator/cache/Jellyfin/static-resource path separately.

## Integration contract

```js
const media = createMediaCoordinator({
  catalog, cacheRoot, managedRoots: descriptor.managedRoots,
  extraAccountingRoots: retainedMediaAndEngineTrees,
  importRoots: explicitlyApprovedOriginalImportRoots,
  defaultMode: 'prepared-mp4',
  verifiedModes: ['compatible-h264', 'cast-h264', 'prepared-mp4'],
  jellyfin: {
    baseUrl: descriptor.baseUrl, tokenProvider,
    preparedEnabled: true, ffmpegPath, ffprobePath
  },
  onEmergencyStop: stopVerifiedPrivateEngineJobs
});
```

The factory derives `cacheRoot/renditions` and `cacheRoot/prepared-work`; there is no viewer-supplied path or separate prepared-root configuration. The runtime owner protects the cache/engine trees and supplies the pinned12.2/8.1.3 tools. `initialize` verifies/recovers old owned local-tool processes before deleting exact unpublished stages. It then configures a dedicated loopback engine containing only the two finite cache roots, disables scheduled/provider/image/trickplay work, and verifies the effective library paths/provider options by readback. Historical remote STRM libraries are refused in this mode.

The existing `openSession`, `prepareNextPlayback`, `switchEpisode`, `reportProgress`, `closeSession` and `shutdown` interfaces remain. An absent mode uses the configured default; existing legacy installations still default to `compatible-h264`. Prepared mode persists through Cast/local destination handoff. The descriptor supplies `contentType: 'video/mp4'`, original track choices, effective duration and the two exact resource roles. `getPlaybackResource(sessionId, relative, {method, range, signal})` delegates the complete video to `static-resource.mjs`. Only the exact bound MP4 and full-English VTT are admitted. The root API owns identity, repeated authorization, scoped tickets, downstream abort and browser/Cast delivery.

## Preparation and persisted truth

- The original must pass the existing Archive size/MD5 admission. Inspected selected video/audio timing controls duration; original container duration remains diagnostic. Japanese/full-English selection is based on metadata and content labels.
- The recipe identifies original checksum/bytes, original audio/subtitle indices and languages, video capability inspection, caption-track fingerprint and a versioned pipeline. Only inspected H.2648bit≤1080p/level4.1 requests video copy. Unsupported HEVC10bit requests H.2648bit conversion. Selected compatible AAC can be copied.
- Jellyfin negotiates and produces the private complete progressive MP4. If fragmented or indexed at the tail, the bundled FFmpeg performs only `-c copy -movflags +faststart` finalization. Complete front index, two selected H.264/AAC streams, language, timestamps, duration and local start/middle/end decode checkpoints must pass before publication.
- The full-English VTT extracted from the inspected original is persisted beside `video.mp4` as `video.en.vtt`. On import, the actual served VTT must match its SHA256 or `vtt-dialogue-and-millisecond-timing-v1` canonical cue identity. Cue IDs/transport formatting may differ; dialogue/timing may not. Genuine blank outro cues are represented; an entirely blank track is refused.
- UI track indices remain original indices. Derived Japanese/English indices are inspected independently and stay internal. Turning subtitles off does not prepare another video.
- Publication uses unique scratch files, final regular files, SHA256/size/mtime records and an atomic v2 manifest. v1 original entries remain readable. A restart removes only exact unpublished owned outputs. A valid persisted rendition can reopen without its evicted original or another encoder. A shared active damaged file is refused until its other owners leave.

Finite movie-library refresh discovers a newly published local pair; no whole-catalogue media work is performed. Exact-file update discovery in the earlier12.2 experiment waited61.810s under the60s monitor delay. Production therefore retains the pre-existing dedicated finite-cache scan model. Library item-refresh alone did not discover new children. No broader remote scan policy is implied.

## Cache and process bounds

The20GiB accounting includes originals, retained pilot trees, engine output, captions, raw progressive parts and final faststart files. Every preparation admits a conservative three-copy maximum before starting. Existing HLS/download reservations remain accounted. Only one prepared conversion/finalization job runs at a time; identical source/track/recipe consumers share it. One cancelled viewer leaves other consumers intact; the last cancellation stops the job. Current/next originals and renditions remain pinned. Inactive renditions and originals are evicted by LRU; optional next preparation may wait for space while current playback continues.

The prepared-tool registry writes an intent before spawn and a PID after spawn. Restart recovery requires the pinned executable, exact UUID stage path/token, parent PID, creation window, current Windows SID and a dead original owner; it rechecks identity immediately before bounded termination. A still-live owner or wrong identity fails closed. Tests use actual Windows CIM inspection with benign Node canaries, including hard-kill before the PID write; these are process-safety tests, not actual FFmpeg hard-kill/PC-reboot acceptance. Runtime emergency cancellation still owns Jellyfin children. Failed cancellation must not release output reservations before the runtime has confirmed its owned engine work is stopped.

The cap is application admission/watchdog protection, not a filesystem quota against an unbounded unrelated external writer. No incomplete prepared video is returned as ready. Preparation can take minutes when an original is absent; this accepted preparation latency is reported separately from warm playback/seek.

## Verification status

The portable default test runner automatically discovers both new prepared suites. It excludes explicitly opt-in real-media harnesses. After the independent lifecycle fixes and revised bounded header admission, the current complete run passed194/194 with zero skips; output is saved as [../cast-media-compat/prepared-production-final-tests.txt](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/evidence/cast-media-compat/prepared-production-final-tests.txt). Fixtures explicitly use fake video atoms/bytes and test lineage, metadata rejection, faststart/decode gates, sharing/cancellation, serialization, quota/LRU, links, restart reuse, exact derived resource roles, cross-source adoption and ownership recovery. They are not rendering evidence. `prepared-production-hygiene.json` records156 inspected owned source/test/evidence files, zero exact matches against the current production-token/admin-password/legacy-token values, and12 current media source/document SHA256 hashes. This is a bounded exact-value check, not a general security audit.

The production cached-only gate uses a fresh loopback18107 instance, the real production media modules and rejecting Archive downloader. Its first failed preflight preceded engine launch because the new cache directory did not yet exist. The next run withheld readiness on FFmpeg's rejection of `-t .25`; the corrected duration is `0.25`. Another run exposed two legitimate blank outro subtitle cues in real1000, leading to the canonical-cue correction above. All failures are retained in dated evidence.

`../cast-media-compat/prepared-production-2026-10-18T12-10-13-858Z-ee58d2.json` passed the actual new production path. These timings were observed while the root also built Angular; they are not an idle-PC baseline.

| Production-module measurement |1000|1001|
|---|---:|---:|
| Complete MP4 bytes |737,980,951|1,323,099,843|
| Private preparation/finalization/checkpoint time |23.803s|51.991s|
| Policy actually admitted |Compatible H.264 copy|HEVC10→H.2648bit|
| Effective selected duration |1430.790s|1419.040s|
| Served full-English cue count |233|328|
| Actual HTTP start/600s/end decode |190/261/197ms|260/576/700ms|

Both actual MP4s passed HEAD200 and four byte-exact64KiB206 requests at the front, middle, tail and suffix. All six bounded64MiB HTTP seek probes decoded video/audio with exit0. The actual served VTT passed original-track lineage. Two concurrent1000 preparation consumers shared one job; cancelling one retained the other. Queued1001 adoption reused the same context without another preparation. A persisted1000 restarted with its original deliberately absent and with zero download/preparation calls. Admission accounting was instrumented on every cache usage calculation: peak17,071,513,219 bytes, below21,474,836,480; final pre-shutdown footprint9,742,604,554 bytes. The fresh engine shut down normally with exit0, and an immediate OS check found no FFmpeg/ffprobe children. No actual Firebase actor, browser render, audible Japanese or visually observed subtitles was exercised by this headless gate.

`prepared-production-handoff.json` is a sanitized descriptor for the stopped18107 instance and complete persisted cache. Its protected private resume config stores only DPAPI paths plus launch/cache/accounting configuration. The next owner must load the token privately through `loadRuntimeSecret`, preserve all accounting roots and obtain the root's exclusive engine GO. This file contains no playback URL or credential. The original prototype assets and all three failed gate records remain available; only exact media files of failed owned runs were removed to avoid duplicated cache cost.

Still distinct: native-browser rapid-seek reproduction, actual production-path Sony proof,60-minute three-consumer capacity, physical Android/PWA/HDMI, reboot recovery and authenticated PTI release checks. The root and independent hardware/QA owners control those lanes.

The subsequent real duration startup found a strict upstream500 before its three-consumer barrier. Private logs identify an exclusively accessed `.jellyfin-transcode` marker, not wrong episode/video bytes. The first `/System/Info` warmup was insufficient: actual attempt4 again failed, with the other episode affected. [Sanitized diagnosis and pinned primary-source comparison](../cast-media-compat/prepared-marker-diagnosis.md) document the lazy manager's deletion of that marker and the revised bounded per-client header admission across every authenticated engine fetch site. Only headers serialize; bodies remain concurrent. The actual concurrent smoke remains the acceptance test; the earlier sequential gate is not evidence that concurrent startup passed. Independent review fixed lifecycle counterexamples in final publication and child-error/close ordering before the revised run.
