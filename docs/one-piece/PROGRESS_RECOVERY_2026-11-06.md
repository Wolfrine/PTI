# Episode progress recovery — 6 November 2026

Scope: repair the mobile Library alert “Your last position is still syncing. Reconnect before starting another episode,” reported while continuing episode 50 at 23:11 and opening episode 51. Preserve the November 5 Cast receiver repair, the existing visual direction, saved progress, authentication and other PTI apps. One native `anime/one-piece` parent retained ownership; independent lanes handled client reproduction/implementation, backend acknowledgement and review, and UI semantics review.

## Incident evidence

The installed companion was `f0569ffbf73f9b53d728eae005bf7a34c581c89b`. It had not restarted since November 5. Public-certificate HTTPS and API health returned 200, and Jellyfin/backend/mDNS/Caddy were healthy. The reported episode 50 position was already saved durably on the PC. The account's PC cloud outbox was empty. Exact private positions and ordering fields are retained only in the task evidence.

Exactly two owner-scoped Firestore reads checked episode 50 and its lease. The cloud record matched the PC's position, duration, authority and revision. The retained local lease had expired. There was no evidence that the screenshot's 23:11 position was waiting for a Firestore write or fresh Google authentication. A passive TV query found an unrelated receiver app; no TV controls were sent.

The Android device's local storage and exact pending event were not accessible. The screenshot plus the unique source string establishes that its client queue was nonempty. The precise event payload and original network failure remain unknown; the reproduced stale-session and lost-acknowledgement paths below are not mislabeled as captured phone telemetry.

## Failing transition

Before this repair, `ViewingApp.open()` in `apps/one-piece/web/src/app.mjs` flushed the local queue, then blocked every episode change if **any** event remained. Restore retained pending events. Flush did nothing without a lease and retained events from a different generation/epoch or a Cast authority. Opening 51 checked for a review only when the conflict itself belonged to 51, so a saved-place conflict on 50 fell through to the generic alert. No episode-start request was sent, and repeating the action did not resolve it.

The original “Reconnect” referred to the Home PC connection action: health, account and saved-progress checks. It was not an instruction to sign out, clear browser data or reconnect Google. The alert itself supplied no direct recovery action, and repeating those connection checks could encounter the same expired lease and queue again.

Additional isolated reproductions found that a delayed acknowledgement could regress newer Cast authority or overwrite a newer local position; blindly shifting the queue could remove a replacement event; `episode-changed` could retain an accepted prior-episode event forever; and an expired-session response could discard unverified local intent. Independent review also reproduced a delayed old-session GET replacing the new episode's session state and mislabelling its position as the previous episode. The client recovery distinguishes those cases instead of clearing the entire queue or taking maximum positions.

The companion had a separate acknowledgement defect: `/events` saved progress durably, then awaited an auxiliary Jellyfin progress report before returning success. A delayed or failed report could make the browser retry a position the PC had already saved. The failure was reproduced with the actual API fixture, including exact retries; its contribution to this specific phone incident is unknown.

## Repair contract

- A bounded authenticated PC snapshot reconciles exact durable acknowledgements. An unresolved position from an expired/replaced/local-to-Cast authority is kept in a per-account device journal for explicit review. It is not silently replayed through a new lease or discarded because the PC has a larger revision or position.
- A saved-place review on episode 50 does not indefinitely block opening 51. Continuing the affected episode offers the device and verified PC positions, with intentional rewinds preserved. Unknown PC positions are not presented as zero. Choosing the device position retains the candidate until the new-authority save is acknowledged.
- Late responses cannot lower current authority or retire a different queued event. Newer pending local intent remains visible instead of being overwritten by an older acknowledgement. Recovery data survives reload; storage failures keep the page's in-memory state, preserve the legacy pending record during migration, and show keep-page-open guidance.
- Retry/check actions and bounded queued-write retries operate through the companion. No new Firestore polling, listener, rules, identity flow or credential access was added. Existing family-access listeners remain intact. PC acknowledgement and later cloud replication remain distinct.
- Offline browsing and already buffered/current playback remain available where possible. A new episode still needs authorized delivery from the home PC; no media capability is cached or authentication bypass added. Reopening the current owned Cast episode shows its controller without silently reloading the TV.
- The companion acknowledges its durable journal independently of optional engine reporting. Exact duplicate acknowledgements do not repeat that side effect; errors retain existing diagnostic sanitation. Lease, epoch, episode and receiver-authority checks remain enforced.

## Verification boundary

Final local checks passed: **250 companion, 107 One Piece frontend and 107 PTI ChromeHeadless tests**, with zero skipped tests in those suites. Both production builds, the Home-contract check and whitespace checks passed; existing Angular warnings remain. Independent review passed 82 focused tests and separately reproduced both old-session and same-session delayed-response races against the corrected methods. Production output excludes the synthetic fixtures and the obsolete blocking message.

Behavior tests must exercise the production recovery methods, not merely development fixtures. Development `progress-*` fixtures contain synthetic account, queue and position state and are excluded from production. They are layout examples, not evidence of a real family save or TV test.

Browser automation was unavailable. Native Computer Use then stopped because it could not confidently verify the browser URL for policy enforcement. No desktop/mobile screenshots or visual acceptance are claimed. Source-level responsive checks and UI semantics tests do not replace that gate.

The task's private sanitized evidence, test outputs, installed-release proof and deployment result are retained under `F:\Workspace\Codex\2026-11-06\one-piece-progress\outputs`. Source revision, installed companion and Firebase deployment must be reported separately. Do not interrupt active TV playback merely to repeat the synthetic episode 50 → 51 test.
