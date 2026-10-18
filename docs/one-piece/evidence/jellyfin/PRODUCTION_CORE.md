# Managed cache/media implementation evidence

This addendum follows the owner's approval of automatic selected/current-next preparation. It preserves the rejected remote-STRM experiment in the earlier README and cached comparison. It does not convert headless probes into visual, listening, TV, or complete release acceptance.

## Implemented surface

`apps/one-piece/companion/src/media/` contains the allowlisted Archive original downloader, MD5/size cache, shared finite preparation jobs, 20-GiB admission and output reservations, 2-GiB disk headroom, pinned current/next originals, three profile leases, dynamic Japanese/full-English track selection, private Jellyfin client, exact per-session resource graph, complete nested HLS URI rewriting helper, and queue preparation/adoption. It contains no network listener, browser Firebase credential, arbitrary source proxy, Windows service, or firewall rule.

The default compatible delivery copies H.264/AAC and converts later HEVC to H.264/AAC. A source-1 copy command and source-2 NVENC/CUDA command were observed in real logs, with Japanese source maps `0:1` and `0:2` respectively. Full English is exposed as WebVTT; embedded ASS metadata alone is insufficient. Optional HEVC/fMP4 remains disabled without explicit client/receiver verification.

`src/media/README.md` specifies integration and supervision; `runtime.mjs` returns a fresh dedicated loopback-only12.2 engine descriptor at port18097. The parent runtime lane owns creation, private credentials, process supervision, and startup. Tests here use the already isolated pilot18096 only and explicitly permit its historical libraries; production rejects unrelated libraries and scans only its finite managed local cache.

## Real originals and preparation

`production-core.json` records the new media core against the already verified episodes1/1001 and one approved bounded new episode1000 download. Prefetch was disabled in the experiment, so no1002 or other original was downloaded.

| Measurement | Actual result |
|---|---:|
| Episode1000 exact Archive bytes | 742,925,306 |
| Episode1000 MD5 | `ebeeadb99c7c1f27ba1f90aade7ccce1` |
| Episode1000 network download/integrity preparation | 167.218s; one180s attempt |
| Episode1000 total ready including that download | 169.517s |
| Cached1000→1001 same-lease transition ready | 1.030s |
| Episode1000/1001 full-English WebVTT cues | 233 /328 |
| Episode1/1001 actual selected tracks | Japanese1/fullEnglish2; Japanese2/fullEnglish4 |
| Three source2 NVENC post-ready first requests | 0.213–0.291s |
| Three simultaneous source2 seeks600/900/1200s | 1.278–2.037s |

Every ready state now waits for selected audio metadata, complete full-English WebVTT, and an actual first HLS segment, including any fMP4 initialization resource. The recorded `preparation.firstSegmentMs` is visible preparation cost, separate from the subsequent warm request. A fixture test blocks that segment and verifies readiness is withheld. The original earlier three-job first-start miss of5.417–5.829s is preserved in `production-core-before-first-segment-preparation.json`.

**Performance failures remain explicit:** the CPU baseline in `production-core.json` took38.936s to prepare cached1001; source1 copy-mode seek600s spiked to12.070s. No cause has been established for the source1 outlier. The focused cached-only repeat below passed, but that does not erase the observed failure or establish a latency guarantee. Initial original downloads remain minutes of automatic preparation, as accepted by the owner; they do not satisfy the original15-second cold target.

## Real receiver-queue backend comparison

`production-core-queue.json` comes from a separate cached-only harness whose downloader always rejects. On Node20.13.1, Jellyfin12.2/FFmpeg8.1.3, RTX4060 with driver617.14, it observed:

- Source1 copy-mode forward/backward seeks600/1200/60s:1.620/1.052/1.660s, H.264/AAC probed.
- Three viewing leases with six simultaneous FFmpeg children: three current1000 copy contexts and three next1001 HEVC→H.264 NVENC/CUDA contexts. Each used the correct Japanese map.
- Next context preparation including captions and first segment:1.402/1.837/1.920s. The current episode remained1000 during preparation.
- Simultaneous queued1001 seeks600/900/1200s:1.979/1.301/1.637s.
- Actual same-lease adoption of those already prepared master URLs:29–33ms, with previous current graphs retained briefly. This creates no duplicate next engine context.
- End-of-run accounted footprint3,787,973,322 bytes, no remaining reservations/pins/jobs, below21,474,836,480-byte limit. All probe encoders were stopped; pilot engine remains available on loopback for the parent until cleanup.

Six short active processes prove this bounded comparison only. They do not establish sustained six-context GPU capacity, thermal stability, network throughput across actual devices, or three viewers for60 minutes. Application-level reservations, throttling, segment deletion, and the watchdog are not a filesystem quota against an unbounded external process.

## Verification and gaps

The four fixture suites exercise synthetic tiny payloads, finite retry/cancellation, MD5/truncation/oversize, source and redirect restrictions, cache recovery/eviction/pinning/reservations, disk pressure, link refusal, dynamic tracks, admin-query stripping, nested manifest URI authorization, profile takeover, missing590, current/next queue coexistence/adoption, queued storage denial without interrupting current, and first-segment readiness. All23 tests passed. These are mocked transport/engine fixtures, not device proof.

Reproduce fixtures with:

```powershell
node --test apps/one-piece/companion/test/media-download.test.mjs apps/one-piece/companion/test/media-cache.test.mjs apps/one-piece/companion/test/media-jellyfin.test.mjs apps/one-piece/companion/test/media-coordinator.test.mjs
```

The real harnesses require the private H: pilot credentials/engine and verified cached files. `PTI_RUN_REAL_MEDIA=1` runs the cached1/1001 comparison; `PTI_RUN_TRANSITION_1000=1` additionally permits only the bounded1000 download if absent. `PTI_RUN_REAL_QUEUE=1` runs the no-download queue comparison. These are administrative reproducibility tools, never viewer actions.

An exact-value scan for the current private pilot token/password found zero matches in owned media source, tests, and evidence. Historical pilot diagnostic credentials were rotated/revoked as documented earlier. Engine URL authentication query values are never persisted or returned in this core's resource references.

Remaining acceptance: actual rendered and timed English subtitles with audible Japanese on browser/mobile/TV, production18097 bootstrap and process recovery, ticket/CORS/auth/API integration, real Cast control/sleep/reconnect/episode transition, HDMI, PWA installation/PTI routing, source failure recovery on actual devices, and60-minute three-viewer capacity. The unexplained12.070s source1 seek outlier remains open. No browser UI or actual TV validation is claimed by this lane.
