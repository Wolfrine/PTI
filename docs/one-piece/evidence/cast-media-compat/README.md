# Cast media timing comparison

This is a bounded technical investigation of the actual Sony receiver failures. It does not replace the selected Jellyfin engine or authorize blanket conversion of browser playback.

## Trigger and inspected evidence

`../cast-production-adapter-attempt6-controls-natural-timeout.json` records full episode 1000 playing from 600 to 640 seconds with Japanese/full-English tracks and actual receiver controls. Its later seek to 1418.79 seconds remained BUFFERING for the 50-second observation limit, despite the last four transport-stream responses being HTTP 200 in 1.895, 0.035, 0.620 and 0.035 seconds. Successful segment retrieval is therefore insufficient evidence of a valid receiver media timeline or natural transition. No failed result is discarded.

The corresponding private FFmpeg command used input seek `00:23:37.917`, video/audio copy, `-copyts -start_at_zero`, TS HLS and start segment 472. The original has 1430.723 seconds of video and 1430.790 seconds of audio. The small video/audio duration difference alone is not established as the cause.

Full source-2 H.264 NVENC HLS has played on the same receiver, but observed seek recoveries of 8.397 and 6.688 seconds miss the five-second target. This is a separate performance failure; it is not proof that source-1 must be encoded.

## Competing explanations and smallest useful experiment

1. Compare actual timestamps, keyframes and decodability in four segments near 600 seconds and the end, against playlist EXTINF cumulative positions. A virtual VOD playlist and successful engine response are not decoder/timeline acceptance.
2. Keep the production path unchanged and intercept only this opt-in harness's PlaybackInfo request: existing H.264 copy TS, forced H.264 NVENC TS, and H.264 fMP4 with copy allowed. Source 1001 still requires conversion when the receiving representation is H.264.
3. Only after packet evidence, compare surviving representations on the real Sony. Include seek forward/backward, a late seek followed by natural end, and the real 1000-to-1001 queue transition. Preserve full English external WebVTT and selected Japanese tracks.
4. If on-demand HLS remains unreliable or too slow on that receiver, evaluate a fully prepared, range-seekable H.264/AAC MP4 plus full English WebVTT. Prefer Jellyfin for delivery and range handling. Account for the complete derivative and temporaries within the existing 20 GiB bound. Source-1 preparation should copy compatible video; source-2 may convert HEVC. A short MP4 clip success does not establish full MP4 acceptance.

The first experiment's script is `apps/one-piece/companion/test/media-cast-compat-real.mjs`. It is skipped unless both opt-ins are supplied, never discovers or controls a TV, rejects every network-original download, uses only already verified cached episodes 1000/1001, uses existing cache reservations/accounting, restores previous encoding configuration, and cancels only its own private engine sessions. Binary samples stay on H:. Do not run it while another lane uses pilot engine 18096. Defaults are three policies and two episodes; subset selectors can reduce work.

```powershell
$env:PTI_RUN_REAL_CAST_MEDIA='1'
$env:PTI_EXCLUSIVE_PILOT_LANE='cast-media-compat'
$env:PTI_COMPAT_EPISODES='1000,1001'
$env:PTI_COMPAT_POLICIES='copy-ts,encode-ts,copy-fmp4'
& H:/PTI-OnePiece/tools/node/node.exe apps/one-piece/companion/test/media-cast-compat-real.mjs
```

## Source rationale

FFmpeg documents that input seeking may begin at an earlier seek point and that stream copy preserves material between that point and the requested position. Timestamp retention and zero-start options therefore require measured validation rather than assumption. [FFmpeg option reference](https://www.ffmpeg.org/ffmpeg.html)

The inspected current Jellyfin source adds `-start_at_zero` to copied video and uses `-copyts` in HLS output. Encoded video has keyframes aligned to the HLS segment length. Its fMP4 path explicitly addresses discontinuity/open-GOP timing with `frag_discont` and `skip_sidx`. These are reasons to compare the modes, not evidence they fix this installation. The observed pinned-engine commands take precedence over upstream source drift. [Jellyfin HLS controller](https://github.com/jellyfin/jellyfin/blob/master/Jellyfin.Api/Controllers/DynamicHlsController.cs)

Google documents TS and MP4 containers, progressive download, HLS and external WebVTT. Container support does not establish Sony codec/timing compatibility; subtitle resources require CORS. [Google Cast media requirements](https://developers.google.com/cast/docs/media)

A real fMP4 Cast comparison must also send the correct `hlsSegmentFormat` and `hlsVideoSegmentFormat` metadata; changing only a file suffix or MIME type is insufficient. The engine-only diagnostic does not test that receiver declaration. [Google streaming-protocol guidance](https://developers.google.com/cast/docs/media/streaming_protocols)

## Measured results and implementation

The parent granted the exclusive pilot-engine lane. All experiments used the existing MD5-verified local originals, with a rejecting downloader. No TV was discovered or controlled by this lane. Timestamped JSON files preserve every run, including failed probes. `engine-comparison.json` is only the latest diagnostic; use the timestamped records below for the complete result.

| Engine representation | Measured result | Consequence |
|---|---|---|
| Episode 1000 H.264 copy, TS, three-second target | At 600 seconds, virtual segment 199 advertised 2.002s but contained 4.0037s of video; segment 200 advertised 4.004s but contained 2.0017s. The same alternating mismatch occurred near the end. | Confirmed playlist/generated-segment timing defect after seek, despite successful decode and quick HTTP responses. |
| Episode 1000 H.264 copy, fMP4, three-second target | The same alternating duration mismatch; decode succeeded. | Container replacement alone does not fix this timing defect. |
| Forced H.264 NVENC, TS, three-second target | Source-1 segment spans matched advertised 3.003s after seeks; decode succeeded. | A viable aligned-keyframe candidate, pending receiver proof. |
| Forced H.264 NVENC, TS, one-second target | The source-2 virtual playlist exceeded the existing 1 MiB manifest limit and preparation failed closed. | Rejected; no blind increase to manifest/security bounds. |
| Forced H.264 NVENC, TS, two-second target | Real 2.002s segments aligned at start, 600s and near the end for both sources. Actual manifests were 522,821 / 553,879 bytes, target duration 3, below the existing limit. Every remaining late segment, including the final short segment, was nonempty. | Selected production **Cast-only baseline**, subject to the parent's actual Sony tests. Browser `compatible-h264` keeps copy eligibility. |
| Episode 1000 H.264 copy, TS, two-second target | All inspected intervals aligned, including final segments; decode succeeded. Ready 1.576s; four 600s segments 1.230s; seven final segments 1.524s. | A lighter **episode-1000 candidate only**. It is not enabled in production and is not evidence for other release GOPs or the Sony. |

The first comparison is in `engine-comparison-2026-10-18T10-12-53-878Z.json`; the implemented Cast profile is exercised in `engine-comparison-2026-10-18T10-20-23-293Z.json`; the narrow copied two-second candidate is in `engine-comparison-2026-10-18T10-22-25-109Z.json`. The copied TS packets have a constant approximately 10-second transport timestamp offset; the analysis compares duration and relative alignment without changing source/subtitle global time. The measured duration mismatch is a real defect, but this headless lane does not claim it is the sole cause of the previous Sony buffering.

### The second collection's selected duration

Jellyfin's inspected source/stream JSON exposed only the container runtime, not selected-stream durations. A bounded local ffprobe check found episode 1001's English track ends at 1432.415s, while Japanese ends at 1419.040s. Its video tail packets end at 1419.028s; the video duration tag says 1419.001s. The original container/runtime is therefore 13.375 seconds longer than the Japanese presentation. A pre-fix seek into that virtual tail returned HTTP 200 with an empty segment. This failure is preserved in `engine-comparison-2026-10-18T10-14-05-819Z.json` and the two-second repeat `engine-comparison-2026-10-18T10-15-53-339Z.json`.

`media/timing.mjs` now inspects only a managed regular cached original, using the pinned bundled ffprobe with no shell or URL input. It reads small metadata and at most eight seconds of tail packets per selected video/audio track, with 15-second process and 2 MiB output bounds. Missing or contradictory track-end metadata fails visibly rather than triggering a full scan. It supports both `DURATION` and source-1 `DURATION-eng` tags, and deduplicates probes in memory by file identity/selected tracks. The effective duration is the maximum verified end of the selected video/audio, not an unselected audio track. Original runtime remains diagnostic metadata.

`media/jellyfin.mjs` applies that inspected duration to local and Cast sessions and trims only the VOD tail/last EXTINF before authorizing resource URLs. It preserves preceding indices, transport timestamps and English cue timing. Episode 1000 remains 1430.790s (video tail 1430.722s, Japanese 1430.790s). Episode 1001 becomes 1419.040s; its last two-second-profile segment is correctly clamped to 1.624s, with no empty tail resources exposed.

The production `cast-h264` mode disables video copy and uses two-second H.264/AAC TS HLS, preserving metadata-selected Japanese/full-English tracks. The same mode carries into a prepared next episode and adoption. Explicit return to `compatible-h264` restores local copy eligibility. Root owns the authenticated destination handoff and supplies `ffprobePath` from the pinned runtime; this lane changed no API/authentication behavior.

Both H.264 modes share the required maximum 8-bit codec condition. Recorded encoder commands/output show `scale_cuda=format=yuv420p`, High/720p for 1000 and Main/1080p for 1001. An offline TS/PES demux and SPS check of the retained, SHA-matched production samples found profile/level bytes 100/31 (High 3.1) and 77/40 (Main 4.0), respectively. `codec-profile-offline.json` and `test/media-sps-offline.mjs` preserve the check; no engine, ffprobe, GPU, network or TV was invoked for this additional verification. These actual output values do not replace the Sony test.

In the real production-mode comparison, ready cost including visible inspection/caption/first-segment preparation was 4.067s for 1000 and 1.671s for 1001. Subsequent start-segment fetches were 39/41ms; four segments at 600s were 0.923/0.874s; seven final segments were 0.993/1.444s. All six concatenated samples decoded with exit 0 and no warning. These are local-engine/request measurements, not renderer/receiver or five-second end-to-end acceptance. Recently accessed disk/cache state affects the results.

## Verification, cleanup and remaining gates

Focused Jellyfin/timing/coordinator fixtures passed **19/19** with zero skips (`focused-tests.tap`), including wrong/empty timing data, bounded selected-track inspection, shared work, outside/URL input denial, actual filesystem-symlink refusal, VOD tail capability denial, Cast profile negotiation, next-profile adoption and local-copy restoration. They use explicit synthetic media/metadata payloads and do not prove audiovisual playback. `test/run.mjs` automatically discovers the new `.test.mjs` file and excludes the opt-in real-media harness.

The real harness restored the previous encoding configuration and closed only its own engine sessions. At 2026-10-18T10:22:45.920Z, the pilot engine had **zero ffmpeg/ffprobe children**. Configured comparison roots accounted for 4,043,015,096 bytes, zero reservations/pins/jobs, below 21,474,836,480 bytes. No original was downloaded. Binary samples remain only on H:. The engine lane was returned to the parent for actual TV tests; do not run this diagnostic concurrently.

Outstanding in this lane: actual Sony behavior with the new mode, audible Japanese/visible and synchronized English after seeks, real natural 1000→1001 transition, five-second receiver recovery, other-file GOPs for any future copied Cast mode, and long concurrency. Existing owner confirmations remain separately recorded by the parent. No listening, browser-rendered, phone-sleep, full-episode or 60-minute acceptance is invented here.
