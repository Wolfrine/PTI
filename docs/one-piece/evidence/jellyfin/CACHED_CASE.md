# Two-original cache comparison

Two bounded, explicitly approved follow-ups downloaded **episodes 1 and 1001 only**, one original from each collection. Episode 1 lives at `H:/PTI-OnePiece/pilot/jellyfin/cache/cached-case/episode-1.mkv`; episode 1001 at `H:/PTI-OnePiece/pilot/jellyfin/cache/cached-case-1001/episode-1001.mkv`. The engine's original remote-STRM failures remain unchanged.

| Step | Measured outcome |
|---|---|
| Original download | **357,167,311 payload bytes in 29.220142s**, HTTP 200, no retry |
| Integrity | Archive MD5 `f22a5ae5381eb2f541f07de768a7ad89` matches the complete local file |
| Bounds | 500 MiB hard download maximum; 180-second curl deadline; completed within both |
| Local-file PlaybackInfo | **0.047s**, Japanese audio index 1/full-English ASS index 2 selected with matching MediaSourceId |
| Fresh local-item ASS extraction/delivery | **0.468s**, 29,159 bytes/302 dialogue cues; hash matches the earlier remote extracted ASS |
| Immediate warm ASS delivery | **0.016s** |
| First real HLS segment | **0.343s**, 2,623,164 bytes, H.264/AAC copied from verified local original |
| Warm HLS segment | **0.140s** |
| Warm seek to nominal 600s | **0.125s**; previously generated HLS segments may already exist |
| Seek with prior local HLS generation isolated | **0.235s**, 1,538,592-byte real segment; explicit fresh seek job from the cached original |

The fresh-seek comparison moved only the local experiment's 249 generated HLS files into its own `prior-remux` folder; it preserved the verified MKV, subtitle files, remote-pilot clips and parent TV assets. The new request launched a new FFmpeg seek/remux command. The local Matroska keyframe-aware playlist identifies the selected segment at 596.346s; its actual MPEG-TS timestamps and subtitle alignment still require visual validation. `cached-seek-remux-reset.json`, `cached-hls-seek-600-fresh.json` and the copied cached engine log record the procedure.

## Second collection: episode 1001

| Step | Measured outcome |
|---|---|
| Original download | **844,716,819 payload bytes in 127.871119s**, HTTP 200, no retry |
| Integrity | Archive MD5 `2610511c93fae62d4791e8284b6b96eb` matches the complete local file |
| Bounds | 2 GiB hard maximum; metadata size/MD5 checked first; 180-second curl deadline; completed within both |
| Local-file PlaybackInfo | **0.032s**, Japanese audio 2/full-English ASS 4 selected with matching MediaSourceId |
| Fresh local-item full-English ASS delivery | **0.859s**, 28,697 bytes/328 dialogue cues; excludes default signs/song track 3 |
| Warm full-English ASS delivery | **0.016s** |
| First real HLS segment | **2.922s**, 1,781,488 bytes, HEVC converted to H.264 using CPU `libx264`; source audio `0:2` copied |
| Warm HLS segment | **0.469s**, including the measured response/file-handling interval |
| Seek with prior local HLS generation isolated | **2.875s**, 1,931,700-byte real H.264/AAC segment; new local seek/transcode job |

The source-2 fresh-seek reset preserved four earlier generated files (8,305,088 bytes), then requested a segment around nominal 600 seconds. The playlist's selected segment starts at 597.597s. FFmpeg logs prove `file:...episode-1001.mkv` input, Japanese `-map 0:2`, and CPU `libx264`. The generated segment codec/time probe is saved separately. Full-English subtitle content was extracted separately and has not yet been visually synchronized with this segment.

A quick hardware capability check encoded 24 synthetic black 1080p frames through `h264_nvenc` successfully in 0.672s. **It is not a real-source HEVC/GPU benchmark or capacity test.** No Jellyfin GPU configuration was changed; the episode-1001 results above use CPU encoding.

The initial source-2 result files preserve `encoderChildrenStopped: false`: the cancellation helper encountered processes exiting between discovery and cancellation/verification. The helper now waits for termination, ignores already-exited processes and checks actual live process objects. A subsequent verification found **zero live encoder/probe children**. This cleanup correction does not alter the recorded playback timings; `cached-1001-cleanup.json` records it.

**Conclusion:** complete cached originals remove the measured engine subtitle and seeking delays for both sampled sources. After preparation, both tested episodes meet the numerical engine-start/subtitle/seek thresholds, including source-2 HEVC-to-H.264 conversion on the existing CPU configuration. **The uncached downloads themselves take 29.220s and 127.871s, both exceeding the approved 15-second first-view target.** A production design must make preparation visible and automatically prepare the next episode; it cannot call these successful cold remote starts.

These timing results use newly downloaded files that were also read for MD5 verification; the Windows disk/page cache was warm. They are not an OS cold-boot benchmark. No browser frame, audible Japanese, subtitle synchronization, actual Cast, HDMI, three-stream load or episode transition was tested in this lane. Other episodes and real-source GPU performance remain untested. The tests intentionally stopped encoder children after obtaining each segment and do not implement a production cache eviction or hard concurrent-preparation controller.

Both complete-download payloads are measured using curl's byte counter. During the tested local-file playback jobs, FFmpeg read `file:H:/.../episode-1.mkv` or `episode-1001.mkv`; no upstream episode-media fetch was required. This is distinct from the earlier remote runs, whose upstream consumption remains unknown. Shared storage totals are recorded separately in `cached-storage.json` and remain below 20 GiB.

Reproduce with `cached_case.py` as documented in the pilot README. All media stays on H:. All repository evidence is sanitized metadata, timings, hashes and logs. Leave the engine on loopback and retain local assets for the parent device tests.
