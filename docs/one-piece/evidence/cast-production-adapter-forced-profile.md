# Forced-H.264 Cast follow-up

This supersedes the earlier open natural-transition verdict in the original hardware report. The new profile's functional sequence passes on the actual Sony, while performance acceptance remains open. Earlier failures remain preserved.

- [cast-production-adapter-attempt11-harness-branch-defect.json](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/evidence/cast-production-adapter-attempt11-harness-branch-defect.json): the focused timing block was accidentally nested inside an excluded branch. Real media loaded but the intended checks did not run. This repaired harness defect provides no seek or transition proof.
- [cast-production-adapter-attempt12-cast-profile-load-failure.json](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/evidence/cast-production-adapter-attempt12-cast-profile-load-failure.json): Sony fetched eight segments and WebVTT, but platform GET_STATUS raised `NotConnected` during LOAD confirmation. The Python PID stayed unchanged until intentional cleanup. This was not a worker restart or an established decoder failure. LOAD now retries transient connection exceptions within its existing18-second deadline, without re-sending LOAD or granting cached ownership.
- [cast-production-adapter-attempt13-transient-preseek-status.json](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/evidence/cast-production-adapter-attempt13-transient-preseek-status.json): LOAD and the six-second source1 baseline passed, including six real one-second polls. An unanswered GET_STATUS failed the first seek before SEEK was sent; the next poll succeeded. Read-only status queries now retry at most four times within the same three-second freshness window, still requiring a new actual raw MEDIA_STATUS.
- [cast-production-adapter-attempt14-cast-profile-functional-performance-miss.json](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/evidence/cast-production-adapter-attempt14-cast-profile-functional-performance-miss.json): all sixteen required functional stages passed. Actual Sony advanced naturally1000→1001 with the same lease/authority epoch, active English, Japanese2/full-English4 and actual HLS/video/WebVTT requests from both episodes. No manual next command was used. Source2 reached actual IDLE/FINISHED at1419.04s without its container's extra13.375s tail. Local return preserved1419.04s and the old Cast ticket returned404. Two seeks exceeded five seconds, so this run exits1 with `PerformanceTargetFailure`. All four cleanup checks passed; no18099/18100 listeners or FFmpeg/ffprobe children remained afterward.

| Attempt14 actual seek | Recovery to authoritative PLAYING | Five-second target |
| --- | ---: | --- |
| 1000 forward to900s | 4397ms | Pass |
| 1000 backward to600s | 2450ms | Pass |
| 1000 late to1418.79s | 6545ms | **Miss** |
| 1001 to600s after natural transition | 5758ms | **Miss** |
| 1001 late to1409.04s | 4058ms | Pass |

Attempt14 transferred69,248,277bytes in63 requests (62 receiver requests plus one old-ticket check). Receiver1000 fetched2 playlists/36 video segments/1 WebVTT;1001 fetched2 playlists/20 video segments/1 WebVTT. The guarded `PTI_CAST_FOCUS_TIMING=1` sequence now requires sixteen named successful stages, five measured seeks, explicit natural-transition evidence and correct source2 FINISHED state. Missing branches cannot pass. A seek over5000ms retains failed performance acceptance even when all functional stages complete.

The independent targeted command was:

```powershell
& 'H:/PTI-OnePiece/tools/node/node.exe' --test test/cast-transport.test.mjs test/cast-bridge.test.mjs test/cast-evidence.review.test.mjs
```

It passed15/15, including omitted-branch evidence rejection, bounded disconnected LOAD recovery, stale/foreign/raw-status negatives and no implicit receiver launch from refresh. Fixtures provide no hardware acceptance by themselves.

## Offline timing analysis

All times below are milliseconds from the respective seek RPC start. Exact wire SEEK-send timestamps were not instrumented in attempt14; command RPC time must not be relabelled pure admission delay.

| Seek | Command RPC | First segment start→complete | First PLAYING receipt | Client accepted PLAYING |
| --- | ---: | ---: | ---: | ---: |
| 1000→900 | 140 | 198→245 | 4134 | 4397 |
| 1000→600 | 133 | 171→258 | 2435 | 2450 |
| 1000→1418.79 | 1573 | 1627→3066 | 5348 | 6545 |
| 1001→600 | 120 | 189→1481 | 5742 | 5758 |
| 1001→1409.04 | 177 | 259→1239 | 4025 | 4058 |

Source2's5758ms miss included a prompt120ms command RPC, initial1292ms segment delivery, receiver buffering and a transient status connection outage. Reducing preflight alone cannot explain or solve it. Source1's late miss included1573ms command RPC and1439ms first-segment delivery. First authoritative PLAYING was already5348ms after the RPC start, so the miss cannot be dismissed as only client polling delay.

Both1000→900 and1001→600 had a mid-recovery `NotConnected` poll failure. Before the late1000 command there was another transient status failure. Safe traceback showed `MediaController.update_status()` entering its auto-launch path when a media namespace temporarily disappeared; this is a concrete read-only-status hazard, not proof it caused every earlier ownership loss.

The next offline repair changes refresh to guarded `send_message_nocheck(GET_STATUS)` with no launch path, and permits at most one second of actual raw command proof only when platform and media receipts, receiver session, media/transport identity, controller state, socket/namespace readiness and exact binding/context agree. Stale, changed, absent or disconnected proof falls back to fresh query. Tests cover missing namespace, foreign app, changed context/media/session, old platform proof and local reset notifications. Future hardware results must be recorded separately; attempt14 remains unchanged.

The hardware harness adds sanitized command-admission, refresh and actual `seek()` invocation timestamps. No URL, capability, token or exception message is emitted. Subsequent measured runs are recorded below; this instrumentation alone provides no hardware or sixty-minute acceptance.

## Optimized status and corrected readiness checks

Attempt15 ([cast-production-adapter-attempt15-advancing-proof-review.json](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/evidence/cast-production-adapter-attempt15-advancing-proof-review.json)) is explicitly **measurement-invalid**. Its unmodified raw first-PLAYING report is preserved in [cast-production-adapter-attempt15-raw-first-playing-unaccepted.json](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/evidence/cast-production-adapter-attempt15-raw-first-playing-unaccepted.json). Sony briefly reported PLAYING at exactly600s, then BUFFERING, then PLAYING with an advancing position. The former gate incorrectly called this220ms recovery. This is a harness readiness defect, not proof of fast playback. The reviewed current artifact records its raw exit0/outcome separately and rejects overall acceptance. Its natural transition and correct ending remain useful functional observations.

The corrected gate requires authoritative owned PLAYING on the expected episode **with receiver position more than0.15s beyond the target**, rather than a seek acknowledgement at the target. `test/cast-evidence.review.test.mjs` reproduces the early PLAYING→BUFFERING hazard. The latest independent targeted Cast/evidence suite passed **16/16**.

Attempt16 ([cast-production-adapter-attempt16-advancing-forced-performance-miss.json](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/evidence/cast-production-adapter-attempt16-advancing-forced-performance-miss.json)) uses this corrected gate and completes all sixteen required stages. It again proves actual natural1000→1001 with the same lease/authority epoch, active English, the correct1419.04s source2 FINISHED, local return and old-ticket404. It explicitly exits1 with `PerformanceTargetFailure` because late1000 recovery is5353ms.

| Attempt16 advancing-playback seek | Client recovery | Target |
| --- | ---: | --- |
| 1000 forward to900s | 4651ms | Pass |
| 1000 backward to600s | 2520ms | Pass |
| 1000 late to1418.79s | 5353ms | **Miss** |
| 1001 to600s after natural transition | 4894ms | Pass |
| 1001 late to1409.04s | 4437ms | Pass |

The late1000 phase record shows1422.718ms command admission (including `device()` recovery),52.681ms actual `seek()` call, then46.414ms fresh status check. Its first segment requested at1536ms completed at3032ms; first advancing PLAYING was recorded at4406ms, while the client accepted the awaited state at5353ms. These are different observations: the user-facing recovery metric remains5353ms. The source2 warm seek's admission reused fresh raw proof in0ms; actual seek took115.891ms and the first segment268→1921ms, with client advancement accepted4894ms. A fast engine-only request is not equivalent to end-to-end TV readiness.

Attempt16's initial already-prepared-local→TV Cast API load took10646ms. This is recorded separately and is **not a five-second warm-start pass**. Sony actually fetched2 playlists/36 segments/1 WebVTT for1000 and2 playlists/19 segments/1 WebVTT for1001; total61 receiver requests plus the one old-ticket check,67,713,821bytes. One Python PID81508 persisted until deliberate cleanup. Read-only status errors were retained as safe `CastError` diagnostics; no worker restart or foreign ownership was inferred. All four cleanup checks passed and an independent process/socket check found no18099/18100 listeners or FFmpeg/ffprobe children.

No1000-only copyTS2 policy has been adopted. That narrower counterfactual is staged only in the opt-in hardware harness (`PTI_CAST_COPY2_1000=1`, also requiring the full timing experiment). It changes `AllowVideoStreamCopy` only for1000's exact source and forced profile, leaves1001 forced, restores the wrapper in cleanup, and requires sanitized actual FFmpeg proof of1000 copy/2s and1001 NVENC/2s. Source/profile/host negative fixtures pass. The parent has held this unrun comparison while a separate full-MP4 pilot investigates the browser's concrete decode failure. Headless GOP alignment does not prove Sony behavior or compatibility of other source1 episodes.

Final offline hygiene at this handoff: **17/17** targeted Cast/evidence fixtures passed, production Python and hardware JavaScript syntax passed, all21 Cast JSON artifacts parsed, and none matched scoped capability-path or JWT patterns. This is a narrow leak-pattern check, not a general security certification. No new streams, engine jobs or TV actions were started during that hygiene pass. No sixty-minute capacity run has occurred.

## Limits

The media-profile lane owns forced-H.264/two-second HLS and selected-track duration corrections. Their headless decode/timestamp proof remains separate from actual Sony telemetry. Earlier human Japanese/English confirmations are not promoted into new human proof of this encoding. Synthetic technical identities are confined to the standalone harness: production Firebase, trusted HTTPS and PWA authorization are not verified here. Full-episode viewing, quantified subtitle timing, phone sleep/reconnection and long-duration reliability remain separate gates. The parent subsequently wired selected modes into the initially prepared capacity harness; it has not run yet.
