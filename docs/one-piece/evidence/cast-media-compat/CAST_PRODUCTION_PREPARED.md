# Final hardware mode: real production prepared coordinator

Status: **offline implementation ready; not run on the TV**. The corrected bounded header-admission implementation passed the actual concurrent two-minute smoke; the real capacity hour is running from 12:51:13.808 to an expected 13:51:13.808 UTC. Failed duration attempts 2–4 remain preserved. This mode still requires a separate actual production TV pass after capacity cleanup.

`test/production-prepared-pilot.mjs` wraps only lifecycle ownership around the actual `MediaCoordinator`, `MediaCache`, `JellyfinClient`, prepared-rendition implementation and strict static transport. It never replaces media methods or serves an exact-file stub. It reads the stopped production handoff, reuses the existing DPAPI process owner with the explicit Cast intent, uses `defaultMode: 'prepared-mp4'`, accounts all retained media roots under 20 GiB, disables automatic prefetch, and rejects every original download. The complete persisted 1000/1001 renditions must already exist. The old `prepared-pilot.mjs` and its TV evidence remain historical format tests.

After the parent grants exclusive engine/TV access, with the managed runtime stopped and the scoped firewall rule already proven:

```powershell
$env:PTI_RUN_REAL_CAST='1'
$env:PTI_CAST_PRODUCTION_PREPARED='1'
$env:PTI_CAST_FOCUS_TIMING='1'
Remove-Item Env:PTI_CAST_PREPARED_MP4 -ErrorAction SilentlyContinue
Remove-Item Env:PTI_CAST_MP4_OBSERVE_ONLY -ErrorAction SilentlyContinue
& H:/PTI-OnePiece/tools/node/node.exe apps/one-piece/companion/test/cast-real.mjs
```

Both prepared flags together are rejected. Default invocation starts no process, listener or TV operation. The existing busy/foreign-TV admission stays unchanged. The reviewed Python production worker and ownership logic are untouched. An added test-only diagnostic records actual raw media/platform receipt versions, ages and an exact fresh-owned proof boolean after owned commands; no raw URL, receiver session, token or authorization header is persisted.

The run requires seven command-to-fresh-advancing receiver seek measurements, full English resource fetches for both episodes, Japanese/full-English track provenance, pause/play/caption/volume controls, exact production queued-context adoption on natural 1000→1001, the selected true end of 1001, position-preserving return and old-ticket rejection. Complete-static URLs with queries are classified as video files. HTTP requests remain finite and production-mode transfers stop at 12 GiB. A fifteen-second control-HTTP gap followed by renewed reading verifies technical sender reconnection while the PC worker keeps polling and saving actual receiver progress. It is **not** physical phone sleep or background-app evidence.

New results go to `cast-production-prepared.json`; optional observation-only replays go to `cast-production-prepared-observations.json`. Earlier `cast-prepared-mp4*.json` files cannot be overwritten by the new mode. The production mode uses explicitly labelled 30-second TV stability telemetry. Prior timed human Japanese/English observations can be referenced through `human-production-lineage.json` only after comparing the actual current cache records' exact video/caption hashes, sizes, cue counts and original selections; changed payloads fail that check. This does not create a new human reply, fresh full-file rehash or quantified subtitle-sync proof. Current production transport/control tests remain mandatory. Firebase identities and control HTTPS/PWA remain synthetic/unverified in this standalone hardware harness.

Offline verification: Node syntax checks, embedded diagnostic Python compilation, guarded default skip, and fourteen focused ownership/intent/parser/timing/resource-classification/raw-proof/lineage fixtures passed, including a monotonic-hour check. These checks start no engine and do not establish a TV pass. Full-hour capacity and the final actual receiver test remain required.
