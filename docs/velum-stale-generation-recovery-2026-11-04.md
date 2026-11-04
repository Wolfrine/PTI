# Velum saved-result publication recovery — 4 November 2026

Scope: repair stale Studio generation state without inference, deleting media,
removing queue history, cancelling legitimate work or changing resource limits.
One local agent owned worker lifecycle and affected UI/controller tests. The
concurrent Photographic Atelier redesign from `10346cb` was retained.

## Cause and timeline (UTC)

- Job `Lv0ctyemamCpg3Qc4iWx` was created 3 November at 17:35:20.004 and
  claimed at 17:35:21.842. Its last cloud progress was 17:38:12.355.
- Local FLUX inference succeeded in 220.41 seconds and saved its result at
  17:39:02.851; the process log records exit 0 and `saved: true`.
- Removal at 4 November 07:02:54.820 created an owner removal marker. Removal
  hides a Creation; it does not cancel inference or finalize a worker claim.
- Discovery found exactly one running cloud claim, no queued/uploading job,
  no inference child, an available OS inference byte-range lock, and about
  900 MiB GPU memory at 1% utilization. The valid worker singleton was retained.
- A narrow local diagnostic proved HTTP 403 on the final job `completed` PATCH.
  A synthetic copy of the legacy reference/completion shape reproduced the
  Firestore 1000-expression limit against committed rules. Omitting localPath
  did not change the failure. This was a rules evaluation failure, not a model
  resource guard, a stale GPU lock, or a lost output.
- At 07:47:11 the owner-authorized repair used the job's update token to mark
  only this record completed from the already validated local result and
  existing private chunks/thumbnail: 486016 bytes, two chunks. Original bytes,
  references, request fields, history and the removal marker were retained.
- Cloud readback at 07:50:39 showed zero pending jobs and a fresh idle worker
  with an empty activeJob. No generation was submitted.

## Repair

Creation still validates the full immutable request. Worker transitions validate
device ownership, supported schema/model, legal state changes, bounded output,
and the affected-field allowlist instead of revalidating every unchanged input
reference. Tests reject altered requests, wrong devices and terminal restarts.

Lifecycle recovery validates the original claim generation before work, compares
Firestore maps by value rather than property insertion order, reports delivery
as publishing, and publishes idle after an attempt releases its active job.
Local errors retain a safe HTTP/operation classification rather than disguising
every failure as connectivity loss.

Studio reads bounded pending work independently of its four recent records,
fetches a referenced heartbeat job if absent, and distinguishes active inference,
result delivery and unconfirmed state. A current terminal job supersedes an old
running heartbeat. Expired uploads/queued requests do not block a draft; running
claims are not expired merely because long CPU encoding has no sampling progress.
The existing v2.3 recovery helper is recognized. No styling, model, precision,
reference cap, sampler, prompt contract or safety setting changes.

## Verification boundary

Regression coverage includes full one/two-reference completion, immutable-field
and owner/device denial, terminal/replaced claims, saved-output retries without
resampling, stale heartbeat reconciliation, active/removed/long-running jobs,
publication status and upload TTLs. Controller/browser tests run real production
modules with visibly synthetic Firestore/auth states and forbid all writes.
Desktop 1440x900 and mobile 390x844/360x800 show New image and Generate enabled
after terminal reconciliation; Generate remains disabled for active work.

Screenshots and command logs are stored under
`F:\Workspace\Codex\2026-11-04\velum-stale-generation\outputs`.
Real production queue/status reads are separate evidence from those browser
fixtures. Owner phone sign-in and a new real generation are not simulated.
The final delivery report records the commit, CI and deployed-asset verification.

Existing Research preview changes and other untracked files are excluded from
this delivery. The deployment retains the exact predecessor rules hash guard.
