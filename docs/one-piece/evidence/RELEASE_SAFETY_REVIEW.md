# Independent release safety review — 18 October 2026

Scope: the current `codex/one-piece-family` implementation, private authorization/media transport, complete PTI Hosting artifact, and companion release/rollback. This is source and focused regression review, not acceptance of the rendered app, physical devices, production Firebase pairing, or a deployment.

**Verdict:** the initial and subsequent source findings recorded below were corrected and independently checked in their stated scope. No unresolved source-level blocker remains in this review. Actual committed H release activation/rollback, live Hosting preservation, old-worker upgrade and authenticated family/device validation remain release gates. No service, task, receiver or production data was changed by this reviewer.

## Findings and closure

### 1. Disabled households still authorized an active invited member — fixed

Before the fix, `FamilyAccess.requireMember()` read only `members/<verified email>` for a nonowner and accepted an active, UID-bound member. `personal-harness/firestore.rules:47` intentionally permits a verified viewer to read their own invitation even while the workspace is disabled. That invitation response therefore did not prove an active household. Both live API admission and periodic PC credential authorization used this method.

An isolated reproduction called the real `FamilyAccess` class with synthetic REST responses and obtained `role: member`; only the member URL was requested, with no workspace request. No live account or Firestore record was used.

The parent fixed `apps/one-piece/companion/src/auth.mjs:153`: after checking the claimed membership, normal playback authorization now separately reads the workspace with the caller's Firebase token and requires the configured `ownerUid` and `active: true`. A denied, missing, malformed or unavailable workspace cannot grant playback. Pending invitation metadata is still distinct from playback access.

Independent replay after the fix:

| Synthetic workspace response | Outcome | Requests |
|---|---|---:|
| `active:false`, correct owner | `family-unavailable` | 2 |
| HTTP 403 | `family-unavailable` | 2 |
| Wrong owner | `family-unavailable` | 2 |
| `active:true`, correct owner | Member admitted | 2 |

The added auth and retained-viewer regressions pass. Cached authorization remains deliberately bounded to 60 seconds; this is not an instantaneous network revocation claim.

### 2. Activation could race a recovering launcher with no supervisor PID — hardened, operational test outstanding

Previously `stop-runtime.ps1` returned `alreadyStopped` as soon as the recorded supervisor PID was absent. `src/runtime/release.mjs` made the same single-PID check. The stable launcher may still be running its documented 1–30 second retry delay, so that state did not establish that code/configuration could be switched safely.

With explicit parent agreement, this reviewer changed only:

- `apps/one-piece/companion/scripts/stop-runtime.ps1`: verify the exact pinned task action, attempt graceful supervisor shutdown first, stop the remaining verified scheduled task, then require no launcher/supervisor, no recorded child processes and no relevant listener. A remaining orphan or foreign task/process causes refusal. No unverified PID is force-killed. The command writes a private configuration-hash-bound stop proof.
- `apps/one-piece/companion/src/runtime/release.mjs:18`: shared activation, including `package-release.mjs --activate`, requires that proof to be at most five minutes old and re-inspects task/process/listener state independently before mutation. Missing proof, changed config, active/queued task, recovering launcher or remaining child/listener fails closed.
- `apps/one-piece/companion/scripts/activate-release.mjs`: expose the useful `stop-runtime-before-activation` failure without dumping private diagnostics.
- `test/runtime-release.test.mjs`, `test/runtime-stop.test.mjs`: pure guard cases plus seven Windows stop scenarios; the real PowerShell inspection string also executes against mocked OS commands.

The initial checks were deterministic fixtures. A subsequent parent-authorized **actual already-stopped** validation is recorded below; active shutdown and final-package activation remain untested by this reviewer. During controlled release, run the hardened stop command, inspect its success/proof, activate promptly, and start/verify the selected task. If activation reports an expired proof, run stop again. Never replace that refusal with a PID-only check.

## Inspected safeguards

| Area | Evidence inspected | Conclusion within source-review scope |
|---|---|---|
| Legacy grant overlap | `personal-harness/firestore.rules:6–9,13–105` | `users` is excluded from top-level recursion; `onePieceData` is explicitly excluded from the permissive user descendant rule. Unknown One Piece descendants remain denied. |
| Family invitation isolation | Rules `google/admin/active/self`, immutable claim, self progress/lease checks; `auth.mjs`; `viewer-credentials.mjs` | Verified Google email and UID are required; an invitation cannot bind another UID or elevate itself. Owner administration does not read another viewer's progress/lease. Workspace suspension now also reaches PC media authorization. |
| HTTPS credentials | `api.mjs:33–44`, `runtime/setup.mjs:59–81`, `viewer-credentials.mjs`, `dpapi.mjs` | Controls require loopback trusted-proxy proof, forwarded HTTPS, exact approved Origin and verified Firebase identity. Fresh provider exchange and CurrentUser DPAPI remain server-side. No Admin credential is passed to the browser/TV. |
| LAN HTTP capabilities | `server.mjs:51–58`, `api.mjs:243–279`, `tickets.mjs`, `media/jellyfin.mjs:139–155,187–219` | HTTP accepts only scoped media resources for the current Cast lease; Firebase credentials/cookies and arbitrary API/proxy paths are rejected. Random 192-bit tickets bind profile/session/generation/epoch/episode/resource, expire within two hours, and revoke on authority/session changes. Nested HLS references are constrained to the private engine's inspected resource graph. |
| Hosting preservation | `firebase.json`, `.github/workflows/firebase-deploy.yml:28–51,78–89,128–130`, build integration tests | The sub-app extends the complete Angular default artifact. Other Hosting targets and legacy food routes remain present. A missing root artifact is a build failure. Companion/private/media directories are not copied into Hosting. |
| Worker boundaries | `pti-app/ngsw-config.json`, `login-return.ts:28–37`, `web/sw.js`, `web/src/app.mjs:194–197`, `scripts/build.mjs:37–46` | New root navigation excludes the child. Allowlisted launcher/login navigation uses the root worker's bypass marker once. Child worker caches only its explicit public shell; content-derived versions permit updates. Installed old-worker behavior still needs actual browser validation. |
| Rules release guard | `personal-functions/provision.mjs:13–44`, workflow line128 | Exact reviewed predecessor source is supplied; the existing live-hash and release-race checks remain. A different active predecessor refuses deployment. No production rules read/write was performed by this reviewer. |
| H package | `runtime/release.mjs` and `ONEPIECE_RUNTIME.md:62–77` | Selected clean committed Git blobs and pinned dependency bytes are copied with integrity manifest; private identity/configuration, media and cache stay outside releases. Actual final committed packaging, activation and rollback are not yet evidence. |

The HTTP capability design implements the owner's explicit transport approval. It does not provide LAN confidentiality: a traffic observer could replay a captured ticket until expiry/revocation. That known limit is not hidden by CORS. Sender-sleep and long pause/expiry behavior require actual receiver checks.

## Verification executed by this reviewer

From the owning worktree:

```powershell
H:/PTI-OnePiece/tools/node/node.exe --test `
 apps/one-piece/companion/test/auth.test.mjs `
 apps/one-piece/companion/test/viewer-credentials.test.mjs `
 apps/one-piece/companion/test/api.test.mjs `
 apps/one-piece/companion/test/tickets.test.mjs `
 apps/one-piece/companion/test/runtime-release.test.mjs `
 apps/one-piece/companion/test/runtime-stop.test.mjs `
 apps/one-piece/tests/auth-return.test.mjs `
 apps/one-piece/tests/integration.test.mjs
```

**40/40 passed**, no skipped tests. The API test uses an actual loopback HTTP server but synthetic identities, engine responses and media payloads. Auth signatures are locally generated fixtures. Build checks use a temporary complete-root fixture. The Windows DPAPI test is a real CurrentUser roundtrip/ACL/entropy check with a nonsecret temporary canary. The new stop command test uses seven mocked Windows scenarios; no real task/service was stopped. Its initial test-only script-policy failure was resolved by a child-process-only execution-policy flag; no machine policy changed.

Parent-reported full companion/app/emulator results were read for context; they are not claimed as independently re-executed here. Physical TV/visual QA belongs to the other review lanes. No shared Chrome access, deployment or production-data scan occurred.

A separate **read-only actual Windows inspection** at `2026-10-18T09:29:33.648Z` executed the activation's real PowerShell query: launcher/supervisor/recorded-process/listening-port counts were all zero and the selected task was `Ready`. This validates that the query can run in the actual account. It neither writes the required stop proof nor proves stop/activation/rollback behavior, and the result may change when the companion restarts.

## Actual already-stopped operational follow-up

At the parent's explicit request, the reviewer ran the hardened command against the actual **already-stopped** managed installation, after first confirming task `Ready` and zero listeners on8443/18097/18098/18099. Exact command:

```powershell
& (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe') `
 -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass `
 -File 'F:/Workspace/Worktrees/PTI/one-piece-family/apps/one-piece/companion/scripts/stop-runtime.ps1'
```

The command exited0 at **10:13:52.6662005Z** and wrote the real private stop proof. A separate readback at **10:15:29.9687900Z** confirmed task `Ready`, exact pinned Node/launcher/working-directory task bindings, zero launcher/supervisor/recorded-process/listener counts, and a matching configuration hash. The proof was97.302seconds old at readback, within its five-minute acceptance window. [Sanitized actual result](runtime/already-stopped-release-guard.json) is retained; a later activation must run stop again if the proof has expired.

No process/task was killed because the installation was already stopped. The reviewer did not start the runtime, package/activate anything, change pilot18096, touch the TV/browser, transfer secrets or modify permanent execution policy. This proves the real already-stopped path and proof persistence/readback; it does not prove active-session termination, release activation or rollback.

The same artifact includes sanitized fields from the existing elevated firewall installation/readback proof at **09:10:05.0344016Z**: all three scoped rules and their configured program matches. A new standard-account `Get-NetFirewallRule -Name PTI-OnePiece-HTTPS-LAN-v1 -ErrorAction Stop` readback returned **Access is denied**. No elevation was attempted. The historical verified installation is documented as such; no fresh elevated firewall check is claimed.

The follow-up also reran `runtime-config.test.mjs`, `runtime-supervisor.test.mjs`, `runtime-release.test.mjs` and `runtime-stop.test.mjs`: **13/13 passed**. Structured evidence assertions and explicit exclusion of the configured Firebase API key, bearer/refresh tokens, ciphertext and private keys passed. Documentation diff whitespace checks passed.

## Controlled release and rollback requirements

Before promotion, record the current default Hosting **release ID and version ID**, the candidate commit, complete artifact hashes, current rules source/hash and retained H release manifests. Keep the previous Hosting version and a tested H version available. Coordinate with other deploys; do not roll over a newer unrelated release.

For website rollback, select **only the default site `pti-app-2ab59`**. Firebase's documented Hosting Release history → previous release → **Roll back** creates a new release using that retained version. A release operator with the existing authenticated CLI can equivalently use the retained version ID:

```text
firebase hosting:clone "pti-app-2ab59:@RETAINED_VERSION_ID" "pti-app-2ab59:live" --project pti-app-2ab59
```

`RETAINED_VERSION_ID` is a recorded real version, not a value to guess. This is a Hosting-only action; it was **not executed**. Verify the resulting release and live root/sibling assets afterward. This procedure follows [Firebase's Hosting version and rollback documentation](https://firebase.google.com/docs/hosting/manage-hosting-resources).

**Preserve the new Firestore rules on a website rollback.** A blind old-commit rules rollback would remove the `onePieceData` legacy-wildcard exclusion and expose retained family records to the old broad signed-in grant. Do not rerun an old full deployment workflow or remove this exclusion to make a rollback pass. Keep family data, UID bindings and progress intact. A rules defect needs a separately reviewed source change that retains the namespace exclusion, emulator checks, and exact predecessor/race guards.

For companion rollback, first run the hardened stop command and require its success. Activate a retained, integrity-verified **H release** by its exact 40-character commit, then restart `PTI-OnePiece-Companion` and run `verify-runtime.mjs`. The activation guard applies equally to rollback. Credentials/progress/cache remain in their existing external protected paths. An F-worktree config is not the final retained-runtime rollback target. If no previous H package exists for this first release, create/verify the retained H baseline before claiming rollback readiness.

The five-minute stop proof must correspond to the current configuration; activation changes that configuration, so every later rollback needs a new stop proof. Record actual package/activation/rollback and live Hosting verification results before calling release accepted. Keep physical Android install/trust, real authenticated playback, old-worker upgrade, receiver behavior and three-session duration gaps explicit until their own evidence exists.

## Independent delta review — Cast profile and selected-track duration

The parent requested a narrow read-only review while the separate Sony hardware timing pilot was active. Reviewed `api.mjs` destination-mode handoff, `server.mjs` bundled ffprobe path, `media/timing.mjs`, `media/jellyfin.mjs` selected duration/Cast profile/manifest trimming, relevant coordinator/authority behavior and focused tests. No production source was edited by this reviewer in this lane.

**Concrete bound finding — corrected and independently closed:** `timing.mjs` initially bounded `stream.duration` to four hours but did not bound the resulting `duration + start_time`. Calling the real pure `inspectSelectedTiming()` with synthetic video/audio `duration:'10'`, `start_time:'20000'` and matching tail packets returned `effectiveDurationSeconds:20010`, above `MAX_SECONDS:14400`. This was a malformed-metadata guard defect; no current Archive file is claimed to trigger it.

The parent fixed the owning source and tests. `streamEnd()` now requires a finite bounded start and a finite computed/tagged end greater than `max(0,start)` and no greater than four hours. The selected observed packet end also cannot exceed that bound. Packet collections must be arrays with at most8192 entries before the spread/max calculation. Independent replay of the exact20,010-second case now rejects with `TIMING_UNVERIFIED`; starts14399/NaN/Infinity/−Infinity and non-array/8193-entry packet collections also reject. Valid10-second and exact14,400-second boundary cases still succeed. **No source-level blocker remains in this inspected delta.** This does not change the separate device/native-process acceptance limits below.

The inspected destination handoff selects `cast-h264` before receiver LOAD and restores `compatible-h264` on local return/failure. It resolves selected language again rather than reusing a source-specific numeric index. The existing `setDestination()` authority rotation revokes previous capabilities before new mode preparation; fresh media references still pass the same episode/resource/current-authority checks. No new credentials, source URLs or private probe paths enter `safeState()`.

The timing inspector accepts only a canonical regular file within the managed original root and spawns the configured bundled ffprobe without a shell or caller-supplied URL. It limits output to2MiB, has a15second child timeout and propagates cancellation. Metadata and selected video/audio tail intervals are shared by file/mtime/size/track key in a bounded24-entry map. These are inspected safeguards; actual native-probe cancellation/timeout and real cached timing remain separate validation, not outcomes of the injected-probe fixtures.

Manifest trimming acts only on finite VOD playlists containing segment durations and ENDLIST. Master/in-progress manifests are preserved. Removed tail resources do not enter the authorized graph. Timestamp/sequence headers and retained indices are preserved in the current fixture. Receiver rendering, subtitle timing, aligned-keyframe performance and actual source transitions are the hardware lane's responsibility; this source review cannot establish them.

Lightweight command executed:

```powershell
H:/PTI-OnePiece/tools/node/node.exe --test `
 --test-name-pattern 'selected Japanese|VOD tail|cached timing|destination handoff|failed receiver|Cast uses|unselected audio tail' `
 apps/one-piece/companion/test/media-timing.test.mjs `
 apps/one-piece/companion/test/media-jellyfin.test.mjs `
 apps/one-piece/companion/test/api.test.mjs
```

**8/8 passed**, no skipped tests,695.6404ms suite duration. HTTP tests use loopback fixture servers; media/timing/profile/manifest data and probe execution are explicit fixtures, with a real temporary filesystem symlink refusal check. No engine, ffprobe, encoder, TV/browser, deployment or production data operation ran. At that initial checkpoint, the separate pure upper-bound reproduction still failed despite those existing tests passing.

After the bound fix, this reviewer independently ran:

```powershell
H:/PTI-OnePiece/tools/node/node.exe --test `
 apps/one-piece/companion/test/media-timing.test.mjs `
 apps/one-piece/companion/test/api.test.mjs
```

**10/10 passed**, no skipped tests,1153.6475ms suite duration. A separate pure-function replay covered the original defect plus all seven negative cases and the two valid boundaries above. All native probes remain injected fixtures; no engine/TV/browser was used.

Reviewed file SHA256 values after the fix (working-file bytes):

| File under `apps/one-piece/companion/src/` | SHA256 |
|---|---|
| `media/timing.mjs` | `62022ab428039f9236357d3d4db48a0c2df92b5cf4feccdbbffc97c458ae4bd7` |
| `media/jellyfin.mjs` | `44fd89812800120b823c60e872d77a9453cb91bffc32bab818db64dcff54f549` |
| `api.mjs` | `9a2bf16eca16ae7e44f0536655bc5834f6d2e7ca9d20d3993be642159e439cae` |
| `server.mjs` | `3eaf17c76621ff30f5a6b384966899967d56f9ba57b6da4d5323bc200fb96e00` |

## Independent delta review — bounded routine-control membership cache

The parent requested a separate source review and the six light API tests for the new positive membership cache. No engine/TV/browser or production source change was made by this reviewer.

Inspected intended safeguards: Firebase identity/signature/expiry verification still precedes every cache lookup; the key includes the fixed owner UID, verified viewer UID and verified email. Values contain only role and check time, with at most32 entries. Cache hits do not refresh the timestamp; the exact60,000ms boundary and a backwards clock require a fresh check. Pairing/setup/session creation/episode selection/handoff/delivery routes normally use fresh `FamilyAccess`. `ViewerCredentials` still calls `FamilyAccess` directly, so its separate60-second media authorization cache does not reuse or stack this API cache.

**Two concrete pre-fix findings were returned to the parent:**

1. **An in-flight positive could repopulate after a fresh denial.** A pure reproduction using the real `CompanionApi.actor()` held requestA's successful family response, made requestB fail a fresh admission with `not-invited` (deleting the key), then releasedA. RequestC's routine access returned `role:member` from a reinserted entry, with only two membership reads total. This does not show a TTL longer than60 seconds; it shows that a known authoritative failure did not keep the old positive invalidated under concurrency.
2. **`cast-command next` was treated as routine cached control.** An in-memory `Readable` request/response reproduction using actual `control()` first seeded positive membership through GETprogress, then blocked the family. POSTcast-command with `action:'next'` returned200 and invoked the queue once without another family check (one read total). This is within the approved TTL but conflicts with the stated requirement that explicit episode admission remains fresh. Other ordinary play/pause/seek/volume controls can retain the bounded policy.

The initial API suite passed **6/6**, no skips,1253.4735ms; those tests use synthetic identities/media and loopback fixture HTTP, not real Firebase or playback. The two additional reproductions above were pure/in-memory with no sockets or native processes. Those passing existing tests did not close the two findings.

A separate pure bounds replay made40 verified synthetic identities and confirmed exactly32 retained entries, oldest-entry eviction, and role/check-time-only values. Further calls confirmed cache reuse at59,999ms, fresh checks at60,000ms or after a backwards clock, and separate checks after a verified-email or configured-owner change. This used45 identity checks/44 membership calls, with no network/native work. These passing bounds do not close the concurrent invalidation or explicit-next findings above.

### Cache corrections independently closed

The parent added a bounded64-entry pending-check map with unique object tokens. A later fresh read supersedes the older in-flight result. A superseded positive fails with503 and cannot restore its cache entry; a superseded failure cannot clear a newer grant. Tokens remain distinct even after map eviction and key reuse. Explicit `cast-command next` now performs a fresh actor check after parsing the action and before queue preparation or receiver commands.

Independent exact replay now rejects the formerly late positive with `membership-unavailable`; the following routine request is denied, with three total membership reads and zero positive/pending entries. The in-memory Cast-next replay now returns403 with zero queue calls. The updated API suite passed **9/9**, no skips,1796.5261ms, including deferred results in both orderings and the actual fixture-HTTP next denial.

A further pure70-request concurrency replay confirmed at most64 pending checks. The six evicted checks failed closed with `membership-unavailable`;64 retained checks succeeded, leaving zero pending and32 positive entries. No native process, socket, engine or TV was used for this bounds replay. **Both reported cache findings are closed in the inspected source.** Transient503 from a superseded check is intentional fail-closed behavior; these fixtures do not establish browser retry UX or real Firebase latency/read counts.

### Self-revocation/logout edge independently closed

The original `DELETE /api/pair-viewer` reached full-family admission before self-cleanup. A verified blocked viewer received403 without credential/ticket/lease revocation, while the UI accepted403 and signed out locally. This was a cleanup gap; it did not demonstrate a bypass of media membership checks.

The parent moved this one route before family admission while retaining the same HTTPS gateway, verified Firebase/Google JWT and configured-household requirement. It derives UID only from the verified identity, rejects nonempty bodies/transfer encoding, revokes only that UID's credential/tickets/active lease and invalidates its positive/pending membership checks before and after cleanup. Progress, preferences, other users and family roles remain intact; no other route gains membership-free admission. `API.md` now records these semantics.

Independent in-memory replay confirmed successful cleanup without consulting the denying/unavailable family service, preserved the other viewer and progress, rejected forged-UID body/transfer encoding/invalid JWT/untrusted Origin, cleared both caches and accepted idempotent repetition. The reviewer also ran `api.test.mjs` plus `media-cache.test.mjs`: **16/16 passed**, no skips,1682.5866ms. The new fixture-HTTP regression checks blocked/outage cleanup, old-ticket404, another profile's unchanged lease and rejection of a held older positive. The cache concurrency fixture now uses a two-start barrier rather than a20ms timing assumption. No real credential was inspected/deleted and no engine/TV/browser was used.

Latest reviewed `api.mjs` working-file SHA256: `e1a2423c638b66efe4025fc9b2ef6e79e6ef7c51d1bf1ad61804035793b4f712`. **No unresolved source blocker remains in these cache/self-revocation deltas.**

The parent separately reports the current full companion run at **118/118 passed**, including its real Windows DPAPI canary, and frontend/integration/auth-return at **32/32 passed**. Those broader runs were not re-executed by this reviewer. Real Google owner/viewer pairing, physical-device family/PWA acceptance and final release/rollback acceptance remain explicitly unverified by these source/fixture checks.

## Planned artifact snapshot audit

[Sanitized inventory and pattern audit](release-artifact-audit.json): **471 files,11,987,892bytes** under planned One Piece app/docs plus shared changes relative to base24b4805. Largest file is the1,729,719-byte source catalogue; app files total1,339,074bytes and docs/evidence10,562,382bytes. No unreasonable artifact size was identified. Dependencies and the nested `pti-app/pti-app/node_modules` junction were excluded entirely; links were not followed. No protected H runtime secret content was inspected and no staging/deletion occurred.

**Zero unresolved credential/capability findings**, zero actual-video container signatures and zero media/runtime binary extensions. Expected matches were the public Firebase client key, approved public CA certificate, fake/interpolated assertion data, an npm dependency version and an unquoted function reference. Public Archive metadata and bounded screenshots/runtime diagnostics are source/evidence material, not media rehosting. No suspected secret value is printed in this report or inventory.

This is a mutable snapshot: the media lane may add/change opt-in harness/evidence afterward, and the audit's own inventory file is excluded from its count. Raster screenshots/fonts were inventoried, not OCR-secret-scanned. Repeat a targeted check after source/evidence freeze and before explicit-path staging; this is not immutable release signoff.

## Conditional long static-MP4 response review

At this recommendation checkpoint no static transport implementation had been accepted in this lane. The parent reported the isolated MP4 pilot's range/HTTP-decode gates passed; actual Sony/application acceptance remains separate. The later helper implementation checkpoint is recorded below.

The narrow seam is the existing ticketed `CompanionApi.mediaRequest()` → `MediaCoordinator.getPlaybackResource()` response. A prepared MP4 must remain an opaque, admitted resource in that graph, with its real content type/range metadata and cache pin; do not expose raw paths or arbitrary proxy inputs. Keep the same verified profile/session/generation/authority/episode binding. The current HLS first-request authorization plus32MiB resource limit/30second engine-body timeout is not sufficient for a long MP4.

Use a bounded-backpressure pipeline with a per-response abort controller. Gate outbound chunks through the existing `ViewerCredentials.getAuthorized(uid)` and current ticket/lease checks; reuse its canonical60second membership policy, with no API-role cache or second `lastCheck+60s` grant. While a fresh membership check is pending, do not continue emitting unchecked bytes. A low-cost idle watchdog can also detect lost authority while a client is backpressured, without creating a second authorization TTL. Connect session/authority/sign-out revocation to immediate abort of registered responses; enforce the exact ticket expiry separately. Once headers are sent, revocation destroys the response rather than appending JSON to video bytes.

For static files, replace the engine's whole-body30second deadline with bounded open/header/read-wait handling plus client-close/revocation cancellation. A legitimate slow or paused response must not time out merely because total playback exceeds30seconds. Never buffer the complete MP4; preserve range/HEAD semantics and close the file/release response resources on every outcome.

Before integration acceptance, focused tests should prove: a slow body exceeds30seconds; exact bounded206/HEAD and malformed-range416 behavior; backpressure keeps memory bounded; ticket expiry/session replacement/destination change/self-unpair abort mid-body; membership denial/outage pauses then closes before further chunks; actual fresh checks use the existing provider without stacked TTLs; client cancellation closes the file; revoked responses cannot resume with the old ticket; and concurrent authorized readers retain the bounded cache pin. Use fake clocks/deferred chunks for security/timeout tests, then real receiver range/subtitle/seek tests separately. No engine, TV or browser action ran for this recommendation.

### Static transport helper implementation checkpoint

The parent subsequently assigned this reviewer only `media/static-resource.mjs` and `test/media-static-resource.test.mjs`. The helper accepts a canonical literal-loopback HTTP origin and the exact GUID static-MP4 route with only `Static=true`/`MediaSourceId`. It validates the known file length, exact200/206 headers and bounded single ranges, refuses redirects, caps emitted bytes and detects truncation. HEAD ignores Range and returns full200 metadata without a body. Per-header/read waits are bounded; an idle-read timer runs only during an upstream read, with a separate four-hour maximum lifetime. Caller/consumer cancellation closes upstream and removes listeners. Authorization remains the existing API/coordinator's responsibility; the helper adds no membership cache.

`H:/PTI-OnePiece/tools/node/node.exe --test apps/one-piece/companion/test/media-static-resource.test.mjs` passed **15/15**, zero skipped,609.548ms. These are fake streams, including short injected deadlines and a slow/backpressured consumer; they do not establish real multi-hour transfer, API revocation enforcement or receiver playback. Source SHA256 at this checkpoint: `062eedd5499896ba2baed68d1cf977510936274df0eee8f0210e7ece1aeaf97f`.

## Cast LOAD confirmation review and fail-closed correction

The read-only review initially reproduced a concrete gap despite **17/17** existing focused Cast tests passing: `refresh()` accepted a new raw message/listener pair even when it contained no evidence for the cached media. New empty `status:[]`, a partial row with foreign `mediaSessionId:999` and no content, and uncertain `media:[]` each confirmed owned PLAYING from cached fields. The installed published `pychromecast/controllers/media.py` corroborates the fixture behavior: `MediaStatus.update()`307–327 preserves unchanged fields on empty/partial messages, and `_process_media_status()`727–739 still notifies listeners.

With narrow parent authorization, this reviewer changed `src/cast-bridge.py` confirmation/admission and extended `test/cast-transport.test.mjs`. LOAD success, post-refresh command/status admission and command confirmation now require the existing `recent_admitted()` raw/platform proof: exact content digest, media session/state, captured receiver session, transport, namespace, connected socket and fresh unambiguous receipts. Cached ownership alone cannot grant a new no-takeover LOAD. The existing two-new-empty-raw observation rule still permits an actually empty Default Receiver. Ambiguous empty/partial evidence cannot authorize STOP; cleanup fails closed if exact active-media ownership is no longer provable.

The single `play_media(LOAD)` remains outside the retry loop. Only read-only status confirmation retries RequestFailed/timeout/reconnection, within the existing18-second soft loop; individual status waits remain bounded, and Node's35-second IPC deadline remains the outer process bound. No mutating command is automatically resent. Foreign app/session and no-owner cleanup rules remain in place.

Executed after the correction:

```powershell
H:/PTI-OnePiece/tools/node/node.exe --test `
 apps/one-piece/companion/test/cast-transport.test.mjs `
 apps/one-piece/companion/test/cast-bridge.test.mjs `
 apps/one-piece/companion/test/cast-evidence.review.test.mjs
```

**17/17 passed**, zero skipped,1932.5518ms. The expanded Python fixture denies all three counterexamples for LOAD/status/disconnect/post-command confirmation and checks no STOP or repeated LOAD; a full real-shaped raw payload succeeds. This is synthetic IPC/controller/raw-message evidence, not TV or end-to-end acceptance. The existing one-second positive raw-proof window is intentionally preserved; actual receiver responsiveness must still be measured in the hardware lane. No engine, TV, browser or live runtime was used or changed here. `cast.mjs`, API and media-worker sources were not edited in this correction.

Corrected `cast-bridge.py` SHA256: `e752e3b62ebcd71f0b58fc3cdfea7928ea6a87d4eb7c8e232418453d3bf3e4a1`; expanded `cast-transport.test.mjs`: `46ad7a7fe6bdc1a0d41ccbb8d2d3d32618b79fcc6ef57d9f817475ddf28540cc`. The reported stale-field finding is closed in this inspected source. Full latest-suite and real-device acceptance remain separate gates.

## Independent long-MP4 API guard review

Reviewed the API guard, shutdown ordering and new stream fixtures read-only. The guard checks the same ticket identity and live profile/session/generation/authority/destination, aborts registered upstream responses on session/profile/episode revocation and shutdown, and separately enforces immutable ticket expiry. New output chunks await a shared pending `ViewerCredentials.getAuthorized()` check. The stream's at-most-one-second check cadence adds no second60-second membership cache and does not reuse the API routine-control role cache. Cleanup removes registry entries/listeners/timers; the server invokes API shutdown before awaiting Cast closure. HEAD strips Range, and prepared-MP4 handoff preserves the tested mode. These are source/fixture conclusions, not live shutdown or receiver outcomes.

Two concrete early-admission cleanup races were reproduced using independent real loopback HTTP probes. When the client closed during the first authorization await, its close event predated guard registration and upstream still opened with a non-aborted signal. Likewise, revoking the ticket/session during that await still opened upstream before the final header check rejected with404. Neither reproduction published authorized video after revocation. The parent fixed both: synchronous request/response closed-state rejection and a current ticket assert now run before registry allocation/upstream work, with no await before attaching the close listener. Independent replays now give zero media opens and zero active streams; the revoked-ticket response is404. Both findings are closed in the inspected source.

Executed `H:/PTI-OnePiece/tools/node/node.exe --test apps/one-piece/companion/test/api-streams.test.mjs apps/one-piece/companion/test/media-static-resource.test.mjs`: **31/31 passed**, zero skips,1503.2443ms (**16 API-stream tests/subtests +15 static-resource tests**). The fixtures cover midstream close/takeover/destination/ticket/expiry/shutdown, self-unpair before credential cleanup, paused queued bytes during membership reads, denial, early disconnect/revocation, HEAD/range and prepared-mode handoff. Network activity was loopback fixture HTTP only; identities, membership and video bytes are synthetic. No real Firebase, engine, TV, browser or runtime was used or changed. No unresolved source blocker remains in this inspected API delta; full-duration transfer, real receiver behavior and final live release acceptance remain separate.

Working-file SHA256 at this checkpoint:

| File under `apps/one-piece/companion/` | SHA256 |
|---|---|
| `src/api.mjs` | `b934bf11ac70d72b4377ef871eb8a8278d305c6479fab94b420981a22f994a27` |
| `src/server.mjs` | `45df1d352d497f1ca16c64fca8980ba04e072b555d5cb9f74ea20fba0ee77386` |
| `test/api-streams.test.mjs` | `a43b76856b19ccd1755245d72cd436beb377cb4b719090865593b3bc4de5e3d2` |

## Prepared-media lifecycle review and corrections

Inspected prepared recipes/files, cache reservations/pins/LRU/persistence, shared cancellation, process intents/recovery, finite Jellyfin imports/static bindings and coordinator queue/adoption/restart. The real production artifact `cast-media-compat/prepared-production-2026-10-18T12-10-13-858Z-ee58d2.json` records PASS for1000 copy/1001 conversion,233/328 served caption cues, exact ranges/decode, one shared preparation surviving one consumer's cancellation, queue adoption and restart without the original. Its peak accounted17,071,513,219bytes is below21,474,836,480bytes. This reviewer inspected that artifact; did not rerun its engine work. It explicitly marks real Firebase/Cast/audible Japanese/visual subtitles false. The later root-reported1001 upstream500 in a duration attempt is a separate incident, not evidence that either lifecycle defect below caused it. A real rerun remains necessary after the media lane's separate engine-marker initialization correction.

Two additional adversarial tests initially failed despite the broader prior suite passing. Cancelling the last consumer while final publication waited for the cache transaction still published an unpinned rendition. Separately, a fake owned child emitting an error after a failed kill cleared its durable intent before actual close. These were deterministic tiny-file/fake-child reproductions in `test/media-prepared-review.test.mjs`, not claims about a current Archive file or an actual OS kill failure.

With narrow parent authorization, this reviewer changed only `media/cache.mjs` and `media/prepared.mjs`. Publication now rechecks cancellation after verification and inside the final transaction before assigning a reusable record; cancelled renamed pairs are cleaned. The old job and reservation remain owned through cleanup, so same-recipe retry cannot race an older deletion. Successful shared consumers still retain their pins; finite peak reservations, recipe identity, caption lineage and exact resource roles are unchanged. Process errors with a known PID now wait for actual child close before resolving/rejecting and removing durable intent. A never-spawned/no-PID error can complete immediately. If the OS refuses termination, the job remains pending with its recovery identity and reservation until confirmed close or controlled runtime recovery; potentially writing files are not released as though the tool had stopped.

Final focused checks:

```text
H:/PTI-OnePiece/tools/node/node.exe --test apps/one-piece/companion/test/media-prepared-review.test.mjs apps/one-piece/companion/test/media-prepared.test.mjs apps/one-piece/companion/test/media-cache.test.mjs apps/one-piece/companion/test/media-coordinator.test.mjs apps/one-piece/companion/test/media-jellyfin.test.mjs
H:/PTI-OnePiece/tools/node/node.exe --test --test-name-pattern "prepared process records|failed PID registration" apps/one-piece/companion/test/media-prepared-processes.test.mjs
```

**38/38 +2/2 passed**, zero skips,2345.5446ms and220.521ms. Four new tests cover cancellation before publication, failed-kill/no-close preservation, same-recipe retry waiting for cleanup/reservation and never-spawned completion. The other focused fixtures cover current/next pins and LRU pressure, quota, path/junction refusal, original-versus-derived indices, full-English cue lineage, exact video/caption roles, shared jobs and restart/adoption. The last command includes a tiny owned benign Node child for registration-failure completion; no encoder, engine, GPU, TV, browser, installed runtime or real Firebase was used. Both modified modules pass syntax checks. Source review found no additional concrete blocker in this inspected lifecycle scope; actual duration, receiver/Google-auth and final release acceptance remain outside these fixtures. Ownership of both production files was returned to the parent/media lane before their final complete-suite run.

Frozen corrected working-file SHA256 at handoff:

| File under `apps/one-piece/companion/` | SHA256 |
|---|---|
| `src/media/cache.mjs` | `dc61f6417f45bdb9d9b73f0ac57bd5c5676012f02601148398223981f751d632` |
| `src/media/prepared.mjs` | `57a031833a426c3086b6a965f7498133e608d365cecb6bfe63acf496da6e30da` |
| `test/media-prepared-review.test.mjs` | `c6c2ca08ca7d2b85dedd22816229e429727b45061f4b6ae4961675b982c0e31b` |

## Prepared runtime setup and cache handoff review

Inspected setup/configuration, source selection, activation and server/coordinator wiring offline. New setup now explicitly creates `playback.mode: prepared-mp4`; the existing protected-config branch still returns the saved validated configuration, with omitted mode retaining `compatible-h264`. Only `src/runtime/setup.mjs` and its focused configuration test changed in this lane. No private configuration, media file, engine, installation, package or activation was touched. The parent fixed the separately reported server omission by including validated `config.cacheAccountingRoots` alongside mandatory roots; this reviewer checked the resulting source, not a live backup-accounting run.

The recursive release selector includes committed prepared/static/process/timing source modules. External H executables and persistent CA storage are intentionally outside the release payload. Packaging rejects dirty selected source, so final explicit-path staging must include every required new module. Actual package/activation/tool independence remains unverified. There is no prior accepted H release: an A/B activation exercise with identical payload manifests can verify mechanics only, not semantic-regression rollback.

[The concrete handoff checklist](runtime/PREPARED_CACHE_HANDOFF.md) records the parent-owned future whole-cache rename: all owners/engines/tools stopped; checked absolute H paths and reparse chains; empty staging/ownership and no temporary manifest; three verified prepared episode pairs and explicit original-retention outcomes; whole-tree byte/hash/mtime inventory; finite final engine roots; old-target backup counted inside20GiB; and fresh configuration-matching stop proof after explicit mode changes. The media worker confirmed this portability interpretation and the important exception that an intentionally evicted original may be absent while its validated prepared rendition remains reusable. No selected-record manifest merge, live move or redownload is proposed. The actual migration must capture the current three records; historical1000/1001 evidence does not prove current episode1 cache contents.

Independent rerun: `H:/PTI-OnePiece/tools/node/node.exe --test apps/one-piece/companion/test/runtime-config.test.mjs apps/one-piece/companion/test/runtime-release.test.mjs` **9/9 passed**, zero skipped,451.7837ms; setup syntax check passed. These are synthetic configuration/Git-tree/stop-proof fixtures. They test new-config selection and legacy validator behavior; preservation of setup's existing-config branch was inspected in source rather than rerunning private Windows setup. The parent separately reports its latest complete companion **194/194 passed**, not re-executed by this reviewer. No unresolved source blocker remains in this narrow setup/release-wiring scope. Final configuration/migration, real duration/TV/Google-family/device acceptance and complete Hosting/H runtime release/rollback remain open live gates.

Working-file SHA256 at this handoff:

| File under `apps/one-piece/companion/` | SHA256 |
|---|---|
| `src/runtime/setup.mjs` | `28c703537bd5a92f4355cc8e8d199655a6b3046ebe972a8ad295d6d977b3bf4b` |
| `test/runtime-config.test.mjs` | `9b11737a8f545f05dcdcd0b6c075bfe668cfde100a46b580bfbf756930ef8c5d` |
| `src/server.mjs` (parent-owned accounting fix) | `7036b6abfb8b77e3f7c836baaad43185219ef53c371e3cee5148af54beb54998` |
| `src/runtime/release.mjs` (inspected, unchanged in this lane) | `c247ace8c193303217a40e87ed495fa8a91a5da6bebfe3a03ad7d523facf01df` |
