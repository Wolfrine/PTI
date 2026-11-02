# Owner-PC Blinkit event reader: 2 November 2026

This is a neutral release checkpoint. It contains no real email payload, source order, order token/reference, product list, authentication material or purchase fixture. Historical backfill is deferred; its separate [checkpoint](morsel-blinkit-backfill-status.md) is not an import receipt.

## Delivered scope

Single local parent; no subagents or recursive relay. The parent ChatGPT lane owns Gmail parsing, automation and the real event enqueue. This lane implements the durable owner-PC reader and required canonical queue/ingest support. No mail automation or real source event was created by this lane. GTOP, Local Codex and unrelated dirty Velum files were preserved.

Source commits: `9bacf520828af4393769c776b9bfe0a6b30721df` (reader/canonical support), merged with the parent's independent mail parser at `5f990b05bcbf49d708ab837564e29a0c05373797`, then `e0683b5dbc326edd16dc4985fe7282a4c35ced6b` (installed-runtime verification, ACL correction and bounded shutdown). Main was pushed directly; no branch or PR was created.

The [reader contract](../tools/blinkit-reader/README.md) defines the strict, deterministic `users/{ownerUid}/foodData/workspace/purchaseEvents/blinkit-gmail-{gmailMessageId}` queue. Existing authenticated generic **create** routes this namespace through the pause-checked canonical transaction; generic queue updates/batches/deletes and purchase writes remain denied. Leases, replay, atomic purchase/event acknowledgement, guarded revisions and bounded retry/review outcomes use the specialized deployed tools. Payment time remains separate from unknown purchase ISO time.

The installed runtime is `F:\Workspace\Support\PTI\blinkit-reader`, release `releases\1.0.0-e0683b5`. The private normal browser profile remains under that root. Node 24 runs from F; Chrome 156 remains its existing platform installation. Only the current Windows user and SYSTEM have explicit runtime ACL access. No profile/cookie copying, service-account key, new credential, browser-security weakening, source scraping or guessed endpoint is used.

**PTI Blinkit Reader** is a windowless, current-user Task Scheduler task with logon/minute recovery and overlap prevention. It polls the minimal owner queue through signed-in Morsel and uses only freshly discovered Blinkit `get_session`, `list_orders`, `get_order` page tools. Scope review precedes details; at most three recent pages are scanned. Human verification barriers stop source retries. Normal site login occurs in a separate visible setup phase using the same profile; it is never automated or collected by the worker.

## Actual evidence and limits

- A real scheduled invocation started the daemon. Graceful stop reached `stopped`, then resume produced a different worker PID with the same profile. Both runs reported `morsel_login_required`, processed zero and verified zero. This proves launch/restart mechanics, not authenticated source/session persistence.
- The hardened release is installed with `-NoStart` while the normal dedicated sign-in window is open. Closing that window resumes the task through `setup.ps1`. It is not currently accepted as ready to import.
- Installed Chrome exposes the official WebMCP API with its documented feature flag. A separate synthetic localhost profile exercised the actual production adapter: tool discovery/call, string envelope, changed suffix discovery, registration removal, interrupted pending call and rejection of a disallowed write tool. It did not open either production service or use owner login storage.
- An earlier fresh-profile Blinkit navigation returned HTTP 403/human verification and no registered tools. No challenge was solved programmatically. Morsel in this new profile has not yet passed approved-owner sign-in/registration. Authenticated headless access must be independently verified after normal sign-in.
- Authorized live PTI reads confirmed ingestion unpaused, **97 restaurant receipts, zero Blinkit purchases**, absent purchase sync state and an empty payment-event queue. No real source purchase was imported or replayed by this lane. The known acceptance order must come from a fresh list/detail read, never from task text or test fixtures.

## Verification

- `npm run build` and `npm test` in `tools/pti-mcp`: **138 tests, 9 suites passed**, including the parent's 11 mail-parser tests.
- `npm test --prefix tools/blinkit-reader`: **9 synthetic tests passed**; shared canonical modules bundled successfully.
- `node --test personal-harness/core.test.mjs food-app/*.test.mjs`: **41 passed**.
- Atlas/data/native-auth/Morsel-auth deployment selftests: **23 passed**.
- `node food-app/scripts/build.mjs`: passed. An attempted `npm run build --prefix food-app` was inapplicable because this static app has no package.json; its actual build command above passed.
- PowerShell parsing for every local-reader script, Home contract check and staged whitespace checks passed.
- A source-only identifier scan of the 32 implementation files found zero supplied real acceptance identifiers. Fixtures are synthetic.
- [MCP run 41399026440](https://github.com/Wolfrine/PTI/actions/runs/41399026440) passed verification, auth configuration and deployment. Cloud Run revision `pti-firestore-mcp-00046-z42` served 100% of traffic. Live checks verified all four Blinkit tools, owner purchase/queue reads and cross-account denials without creating a purchase or run.
- [Morsel run 41399026484](https://github.com/Wolfrine/PTI/actions/runs/41399026484) passed desktop/mobile/small-mobile regression, Hosting deployment and live asset checks. Its page backend verified four tools, event leases, owner read and unsigned/outsider/fake-origin denials. These are CI/backend checks, not real owner-browser acceptance.
- Final hardening [MCP release run 41399918111](https://github.com/Wolfrine/PTI/actions/runs/41399918111) also completed successfully. Revision `pti-firestore-mcp-00047-9qx` serves 100% of traffic; authenticated Blinkit registration/context and cross-account denials passed again. A final owner read still found zero purchases, an empty event queue, 97 restaurant receipts and ingestion unpaused. Morsel's canonical page source was unchanged by this local-only hardening.

## Remaining acceptance

1. Owner completes any normal Blinkit verification and phone/OTP login directly in the dedicated visible Chrome window, and normal Morsel Google sign-in using the approved account. Never paste codes/tokens/cookies into chat. Close that dedicated window; the installed setup helper resumes the worker. If needed, run `F:\Workspace\Support\PTI\blinkit-reader\setup.ps1` again. No address/location is needed.
2. Confirm the actual daemon reaches ready through both first-party tools and the authenticated Morsel bridge, then survives restart with the normal persisted sessions. If Blinkit still denies headless access, report the barrier; do not disguise automation or bypass verification.
3. Parent enqueues the real verified minimal payment event under the documented create-only contract. No raw mail body or bank identifiers accompany it.
4. Verify fresh first-party list token, eligible full detail, unique total/display-time match, canonical persistence and product/pack/date readback; explicitly replay that event and verify duplicate behavior and unchanged restaurant counters. Until then the real import/replay gate is **blocked**, not passed.

Pause ingestion or use the installed stop script to stop capture. Preserve the profile, pending queue and canonical purchases when rolling back to an earlier validated release. Do not delete credentials/profile or touch another service as routine recovery.

## Changed source manifest

The implementation and hardening touched these files; the parent's parser files were merged unchanged:

```text
.github/workflows/pti-hosted-mcp.yml
.gitignore
food-app/blinkit-webmcp.mjs
food-app/blinkit-webmcp.test.mjs
food-app/scripts/verify-live.mjs
tools/blinkit-reader/README.md
tools/blinkit-reader/install.ps1
tools/blinkit-reader/package-lock.json
tools/blinkit-reader/package.json
tools/blinkit-reader/resume.ps1
tools/blinkit-reader/run-hidden.vbs
tools/blinkit-reader/run.ps1
tools/blinkit-reader/scripts/build.mjs
tools/blinkit-reader/scripts/verify-browser.mjs
tools/blinkit-reader/setup.ps1
tools/blinkit-reader/src/browser.mjs
tools/blinkit-reader/src/core.mjs
tools/blinkit-reader/src/daemon.mjs
tools/blinkit-reader/status.ps1
tools/blinkit-reader/stop.ps1
tools/blinkit-reader/test/core.test.mjs
tools/blinkit-reader/test/safety.test.mjs
tools/pti-mcp/blinkit/README.md
tools/pti-mcp/blinkit/payment-match.mjs
tools/pti-mcp/scripts/build.mjs
tools/pti-mcp/scripts/verify-blinkit-host.mjs
tools/pti-mcp/src/access.ts
tools/pti-mcp/src/apps.ts
tools/pti-mcp/src/blinkit-events.ts
tools/pti-mcp/src/blinkit.test.ts
tools/pti-mcp/src/blinkit.ts
tools/pti-mcp/src/index.ts
tools/pti-mcp/src/morsel-blinkit-http.ts
docs/morsel-blinkit-local-reader-status.md
docs/morsel-blinkit-backfill-status.md
```
