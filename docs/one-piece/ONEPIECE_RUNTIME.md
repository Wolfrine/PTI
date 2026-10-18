# One Piece household companion runtime

This is the approved home-network runtime for the PTI One Piece app. The PWA remains at PTI; the PC provides private authenticated HTTPS controls and media preparation. The Sony receiver uses separately scoped HTTP media capabilities because its real TLS test rejected the household CA. Owner approval covers that LAN media tradeoff and household public-CA installation.

## Installed shape

| Component | Binding / location |
|---|---|
| Controls and browser media | `https://onepiece.local:8443`; fallback `https://192.168.68.105:8443` |
| Caddy HTTPS proxy | LAN `192.168.68.105:8443`; admin API and access logging disabled |
| Node control backend | Loopback `127.0.0.1:18098`; trusts only the private proxy proof and HTTPS indication |
| Cast media endpoint | LAN `192.168.68.105:18099`; resource-scoped, revocable tickets, no Firebase identity on HTTP |
| Dedicated Jellyfin | Loopback `127.0.0.1:18097`; separate from pilot18096 |
| Local naming | `onepiece.local` advertised by zeroconf on Ethernet192.168.68.105; no DNS53/router/hosts/global-DNS changes |
| Private runtime config and state | `H:\PTI-OnePiece\runtime\private` |
| Viewing state and cache | `H:\PTI-OnePiece\runtime\data` and `...\media` |

The fixed IP/interface/subnet are validated assumptions for the current household. A DHCP address change requires a checked local configuration/firewall update. Guest Wi-Fi isolation or blocked multicast can prevent discovery; the HTTPS IP fallback has a separately valid IP certificate. Another household network is not automatically granted access.

The supervisor starts the dedicated engine, waits for stable JSON readiness, completes the private bootstrap, disables all20 scheduled task triggers, then starts the backend, Caddy and mDNS. The media coordinator separately disables library-wide background work. Core failures restart the backend and engine together after verified encoder cancellation; mDNS/Caddy failures recover independently with bounded backoff. Three failed health checks trigger recovery. No stream URLs or child stderr are logged.

`stopOwnedEngineChildren(config)` checks the protected supervisor state, exact live supervisor executable/command, engine parent PID and pinned engine executable. It traverses that engine's descendants and terminates only exact bundled FFmpeg/FFprobe binaries. A system conhost helper is recognized without terminating it directly. Unexpected descendants or unconfirmed termination fail closed. The live idle test verified ownership and zero encoders; it is not evidence of cancelling an active production encode.

## Trust, identity and configuration

The existing household Caddy CA storage is retained under `H:\PTI-OnePiece\pilot\network\private-ca-pilot\storage`. The legacy directory name does not make it disposable: it now holds the persistent household signing identity. Private keys were not copied into the repository, exported, or sent to another device.

Only this public root certificate is installed/transferred:

- Public file: `H:\PTI-OnePiece\runtime\public\household-ca.crt`.
- DER SHA256: `307F6A88C652E429513F47B386F761249F52A30D6FE93B91ECE7501C3C640489`.
- Windows CurrentUser Root installation verified; no private key imported.
- Android: transfer the public `.crt` through the approved PTI asset or a trusted household transfer, then Settings → Security and privacy → More security settings → Encryption and credentials → Install a certificate → CA certificate. Menus vary by vendor. Check the fingerprint before trusting. The Android installation and actual Chrome/PWA trust remain physical-device acceptance tests. See [Google's certificate instructions](https://support.google.com/pixelphone/answer/2844832/add-amp-remove-certificates?hl=en-GB).

Do not transfer root.key, intermediate.key, sealed viewer credentials or the private runtime directory. Each Android household viewer needs the public trust setup once. The TV does not need the CA because its approved media path is HTTP. TLS failures remain failures; there are no browser insecure flags or certificate-verification bypasses. [Caddy local HTTPS](https://caddyserver.com/docs/automatic-https) describes its private trust and renewal model.

Mutable directories are ACL restricted to the actual Windows owner and SYSTEM. Proxy secret, Jellyfin administrator credentials/token and temporary setup challenge are separately sealed with CurrentUser DPAPI and purpose-specific entropy. Caddy necessarily reads the proxy secret in its private ACL-protected Caddyfile; it is not placed in process arguments, environment variables, access logs or repository files. The root's private key retains its protected Caddy storage permissions.

CurrentUser DPAPI depends on the Windows identity, as documented by [Microsoft](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.dataprotectionscope). A real current-user TaskScheduler task (`PTI-OnePiece-Companion`, Interactive/Limited, AtLogon) starts the hidden H-drive Node launcher; no Windows password is stored. The duplicate HKCU Run entry was removed after successful registration. **Before-login boot is unsupported; actual reboot/logon recovery has not been performed.**

The persistent launcher handles unexpected supervisor exit with guarded orphan verification/cleanup and a1–30second retry delay. Exact PID, executable, original parent, creation time, expected command and current-owner SID must match before orphan termination; unexpected descendants fail closed. TaskScheduler's configured999/PT1M retry did not actually restart a failed action within95.811seconds on this PC, so the implementation does not rely on that setting. That failed experiment is retained. The H launcher subsequently recovered a real killed supervisor and all four children in27.929seconds, including successful DPAPI decryption and authenticated API health. Intentional graceful exit0 ends the launcher and does not restart the runtime. This is a logon task with a proven supervisor watchdog, not a Windows service or a proven full-reboot installation.

## Administrative commands

Run from `apps/one-piece/companion`, using the existing PowerShell7 setup shell (`RemoteSigned`). Original installation used that shell. WindowsPowerShell5 has Restricted execution policy here; the later authorized hardened-stop check used `-ExecutionPolicy Bypass` for that child process only. No machine/user execution policy changed. The setup shell is `C:\Users\Sachit Tewary\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe`. It is used for administrative installation, not the logon/runtime executable. Runtime Node is independently copied and verified at `H:\PTI-OnePiece\tools\node\node.exe`: v24.19.0, SHA256 `3602F2BB1A10F2CBAB4C36886218A33C1AB3DB87290E73B033C46C77147D0237`, Authenticode Valid/OpenJS Foundation. Runtime startup does not depend on the Codex Node cache. The pilot-named pinned Caddy/Jellyfin directories and installed Python remain runtime dependencies and must not be deleted as temporary files.

```powershell
node scripts/prepare-runtime.mjs
node scripts/pin-node-runtime.mjs
./scripts/install-startup-task.ps1
Start-ScheduledTask -TaskName PTI-OnePiece-Companion
node scripts/verify-runtime.mjs
./scripts/stop-runtime.ps1
```

Preparation is idempotent and refuses invalid existing protected config. It proves CurrentUser DPAPI, validates the Caddy binary and CA fingerprints, creates private engine directories, and installs only the approved public root into CurrentUser trust. Configuration is `H:\PTI-OnePiece\runtime\private\config.json`. `loadRuntimeConfig` validates exact approved bindings/consent and bounded H paths; `loadRuntimeSecrets` decrypts only in server memory.

New installations explicitly select `playback.mode: prepared-mp4`. Existing protected configurations are returned unchanged; a saved configuration without a playback mode still validates as `compatible-h264`. Re-running setup therefore does not migrate the installed household. The owner must explicitly select prepared playback and validate reusable cache contents before the final activation. [Prepared cache handoff](evidence/runtime/PREPARED_CACHE_HANDOFF.md) records the stopped whole-directory migration prerequisites, accounting and first-release rollback limits; that procedure has not been executed.

One-time owner binding needs a private local setup code and a verified Firebase sign-in. Run `node scripts/show-local-setup.mjs` in a real local interactive terminal. It shows the short-lived code only in that terminal. An expired code requests renewal through the ACL-protected `setup.request` file and inherited backend IPC; it is never returned over unauthenticated HTTP or stored as plaintext. Automation may use `node scripts/show-local-setup.mjs --renew` to request renewal without printing the code. Once paired, local renewal is rejected. Other viewers use invitations, not this administrative code.

`stop-runtime.ps1` verifies the pinned task action and any live supervisor's process identity, requests graceful shutdown through the private stop file, then stops a remaining verified scheduled task so a launcher in recovery backoff cannot restart during release. It requires no launcher/supervisor, no recorded children and no relevant TCP listener before writing private `stop-proof.json`; it refuses unrelated process/task identities and remaining orphans instead of force-killing unverified PIDs. The launcher normally exits0 on this intentional stop. The hardened command succeeded against the **actual already-stopped installation** at `2026-10-18T10:13:52.6662005Z`, with independent process/task/listener/proof readback; this is not an active-playback shutdown test. Resume with `Start-ScheduledTask`; the direct `start-runtime.ps1` helper starts a supervisor without the outer watchdog and is reserved for diagnostics. `install-logon-startup.ps1` is an H-node HKCU fallback for machines unable to register the task; it is not installed alongside the successful task. Startup removal does not remove household trust or media files.

## Versioned runtime release and rollback

`package-release.mjs` is ready for the controlled-release stage. It requires an explicit40hex Git commit equal to HEAD and clean committed companion source/scripts/package/catalog paths. It copies regular committed Git blobs, verifies Git object hashes (avoiding CRLF ambiguity), copies only the pinned `jose`6.2.12 dependency from the H dependency installation, and records every file's SHA256/size in `H:\PTI-OnePiece\releases\<commit>\release-manifest.json`. Private configuration, identity, media and caches are excluded. Symlink source entries, arbitrary commits/paths, unexpected dependencies and unbounded copies are rejected. A pre-existing release directory is never silently overwritten.

The recursive source selector includes the committed prepared-process, prepared-media, static-resource and timing modules; an untracked required module makes the selected source scope dirty and blocks packaging. Node, Jellyfin/FFmpeg/FFprobe, Caddy, installed Python and household CA storage remain external pinned H/installed prerequisites, rather than copied release payloads. Verify their expected paths, versions and hashes during final acceptance. Server accounting includes mandatory engine/production/pilot roots plus every validated `cacheAccountingRoots` entry, so a deliberately retained old-cache backup must have an explicit accounted root.

After the final code commit, package it, stop the runtime, activate it, and start the task:

```powershell
# COMMIT is the actual final reviewed Git SHA, not a branch or sample label.
H:/PTI-OnePiece/tools/node/node.exe scripts/package-release.mjs --commit COMMIT
./scripts/stop-runtime.ps1
H:/PTI-OnePiece/tools/node/node.exe scripts/activate-release.mjs --commit COMMIT
Start-ScheduledTask -TaskName PTI-OnePiece-Companion
H:/PTI-OnePiece/tools/node/node.exe scripts/verify-runtime.mjs
```

Activation verifies the saved release checksum manifest and pinned H Node, requires the hardened stop proof to be no more than five minutes old and match the current configuration hash, and independently rechecks that task/processes/listeners remain stopped. It saves the previous protected config and changes only selected code/catalog paths plus stable launcher. The same `activate-release.mjs` command with a retained prior H commit performs rollback after a **new** stop proof. Household identity/progress/cache paths stay outside release directories. The active runtime then has no F-worktree dependency. Retain a verified H baseline before claiming first-release rollback readiness; an old F-worktree config is not that final rollback target. Website-only rollback must preserve the new Firestore `onePieceData` isolation rules; see [the independent release review and rollback procedure](evidence/RELEASE_SAFETY_REVIEW.md). **Packaging/activation are implemented and fixture-tested; an actual final committed H release has not yet been packaged or accepted.** This remains the controlled-release gate.

There is no prior accepted One Piece H release. Two commits whose runtime manifests contain identical payload bytes can exercise stop/activation/return mechanics, but that is a same-payload operational exercise, not proof of recovery from a semantic regression. The first accepted H payload becomes the retained baseline for later changed releases. Any explicit mode/cache configuration edits also invalidate an earlier stop proof; generate a fresh proof after those edits and before activation.

## Firewall review and remaining setup

The parent executed the approved elevated `scripts/install-lan-firewall.ps1` operation on **18 October 2026 at 09:10:05.0344016Z**. Its protected `firewall-proof.json` records exactly three installed and verified inbound rules: `PTI-OnePiece-HTTPS-LAN-v1` (pinned Caddy TCP8443), `PTI-OnePiece-CastMedia-LAN-v1` (pinned H Node TCP18099), and `PTI-OnePiece-mDNS-LAN-v1` (installed Python UDP5353). All are enabled on Ethernet/Public only, restricted to remote `192.168.68.0/24`, with edge traversal blocked. HTTPS/Cast use local `192.168.68.105`; mDNS additionally uses `224.0.0.251`. The install script checked the current IP, /24 prefix and Public profile, validated exact program/address/interface/protocol/port scope, and recorded no unrelated-rule or global-profile change.

The release reviewer read a sanitized copy of that existing elevated proof and confirmed its recorded program bindings match the protected configuration. A fresh **non-elevated** `Get-NetFirewallRule` attempt was denied; it was not converted into a current elevated readback claim, and no new elevation/rule change occurred. [Sanitized operational evidence](evidence/runtime/already-stopped-release-guard.json) preserves both the original installation proof and this limitation. Firewall installation does not by itself prove physical Android access or receiver playback.

HTTP tickets protect authorization scope but not LAN confidentiality. A device able to observe household traffic could replay a captured media capability until expiry/revocation. The HTTPS control/identity plane and resource/session restrictions remain required. The server owns ticket renewal, revocation, LAN request restrictions and all media responses.

## Evidence and acceptance

- [Live runtime health](evidence/runtime/live-runtime-health.json): actual OS mDNS resolution, strict authorized HTTPS for hostname/IP, PTI-origin API200, dedicated engine authentication and disabled scheduled tasks, all four health checks passing.
- [Backend crash recovery](evidence/runtime/backend-crash-recovery.json): actual unpaired Node crash; supervisor retained, backend and dedicated engine replaced; API recovered in14.705seconds; Caddy/mDNS unchanged. No TV/media session started by this test.
- [Fatal supervisor recovery](evidence/runtime/supervisor-crash-recovery.json): actual H-launcher recovery in27.929seconds, all children replaced, API and DPAPI proven. [Scheduler-only failed attempt](evidence/runtime/supervisor-crash-scheduler-only-failed.json) remains explicit.
- [Pinned Node provenance](evidence/runtime/node-runtime-proof.json) and [task configuration](evidence/runtime/startup-task-proof.json) record actual setup; task registration alone is not the fatal-recovery proof.
- [Actual already-stopped release guard](evidence/runtime/already-stopped-release-guard.json): hardened stop exit0, taskReady, pinned task action matches, zero launcher/supervisor/recorded-process/listener counts, and a fresh configuration-hash-matched private proof. No runtime was started, no task/process killed, and pilot18096/TV/browser were untouched. Active shutdown/activation/rollback remain distinct tests.
- `runtime-config.test.mjs`, `runtime-supervisor.test.mjs`, `runtime-release.test.mjs` and `runtime-stop.test.mjs`: **13/13 passed** in the operational follow-up. They cover origin/consent/path restrictions, private IPC numeric expiry, authenticated health, shared recovery, local-only renewal, committed release selection/Git-framed checksums, and launcher-safe stop/activation refusal. The Windows stop fixture uses mocked OS commands, distinct from the actual already-stopped check above. These do not establish device playback or an activated release.
- Earlier real Sony clip/subtitle and CA-rejection experiments remain under `evidence/network`; those are pilot-media proofs, not production PWA acceptance.

Remaining gates: physical Android public-root/PWA trust and household access; production paired TV/media/end-to-end tests; active-encoder emergency cancellation; hardened stop during an active managed session; three-session load; certificate renewal over time; full PC reboot/logon; final committed H release activation and rollback; any before-login runtime. Catastrophic termination of the launcher/task itself remains distinct from the proven supervisor recovery. No mock result is labeled a hardware or operational pass.
