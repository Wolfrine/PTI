# Studio live progress and current PC resources

Owner-authorized scope: existing default Firestore only; preserve private owner/device authority, generation, saved-output recovery, archive, Drive and `b8f51ed` terminal precedence. No database, service, inference setting or Python network capability was added. Main-only delivery preserves the unrelated dirty Research rules, workflow line and untracked Research files.

Studio uses the full Firestore SDK with four fixed owner-scoped subscriptions: `status/pc`, the pinned device, recent jobs ordered by `createdAt` descending with limit 4, and pending status membership with limit 20. Recovery is conditional. Missing active jobs, up to four unfinished historical imports, and up to twenty displaced pending records receive deduplicated targeted watches. Terminal evidence cannot regress through another query's older snapshot. Failed streams wait for explicit refresh/reconnect; snapshot callbacks and local ticks do not create a retry timer. Logout, PIN lock, hidden document, leaving Studio, pagehide and destroy detach streams. Archive/media/feedback reads remain demand-driven.

These two job queries use existing single-field indexes; no composite/range query or new index deployment is required. An active document in both queries can incur two listener reads per update. SDK memory caching remains the default; reopening/reconnecting can charge another initial query. See the [Firestore listener and billing contract](https://firebase.google.com/docs/firestore/pricing#listening_to_query_results). Figures below are an application-operation estimate, not measured billing or a savings claim.

## Fifteen-minute budget

Assume one visible Studio, four recent records, one active job, no other owner actions, no reconnects, eight distinct stages, forty actual Qwen sampler callbacks, and fifteen ordinary worker heartbeats. Exclude image/reference chunks, archive/user-action reads and unchanged queue/revocation checks. Count security-rule dependent reads separately from application requests.

| Application operations | Before | After |
| --- | --- | --- |
| Owner status/jobs reads | About 420: 60 polls × (status 1 + device 1 + recent 4 + pending 1) | About 110–120: initial bounded snapshot, heartbeats, up to 90 overlapping telemetry deliveries and terminal/membership changes |
| Additional worker claim GETs for telemetry | 0 | About 45, each guarding one progress PATCH with an update-time precondition |
| Progress writes | About 46: 40 steps + 5 Python stage events + publishing | At most about 45 for this linear-stage scenario: 36 periodic opportunities + initial + 7 transitions + final flush; coalescing may reduce this |
| Other status/claim/terminal writes | About 17 | About 17, unchanged |
| Studio hidden | About 105 owner reads at the former 60-second interval | No attached Studio listeners or clock; reopening incurs initial reads |

The previous pending limit can raise a visible interval to 26 document reads (1,560 across 60 polls), with recovery/active/history reads additional. The new 25-second rate limits sampling bursts and adds useful freshness during long CPU encoding; it does not promise fewer total progress writes for every fifteen-minute job. Each telemetry claim GET and PATCH can also require an approved-device rules dependency read. The worker's existing queue listeners may receive progress events even though those events do not trigger queue sweeps. Rules dependencies, reconnects and other clients must be included in any actual billing audit; no Monitoring/billing measurements were taken.

## Worker and privacy

Worker 2.3.1 samples whole-PC CPU deltas/RAM and GPU 0 utilization/VRAM/temperature locally every five seconds while an attempt is active. `nvidia-smi` has fixed arguments, no shell, hidden window, 2-second timeout and bounded output. Failures yield null readings. Compact progress snapshots publish every 25 seconds and on meaningful stages, with epoch timestamps, completed stage durations and sampling-only real counters. No ETA or overall percent. No idle metrics or cloud resource history.

All progress writes serialize/coalesce, retain the claim precondition and change only `progress`. Stop drains before failed/completed writes. Saved outputs still resume publishing without resampling. Rules accept the additive bounded payload only from the approved pinned device; owner reads and immutable request fields retain their former authority. Validation uses scalar aliases to remain inside Firestore's expression limit. Legacy progress and full ten-reference completion remain covered.

## Rendered refinement and acceptance

Central 0.2.3 / `d097786cf3d6c5a2859439112afdd39538316567`; retain the Photographic Atelier direction. Designer: native Studio lane. Critic: separate native read-only reviewer. Parent: integration and QA. Initial renders and stale/offline fixtures were reviewed; timestamp consistency, disclosure focus, cached freshness, teardown/remount and stale clocks were corrected and rerendered.

Independent critic: **8.4/10** overall, hierarchy 8.6, phone compactness 8.1, dark identity 8.7. Parent: hierarchy 8.5, compactness 8.5, identity 8.6. Compared with actual matched `b8f51ed` renders: progress understanding better; palette/type unchanged; composer reach worse while active (phone prompt roughly 180px lower and desktop active state stacked). Parent accepts that bounded waiting-state tradeoff: progress is primary while Generate is unavailable, and the card disappears on terminal state. Completed photographic media was not visually accepted by this active-state fixture. This is **agent-reviewed**, not owner acceptance.

Actual Chrome coverage: 1440×900, 390×844 and 360×800; encoding, sampling, publishing, unavailable/stale/offline readings, expanded stage times, failure and idle. No horizontal overflow or fixture page errors. Local timing preserves disclosure focus and freezes at the last report when freshness is uncertain. The 65-second virtual-clock check creates no new reads/subscriptions. Terminal regressions verify that Generate recovers before a stale generating heartbeat clears.

Evidence: `F:\Workspace\Codex\2026-11-04\velum-live-progress\outputs` contains builder, parent and independent Chrome captures, parent interaction evidence, `independent-review.md` and test logs. Fixtures use synthetic state without private photos, Firebase writes or inference. A separate real read-only local resource probe succeeded; that is not a live cloud telemetry roundtrip. Deployment/runtime outcomes are reported by the delivery turn, not inferred from these fixture results.

Pre-delivery checks passed: 173 committed Gallery tests (including real Chrome fixtures, zero skips), 52 worker tests, 26 rules tests against the exact staged rules with unrelated Research additions excluded, 107 PTI frontend tests, PTI build and Home contract. The wider dirty-worktree rules run also passed 34 tests. Expanded rules tests include 119 additional scalar/shape boundary decisions. Build retains unrelated existing warnings. Native worker Python CPU tests passed 9/9; no new image generation was used for acceptance.
