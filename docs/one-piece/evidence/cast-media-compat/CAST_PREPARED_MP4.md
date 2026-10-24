# Actual Sony prepared-MP4 comparison

The full prepared static MP4 path passes the bounded Sony functional and seek sequence. It is a test-only binding to two preserved Jellyfin-derived items, not production static-media/cache integration or a released PWA.

[cast-prepared-mp4-attempt1-no-fetch.json](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/evidence/cast-media-compat/cast-prepared-mp4-attempt1-no-fetch.json) preserves the first failure: a read-only platform GET_STATUS raised pychromecast `RequestFailed` after the single LOAD, before any Sony video request. It is not an MP4 decoder failure. The narrow production worker repair retries that status failure only inside the existing18-second confirmation window; it never resends a rejected LOAD or accepts unchanged cached ownership. Confirmation also requires a new raw RECEIVER_STATUS plus actual media status. Tests cover a one-time failure, finite persistent failure, callback-only platform data, foreign change and exactly one rejected LOAD. This production repair still needs separate independent review.

[cast-prepared-mp4-attempt2-functional-timing-pass.json](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/evidence/cast-media-compat/cast-prepared-mp4-attempt2-functional-timing-pass.json) uses the real `CompanionApi`, scoped tickets, `ProgressStore`, `CastBridge` and Python receiver transport, with explicitly synthetic identity/family/paired-credential adapters. Actual Sony full-file video/range requests and full-English WebVTT were observed. Initial ready-file→already-launched receiver load was1296ms. All seven seek checks required authoritative PLAYING **and position advancing more than0.15s beyond the target**:

| Seek | Recovery |
| --- | ---: |
| 1000→900s | 1775ms |
| 1000→600s | 699ms |
| 1000 repeated→900s | 1191ms |
| 1000 repeated→600s | 677ms |
| 1000 late→1418.79s | 1995ms |
| 1001→600s after natural transition | 2247ms |
| 1001 late→1409.04s | 1154ms |

The actual natural1000→1001 transition preserved the viewing lease and authority epoch, without a manual Next/episode command. Japanese audio and English remained selected; actual1001 IDLE/FINISHED occurred at1419.04s. Real pause/play, English off/on, volume down/restoration, local handback and old-ticket404 passed. Sony made14 media requests plus the explicit revoked-ticket check,187,932,629bytes total. The private relay observed18 video reads including six preflight samples:8 completed bodies and10 consumer-cancelled bodies, with no unclassified incomplete body. A cancelled large open range is not labelled a complete-file transfer.

This pilot preserves exact source provenance. Original1000 selected Japanese1/English2; original1001 selected Japanese2/full-English4. **Jellyfin's derived items actually report Japanese audio index2 and external English index0 for both files.** Those derived indices were inspected, not copied from the original. Served external VTT SHA256 equals the handoff SHA for each source; all233/328 canonical cues, dialogue text and timing match. The current run rechecked video size/native path and trusted the earlier full video SHA verification; it did not silently claim a new full2GB hash pass. Six real206 samples (start/middle/tail for each file) were byte-identical to the exact local prepared representation before TV load.

## Separate human presentation checks

The earlier30-second windows were too short for tool latency and walking to the room. No human proof was inferred from them. A separate observation-only replay completed:

| New prepared-MP4 window | Actual start/end UTC | Position | Telemetry |
| --- | --- | --- | --- |
| 1000 |11:33:10.402→11:35:10.425|600.429→721.161|103 PLAYING samples,0 nonplaying |
| 1001 |11:35:25.303→11:37:25.319|604.103→723.036|100 PLAYING samples,0 nonplaying |

The parent separately asked about Japanese dialogue and full-English dialogue captions for each actual episode window. The owner answered **“Japanese audio and English subtitles both work”** separately for1000 and1001. Exact reply timestamps were not supplied and are not fabricated. Details are in `cast-prepared-mp4-human-confirmations.json`; the raw technical harness's automated listening/visual flags remain false because the human evidence is separate. The observation replay explicitly selected1001, so its natural-transition flag is false; the automated run above provides that proof.

`cast-prepared-mp4-observations.json` passed both120-second no-control windows and handback726.338→726.474s with old-ticket404. After both completed runs, owned isolated Jellyfin exited0, no18106/18099/18100 listeners remained, no FFmpeg/ffprobe children remained, and temporary mDNS stopped. Some read-only status polls were temporarily unavailable and are preserved in diagnostics; neither run is labelled perfect transport reliability.

Initial receiver launch has a separate cost: the observation run needed7688ms to load from idle after a proper receiver STOP, versus1296ms with an already-launched receiver in the automated run. Its11.736s isolated-engine startup/metadata/range preflight and5.867s discovery are outside those load values. This is **not** a blanket five-second initial-start pass. Complete-file preparation/import costs remain in the source MP4 feasibility evidence and are not hidden inside warm seek results.

## Test helper and next browser handoff

`apps/one-piece/companion/test/prepared-pilot.mjs` exports `createPreparedPilot({startOwnedEngine:true})`. It reads the exact sanitized `prepared-mp4-handoff.json`, loads DPAPI secrets privately, resumes only the preserved isolated18106 process, and owns its normal private `/System/Shutdown`. It never starts18096/18097, scans the original library, downloads an original, or accepts a request-provided URL/path. Only two video and two verified caption resource IDs exist. It forwards known-file ranges without raising any production HLS segment cap.

The returned interface is:

```js
const media = await createPreparedPilot({startOwnedEngine:true});
await media.initialize();
await media.openSession({sessionId,profileId,episodeNumber:1000});
media.snapshot(sessionId); // state ready; playback.contentType === 'video/mp4'
await media.getPlaybackResource(sessionId,exactResource,{range,signal});
await media.prepareNextPlayback(sessionId); // only1000→1001
media.preparedNext(sessionId);
await media.switchEpisode(sessionId,1001,{audioLanguage:'jpn'});
await media.reportProgress(sessionId,progress); // test-only no-op; not engine/cloud sync proof
media.cancelStreams(sessionId); // call on authority changes in the technical host
await media.closeSession(sessionId);
await media.cache.usage(); // production-media tree only; not production reservation/eviction proof
await media.shutdown();
```

Descriptors include actual MIME, duration, inspected derived audio/subtitle indices, tracks, original selection provenance, and exact master/subtitle resource IDs. Private engine credentials/URLs remain RAM-only. `media.evidence` contains sanitized process/lineage/preflight/request/cleanup evidence. The helper's bounds are160 video requests,8 concurrent pending/active streams,8GiB transferred per run, each exact representation≤2GiB, and5-minute per-stream abort. Caller close and authority revocation cancel only that session's reads. Completed versus cancelled bodies are explicit.

For a browser experiment, adapt `browser-real.mjs` to instantiate this helper under explicit `PTI_RUN_REAL_BROWSER=1`, retain the loopback18102/dev-only control adapter, and propagate actual `delivery.contentType`. On authority change call `media.cancelStreams(id)` as well as revoking tickets. Stop via the helper's `shutdown`; **do not call the unrelated18096 encoder cleanup**. That browser mode is not implemented or run by this Cast lane. The parent owns the next actual native-browser experiment after this handoff.

Reproducing the measured Cast run requires an exclusive engine/TV window, exact pinned runtime Node and explicit flags:

```powershell
$env:PTI_RUN_REAL_CAST='1'
$env:PTI_CAST_FOCUS_TIMING='1'
$env:PTI_CAST_PREPARED_MP4='1'
& 'H:/PTI-OnePiece/tools/node/node.exe' test/cast-real.mjs
```

Adding `PTI_CAST_MP4_OBSERVE_ONLY=1` selects the separate120s-per-episode replay and makes no seek-performance/natural-transition claim. The helper/range/lineage and Cast/evidence fixtures passed21/21 before hardware execution. Later production cache/transport work, actual Firebase/PWA pairing, phone sleep, three physical clients,60-minute load, HDMI, Android installation, quantified subtitle sync and full-episode viewing remain separate requirements.
