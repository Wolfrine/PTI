# Jellyfin 12.2 remote-source pilot — 2026-10-18

The owner subsequently approved automatic selected/current-next preparation. [PRODUCTION_CORE.md](PRODUCTION_CORE.md) records the implemented cache/media core, real1000→1001 preparation/queue transition, short three-viewer/six-context comparison, retained latency failures, and remaining product acceptance gaps. This page preserves the earlier remote-source experiment's results.

**Remote-STRM gate verdict: FAIL for the approved cold <=15s / warm+seek <=5s targets.** Subsequent bounded cache comparisons show fast engine playback/subtitles/seeking after complete preparation for both sampled sources; [CACHED_CASE.md](CACHED_CASE.md) records the separate 29.220s/127.871s downloads and sub-3s prepared playback. Do not call those successful cold remote starts or use these headless results to accept the product. Japanese was selected by metadata and FFmpeg mapping; nobody listened to it in this lane. No image/subtitle was rendered on a screen or TV in this lane.

| Probe | Measured result | What it establishes |
|---|---:|---|
| Two-entry remote STRM library scan | 1.469s | Catalogue ingestion, without probing every video upfront |
| Episode 1 first PlaybackInfo | 9.484s | Remote H.264/AAC Japanese/ASS English track discovery |
| Episode 1 cold full-English ASS delivery | **88.140s** | Real 29,159-byte ASS, 302 dialogue cues, returned; fails cold target |
| Episode 1 immediate warm ASS delivery | **8.735s** | Same hash/content returned; fails warm target |
| Episode 1 first HLS media segment | 11.094s | 2,623,164 bytes, H.264/AAC, video+audio copied; subtitles excluded from this timing |
| Episode 1 seek to nominal 600s | **20.765s** | 1,538,592-byte real H.264/AAC segment; fails seek target |
| Episode 1001 PlaybackInfo | 18.953s first observed; 18.578s repeat; 11.671s final selected-source repeat | HEVC, Japanese AAC index 2, English full-dialogue ASS index 4 versus default signs/song index 3 |
| Episode 1001 cold full-English ASS delivery | **90.078s timeout** | No caption response delivered within budget; its extraction child was cancelled |
| Episode 1001 HLS with explicitly verified Japanese selection | **26.031s** | 1,781,488-byte real H.264/AAC segment; FFmpeg log maps source audio `0:2`; subtitles excluded from timing |

The individual metadata, caption, and segment timings are **not** end-to-end browser startup measurements. Their separate failures are sufficient to reject this configuration against the approved gates. The final episode-1001 test used default CPU `libx264` encoding. GPU/NVENC was not configured or benchmarked; these results do not characterize RTX 4060 capacity or three-stream capacity.

The episode-1 ASS contains English conversation at approximately 601 seconds and cue timestamps around the tested seek. This establishes real subtitle content and cue coverage, not rendered synchronization. The nominal-600s segment starts at MPEG-TS PTS 606.346s and lasts 10.4277s; mux offsets/keyframe alignment mean the original subtitle-clock offset needs visual verification.

## Engine behavior and API pitfalls

- A cold ASS request launches FFmpeg over the original remote MKV and waits for complete extraction. Episode 1's logged extraction alone took approximately 79.284s. Episode 1001's command extracts both English subtitle streams together even though the requested stream was full English. Network bytes consumed by these scans were not instrumented; **upstream bytes remain unknown**.
- A tiny successful HLS manifest is not playback success. The probes followed master -> media playlist -> real transport-stream segment and separately inspected its codecs.
- Jellyfin 12.2 applies explicit audio/subtitle indexes only when the request's `MediaSourceId` matches the source. The initial episode-1001 HLS test omitted it and selected default English. That **invalid-language reference test** is retained in `hls-1001-0-invalid-language.json`; its 30.907s result is excluded from Japanese acceptance.
- An initial seek experiment incorrectly propagated `StartTimeTicks=6000000000` into dynamic HLS segments, which Jellyfin rejects. The corrected test seeks by playlist segment number. `hls-1-600-invalid-request.json` records this **harness error**, not an engine seek verdict.
- Remote-MKV keyframe extraction attempts emitted a local-path IO exception before HLS continued. Sanitized engine logs preserve the exception. This is another behavior to resolve before production use.
- The older `X-Emby-Authorization` / `X-Emby-Token` headers were ignored. This harness uses the standard `Authorization` header. An early auth setup attempt was discarded in a fresh isolated `data-v2`/`config-v2` runtime.

## Isolation, storage, and reproducibility

Official release provenance and the locally measured ZIP hash are in `release-provenance.json`. The official index did not publish a checksum; the observed SHA256 is not labelled publisher-authenticated. Runtime/binaries and every media temporary are on H:. Shared storage after both cached originals and generated segments is recorded in `cached-storage.json` and remains below 20 GiB. Cache size is not evidence of upstream byte consumption; the two approved follow-up downloads have separate actual curl payload-byte measurements.

The engine remains available on **127.0.0.1:18096 only**, with discovery, UPnP and remote access disabled. Every task trigger was cleared; library real-time scans, providers, chapter images, trickplay and LUFS scans are disabled. No service, firewall, LAN listener, production deployment or persistent operating-system startup was created. Remaining encoder/probe children were stopped after the bounded requests. Local clip/ASS files remain for the parent's TV compatibility experiment.

Credentials are private on H:, absent from these artifacts. The transient diagnostic credential was rotated, the previous token was checked and rejected with HTTP 401, and a value-based scan found no current token/password in owned repository files. URL query strings are stripped from persisted playback-info responses. Sanitized engine logs contain no playable administrator ticket.

Reproduction commands and private-runtime precautions are in `apps/one-piece/companion/pilot/jellyfin/README.md`. Python and PowerShell harness syntax checks passed; the API, subtitle, HLS and codec probes above ran against real Archive originals. No frontend build/test applies to this experiment-only lane.

## Gaps and next gate

Not tested here: browser rendering/listening, WebVTT delivery, actual Cast/HDMI, phone sleep/control/reconnect, cross-source transition, mobile playback, three simultaneous sessions, trusted LAN HTTPS or failure recovery. The broader team owns those lanes. Episode 500/944/1000/1044/1085 were not expanded in this engine lane after the mandatory cold-caption gate failed.

Do not replace this failed path with an unapproved custom media server. Synthesize the independent browser/native and TV results first. A revised proposal may evaluate bounded automatic warm preparation, incremental subtitle extraction, or different engine input handling, with measured costs and startup behavior. The current evidence does not establish any of those alternatives as successful.
