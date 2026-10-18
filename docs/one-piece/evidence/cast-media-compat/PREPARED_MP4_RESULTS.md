# Prepared MP4 feasibility: real cached originals, private Jellyfin delivery

Technical pilot only. No production migration or TV test was performed in this lane. All originals were already MD5-verified in the managed cache. The downloader rejected every new original download. Existing pilot 18096 was used for private preparation; a separate, protected Jellyfin 12.2.0 instance imported only the two completed files and their captions on loopback port 18106. That process is now stopped.

## Measured result

| Measurement | Episode 1000 | Episode 1001 |
|---|---:|---:|
| Original bytes | 742,925,306 | 844,716,819 |
| Original selected audio / full-English subtitle index | Japanese 1 / English 2 | Japanese 2 / English 4 |
| Private Jellyfin preparation | H.264/AAC video/audio copy | HEVC Main10 to H.264 NVENC, Japanese AAC copy |
| Complete preparation, validation and faststart finalization, cached original | 16.928 s | 53.081 s |
| Private progressive HTTP response | 8.496 s / 737,657,691 bytes | 37.112 s / 1,322,665,771 bytes |
| Separate no-reencode faststart finalization | 2.630 s | 8.851 s |
| Final bytes | 737,980,951 | 1,323,099,843 |
| Actual video | 1280×720 H.264 High, level 4.0, yuv420p | 1920×1080 H.264 Main, level 4.0, yuv420p |
| Actual audio | Japanese AAC LC, 44.1 kHz, stereo | Japanese AAC LC, 44.1 kHz, stereo |
| Selected-original effective duration | 1430.790 s | 1419.040 s |
| Final MP4 format duration | 1430.789705 s | 1419.041917 s |
| Original full-English VTT | 14,478 bytes / 233 cues | 20,618 bytes / 328 cues |
| Real HTTP decode at start / 600 s / three seconds before selected end | 251 / 324 / 173 ms | 273 / 483 / 530 ms |

Both dynamic private responses had `Accept-Ranges: none` and fragmented `moof` boxes. They were used only for complete preparation. The bundled FFmpeg copied each finished response into a classic MP4 with a front `moov` index; both owned finalization processes exited 0. Complete source-to-prepared mapping was checked from the actual private engine command and normal final statistics. The HTTP preparation API does not expose its OS child exit code, so that value is not fabricated.

Jellyfin static HEAD returned the exact final length. Four 64 KiB reads per episode—start, middle, tail and suffix—returned 206 with exact `Content-Range`, and every byte matched the immutable local file. Each real HTTP seek then used the pinned bundled FFmpeg to read and decode one second of both video and audio. Transfers were 4.36–24.69 MB per seek, below the 64 MiB aggregate limit. Normal early connection cancellation after the bounded decode is recorded separately from a failed decode. No Jellyfin encoder/probe child was active during these static seek checks.

A second no-preparation registration run reproduced all static checks and headless seeks: **181 / 232 / 166 ms** for 1000, **231 / 508 / 539 ms** for 1001. These are loopback decoder timings, **not** actual Sony recovery or native-browser acceptance.

## Import behavior and the failed experiments

1. The first original preparation succeeded, but item metadata refresh did not discover new filesystem children within 30 seconds. Its `Recursive` query does not turn that API into a child-validation scan.
2. An exact-file `Media/Updated` retry initially had a 30-second deadline while the engine's configured monitor delay was 60 seconds. The timer-correct 75-second retry also failed. Those early libraries used forward-slash Windows roots; they do not establish that the correctly configured incremental mechanism fails.
3. A clean instance initialized with the same forward-slash root performed an unwanted TheMovieDb lookup and failed the 30-second item-discovery gate. The submitted provider payload alone was insufficient evidence that the correct item inherited it.
4. **Native-normalizing `PathInfos` with `path.resolve()` fixed library membership.** The same empty Movie metadata/image provider arrays were read back, and the correctly configured initial import completed in **1.251 seconds**, with no remote movie-provider error recorded in the inspected log. Production `JellyfinClient` already normalizes its managed original root; no production provider-field change was made from this harness defect. The log check is not an independent network-egress capture.
5. After that initialized library contained 1000, adding 1001 via the mature exact-file `Media/Updated` API succeeded in **61.810 seconds**, consistent with its configured 60-second delay. No second global scan was used. This delay is preparation/import time, separate from warm playback. It remains an operational policy decision; this pilot did not change the global delay.

The clean engine's first setup was measured separately at 18.179 seconds. A one-time finite scan of its audited two-file library was authorized. No scan of the existing pilot's historical STRM library occurred. Its read-only scope audit remains in `prepared-mp4-library-scope.json`.

## Resource graph and limits

- Source records retain their original MD5, Japanese track index and full-English track index. The prepared video has its own inspected Jellyfin item/source ID, final size/SHA256 and native path. English VTT remains the exact extracted original track, with its own size/SHA256; no global subtitle offset was applied.
- Jellyfin performs preparation and static HTTP delivery. The pilot-only loopback bridge admits exactly the two verified videos and VTT files, uses a RAM-only scoped capability, injects private engine credentials server-side, checks every interval/206/length, applies backpressure and cancels disconnected requests. It is not a production media-server implementation.
- Every engine output, adapter part, faststart duplicate, final file, caption, isolated configuration and historical pilot root was accounted on H:. Peak actual-plus-reserved accounting was **13,363,336,762 bytes**, below the 20 GiB cap. The successful run ended with **6,836,445,216 bytes used**, no reserved bytes or preparation jobs. Later registration adds small protected engine state, also under the same accounting.
- Active originals were pinned, then verified unchanged by size/mtime at cleanup. Only exact owned temporary filenames were deleted. Existing 18096 encoding configuration was restored after actual preparation; the subsequent registration run did not change it. Both isolated runs stopped normally with exit 0 and zero children.

## Reproduce and hand off privately

The opt-in harness is `apps/one-piece/companion/test/prepared-mp4-real.mjs`. Its default invocation performs no work. Running it requires `PTI_RUN_PREPARED_MP4=1`, `PTI_EXCLUSIVE_PILOT_LANE=prepared-mp4`, and an independently scheduled exclusive media lane. `PTI_PREPARED_MP4_EPISODES` accepts only `1000,1001` or one of those episodes. Verified output reuse takes an exact earlier sanitized evidence filename through `PTI_PREPARED_MP4_REUSE_EVIDENCE`; it rechecks the original fingerprint, complete-file hash and caption hash before use. `PTI_KEEP_ISOLATED_PREPARED_ENGINE=1` preserves the finite library and sealed restart state after stopping its process.

`prepared-mp4-handoff.json` contains the exact launch descriptor, protected resume-config path, finite library ID/root, item/source IDs, video/caption paths and hashes, selected tracks and durations. It contains no plaintext credentials, tokens or media URLs. The protected resume config uses the existing `saveRuntimeSecret` / `loadRuntimeSecret` DPAPI format, names `jellyfinToken` and `jellyfinCredentials`, under the new instance's private directory. Keep decrypted values in process memory.

For an owner-controlled restart after obtaining the engine lane: verify port 18106 is free; spawn the descriptor's existing executable and argument array with `shell:false`, `windowsHide:true` and the executable directory as cwd; verify its exact process/commandline and sole `127.0.0.1:18106` listener. Load its sealed token using `loadRuntimeSecret(resumeConfig, 'jellyfinToken')`. If renewal is needed, decrypt `jellyfinCredentials` and authenticate privately through Jellyfin; never log either value. Static delivery uses `/Videos/{derivedItemId}/stream.mp4?Static=true&MediaSourceId={derivedSourceId}` with private Authorization headers. Stop through the private shutdown API, await the owned process and verify no listener/children. The hardware owner has this handoff; no process is left running by this lane.

## Acceptance still outstanding

Actual Sony warm load, repeated seeks, full-English timing after seeks, Japanese listening, queue transition and finish; native-browser reproduction of the HLS decoder failure with the prepared MP4; production Firebase/ticket/Cast handoff; slow-response and cancellation behavior; persisted reuse after an actual restart; cache eviction/repair and three simultaneous family sessions. These results support the next real-device comparison. They do not select a production migration by themselves.

Primary evidence: `prepared-mp4-2026-10-18T11-11-26-897Z-9effcd.json`, `prepared-mp4-2026-10-18T11-15-45-793Z-80ecd8.json`, the earlier timestamped failed runs, and the sanitized handoff. Runtime API/schema and source inspection covered Jellyfin's [library report endpoint](https://github.com/jellyfin/jellyfin/blob/master/Jellyfin.Api/Controllers/LibraryController.cs), [file-change refresher](https://github.com/jellyfin/jellyfin/blob/master/Emby.Server.Implementations/IO/FileRefresher.cs), [library creation behavior](https://github.com/jellyfin/jellyfin/blob/master/Emby.Server.Implementations/Library/LibraryManager.cs), and [metadata provider selection](https://github.com/jellyfin/jellyfin/blob/master/MediaBrowser.Controller/BaseItemManager/BaseItemManager.cs). The actual pinned 12.2.0 schema/readbacks and experiments establish the runtime results above.
