# Local Codex bridge storage: guarded F: → H: migration

The owner wants F: reserved for repositories and source code. Local Codex's
historical installation currently stores release files, configuration,
encrypted worker credentials, task history, relay state, locks and reviews in
`F:\Workspace\Support\LocalCodexBridge`. The approved operational destination
is `H:\LocalCodexBridge`. Configured project working copies **remain on F:**;
their F-drive validation is intentional and unchanged.

## Release state and boundaries

- Worker source **0.4.15** accepts either the exact legacy F: bridge root or
  `H:\LocalCodexBridge` through `LOCAL_CODEX_BRIDGE_HOME`. The default remains
  the legacy F: root until the owner-controlled cutover. Neither root may be
  a junction or symlink. Review outputs stay on H: even while the live bridge
  remains on F:.
- `run.ps1`, `stop.ps1`, `install.ps1`, maintenance entry scripts and the
  optional Chrome provider understand the two explicit roots. An installer
  cannot silently redirect an existing registered relay to a different root.
- This source preparation **does not move PC files**, alter the scheduled
  task, release a bridge lease, deploy a worker or reauthorize credentials.
  A Git commit or built bundle alone does not complete migration.
- Maintain the existing Firebase owner identity, Windows user SID, ChatGPT
  subscription login, project paths, native chat IDs, active task generations,
  and remote plugin binding. Do not copy OAuth/browser identities.

## Saved-parent model transition is a release gate

The public `codex queue` uses the saved thread's model; a worker default, startup
`-c model=...`, or queued `/model` text does not migrate an app-owned parent.
The handoff keeps exact provider/model/effort checks and rechecks immediately
before queueing. It never falls back to 6.1 or creates another chat.

Run the read-only production preflight from the canonical PTI checkout:

```powershell
node tools/pti-mcp/scripts/local-codex-storage-migration.mjs --action model-preflight
```

This reads the existing owner `modules` registry and signed-in native
`account/read`, `model/list`, and metadata-only `thread/read`; it never resumes,
queues, starts a turn or changes a model. Exit 2 means blocked. Every enrolled
parent must expose the exact `openai` / `gpt-6.2-sol` / `xhigh` selection and
matching project context. Unknown, unreadable, changed or mismatched identities
block staging. The F: rollback worker's configured pair must already match too;
changing only the H: default would break either forward handoffs or rollback.

A separate owner-authorized, quiescent model transition is required first.
Finish active writers and hold new admissions through supported owner controls.
Use the model/reasoning control in each exact existing desktop chat, then verify
native metadata readback. Official `thread/resume` accepts model overrides, but
using it to migrate desktop-owned writers has not been verified here and must
not steal ownership. No unattended UI migration is promised. Do not send `/model`
as queue text, rotate parents or edit session databases. Reconcile the F: worker
default under that same controlled transition only after its parents match;
no such change is performed by this storage helper. Preserve IDs and history.

Only a passing preflight can produce a stage. The pinned manifest records the
enrollment fingerprint and model contract. Fresh reads repeat before drain,
after drain/before seal, and before either success or rollback reopens admission.
A changed enrollment or model blocks activation and verified rollback release.
A pre-install abort must pass the same native-quiescence check before reopening
the unchanged F: installation. Stages without this contract must be restaged;
never relax the gate to activate 6.2. Metadata such as `notLoaded` is not evidence
that an app-owned writer is idle; retain the separate native-writer fence.

The version-2 contract also reads every enrolled parent's runtime status
(including retired project mappings; an empty enrollment is unverified),
latest turn with `itemsView: notLoaded` (no item content), and first queue page.
Active, unknown, unreadable, incomplete or pending observations block every gate,
including abort, rollback and final admission release. Empty history or a bare
`interrupted` export is not terminal/non-delivery proof. Stored terminal metadata
is diagnostic only: the isolated app-server cannot attest the desktop owner's
current writer or fence new desktop input. It therefore reports
`desktop-owner-quiescence-unverified` and refuses cutover even for apparently
dormant parents. A supported owner-side quiescence/fencing route must be verified
and implemented before this blocker can be removed; there is no override flag.
Do not deploy an old frozen runner to avoid the version-2 gate.

Official controls: [queue semantics](https://learn.chatgpt.com/docs/developer-commands?surface=cli),
[desktop model control](https://learn.chatgpt.com/docs/models?surface=app), and
[app-server resume/read behavior](https://learn.chatgpt.com/docs/app-server).

## Preconditions before any PC cutover

1. Build the reviewed dual-drive **worker 0.4.15** into exactly seven release
   files, either the F: repository's `tools\local-codex\dist` or an owner-private
   build under `H:\LocalCodexBridge\maintenance`. The storage-cutover executor
   pins that payload and installs it **directly on H:**. It deliberately does
   not require another F: release/update/staging directory while F: is full.
   A manifest/payload mismatch stops before the scheduled-task switch.
2. Read-only inventory: measure the source tree bytes/hashes, H: free space,
   H: NTFS health, owner write/ACL support and root ownership. Confirm the
   exact H: destination is absent or an individually validated empty staging
   directory. F: was almost full on 18 November; the H-only cutover creates
   no F: release/stage. It still verifies at least 4 MiB—or three times the current
   status/credential/relay-state/pointer bytes plus 1 MiB if larger—free on
   F: for a real rollback restart. Never use broad cleanup to force staging.
3. Use the existing owner-scoped **maintenance drain/fence**, shared with
   hosted admission and claims. Existing queued, running, waiting-for-user,
   and unresolved app-owned turns must finish or receive an explicit, safe
   disposition. Do not cancel work, remove writer files, treat an expired
   bridge lease as an idle native chat, or infer release from `get_task` alone.
4. The new **owner-only guarded executor source** is
   `tools/pti-mcp/scripts/local-codex-storage-migration.mjs`. It reuses the
   existing detached one-shot launch and owner-scoped Firestore fence but
   requires independent source review and a real Windows owner-PC cutover.
   The ordinary release updater's `detach` remains version-only and cannot
   migrate a drive. If checks fail, leave F: running and report the blocker.

## Owner-PC cutover entry points

From the F: checkout's `tools\pti-mcp` directory, **after source review,
dependency availability and read-only owner-PC preflight**:

```powershell
node scripts/local-codex-storage-migration.mjs --action prepare-h
node ..\local-codex\build-to-h.mjs --directory H:\LocalCodexBridge\maintenance\build-UNIQUE-ID
node scripts/local-codex-storage-migration.mjs --action stage --directory H:\LocalCodexBridge\maintenance\cutover-UNIQUE-ID --payload H:\LocalCodexBridge\maintenance\build-UNIQUE-ID --deadline FUTURE-ISO-TIMESTAMP
node scripts/local-codex-storage-migration.mjs --action detach --manifest H:\LocalCodexBridge\maintenance\cutover-UNIQUE-ID\manifest.json
```

The new `build-to-h.mjs` uses the same reviewed esbuild inputs/license
packaging as the ordinary worker build but writes all seven outputs to H:
(no F: bundle, provider, or scratch output). The payload may alternatively
be an existing reviewed seven-file F: build; do not generate another there.
`stage` performs root/ACL/owner/scheduler/model/parent preflight and produces a SHA-256-pinned
manifest on H:. `detach` acquires the hosted drain and starts a bounded
external owner process. **Finish the task that launched it** so its existing
claim can end. The external executor waits for native/hosted work to drain,
seals admission, verifies no live workers, and alone performs the copy/switch.

The owner controller is **freshly typechecked and emitted in memory** from
`tools/pti-mcp/src/local-codex-maintenance.ts` during `stage`, then frozen
directly on H: with source SHA-256, compiler version and artifact SHA-256
in the manifest. It never imports an unverified existing F: `dist` controller,
so a stale bundle cannot omit the native-writer guard. Separately build and
deploy the updated PTI host through the normal pipeline before cutover; the
staged local gate is not evidence that the hosted service was redeployed.

Afterwards inspect `H:\LocalCodexBridge\maintenance\cutover-UNIQUE-ID\result.json`
and the owner-host `lastMaintenance` receipt. Require
`activated-verified`, verified H: worker heartbeat/listener and
`gpt-6.2-sol/xhigh`. A launch acknowledgement alone is not activation.

If a sealed cutover crashes, keep the fence closed. An owner-approved
external recovery uses that exact stage:

```powershell
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File H:\LocalCodexBridge\maintenance\cutover-UNIQUE-ID\maintenance-once.ps1 -Manifest H:\LocalCodexBridge\maintenance\cutover-UNIQUE-ID\manifest.json -ManifestSHA256 (Get-Content H:\LocalCodexBridge\maintenance\cutover-UNIQUE-ID\manifest.sha256) -Recover
```

Check the original SHA-256 and current maintenance identity before recovery;
never clear the Firestore fence, reset locks or manually switch the task.
This source has **not been run on the Windows PC**; until a real receipt
exists, H: migration remains pending.

Recovery is guarded and retryable for a crashed/transient previous recovery:
the executor verifies the exact owner/manifest marker and that the previous
PID is conclusively exited, atomically archives its NTFS marker and preserves
the preceding receipt before reattempting. It refuses a live/unknown PID,
foreign marker or more than five recovery attempts. The first `execute`
remains strictly one-shot; no native/process lock is broadly deleted.

The executor deliberately **blocks** if:

- A project under the old F: bridge root is not the **exact physical**
  `F:\Workspace\Support\LocalCodexBridge\scratch` source working area, or that
  path is redirected/junctioned. Verify either its own exact Git root or the
  legacy container's exact physical `AndroidAutoDiagnostics` child Git root;
  no other bridge-hosted project is implicitly admitted. The entire verified
  scratch working area is **intentionally excluded** from the H: operational
  copy and its configured project path remains on F:. On the owner-PC audit
  it accounted for approximately 2.75 GiB of source working data; moving it
  would violate F: = code/repositories and risk native chat ownership.
- The optional Chrome provider has an active pointer or either HKCU Native
  Messaging registration. Unregister it through its verified workflow after
  active sessions finish; a loaded unpacked extension must not be silently
  rebased. The bridge source itself handles H: provider roots once configured.
- The owner SID, target ACL/NTFS, same scheduled-task action, protected
  job/worker idleness, seven artifact hashes, signed-in model catalog,
  copied current-user DPAPI credential or hosted heartbeat cannot be verified.

## Cutover contract for the dedicated executor

The executor must run as the **same Windows owner**, outside the Codex/worker
process tree, under the exact sealed maintenance ID/generation. It must
persist each phase and an immutable source/target/hash manifest for recovery.

1. With the fence sealed and every protected writer/worker exited, stage a
   **copy**, not a move, from the exact F: installation into the exact H:
   destination. Preserve `config.json`, protected `data/credential.json`,
   `tasks/`, `harness/`, release pointers, release artifacts and historical
   receipts. Do not activate a second relay. Treat runtime PID/lock files
   as recovery metadata; never trust copied PIDs as ownership of H:.
   **Exclude only** the exact verified source repository or legacy container
   `F:\Workspace\Support\LocalCodexBridge\scratch`; its files and native
   desktop threads remain at exactly their original F: checkout path. Record
   its exclusion and actual Git-root proof in the sealed source inventory/receipt.
2. Give H: the same owner+SYSTEM-only directory ACL before copying any secret.
   Recompute and verify source/target file hashes and validate `active.json`
   resolves **inside H:**. Verify current-user DPAPI can decrypt the existing
   protected envelope under the same SID *without logging plaintext*; the
   credential's entropy is independent of its path.
   Copy the already verified `gpt-6.2-sol/xhigh` F: configuration unchanged
   into H:, including its model pair. The F: rollback default and all enrolled
   desktop parents must match before staging; this cutover does not perform a
   model transition. Verify catalog and parent metadata again before the switch.
3. Under the still-sealed fence, disable the **existing** `PTI Local Codex
   Relay` triggers, invoke its exact installed guarded stop and verify the
   old PID and descendants exited. Replace the action and working directory
   of that **same named task** with H: `run-hidden.vbs` and H: root. No second
   scheduled task/service or recurring watcher may be created.
4. Start exactly one H: relay. Confirm its own `data/status.json`, installed
   release identity, fresh owner-authenticated hosted heartbeat, listener
   connection and intended model/effort. Confirm history/module pointers
   remain available and PC project paths still resolve to F:. Only then
   complete the maintenance receipt and reopen admission.
5. Preserve the F: tree as a recoverable, labelled rollback copy. After a
   separate explicit retention/cleanup decision and real sustained H: use,
   remove only the inventory-verified obsolete operational copy; never erase
   the F: checkout, private native chats, or unrelated PTI helpers.

## Failure and rollback

- If copying, hashes, owner ACL, DPAPI, scheduling or heartbeat verification
  fails, **keep admission closed**, disable the H: action, restore the original
  F: action/working directory, restart only the exact original owner relay,
  and verify its fresh hosted heartbeat plus enrolled-parent model compatibility before releasing the fence.
- An H: relay may have refreshed its Firebase token before failing health
  verification. Recovery compares the encrypted F/H credential envelopes,
  validates the H copy with same-owner DPAPI, checks F against the saved
  sealed-copy hash, and—only if H rotated—copies the newest encrypted envelope
  back to F atomically before restarting. It preserves the original encrypted
  rollback backup on H:. It never exposes plaintext or overwrites an
  independently changed F credential; uncertainty keeps admission sealed.
- Preserve all migration manifests, both roots, task history, credentials
  (encrypted), and failure receipts. An unknown maintenance state stays
  fenced for supported owner recovery; do not delete locks/fences or start
  competing workers.
- The optional PTI Owner Chrome provider is disabled by default. If its HKCU
  Native Messaging registration points at F:, leave it disabled until an
  independently authorized provider move can verify the exact registration
  and Chromium extension behavior. This is not required for official desktop
  `@Chrome` use.
- `F:\Workspace\Support\PTI\codex-usage-monitor` is a **separate** helper
  with its own encrypted state/startup contract; moving Local Codex does not
  automatically move that data. Audit it separately against the same F:
  source-only policy.
- An **installed legacy** `config.json` can still list the verified `scratch`
  source container at `F:\Workspace\Support\LocalCodexBridge\scratch`, although
  the revised template no longer includes it. The exact project path is
  preserved on F:, untouched by the cutover. If the owner later wants the
  repo moved to a different F: code directory, perform a separate supported
  same-volume relocation only after native-thread ownership and Git/working
  tree checks. No repo move/rename is part of storage migration.
