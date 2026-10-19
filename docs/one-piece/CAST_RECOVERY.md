# Cast pause and repeated-discovery recovery — 19 October 2026

The owner reported losing Cast after pausing episode1. Their phone could still reach/authenticate with the PC; the TV dialog reported an error followed by “No TV found.” This is an incident repair, not a media-engine or theme change.

## Observed before the fix

Read-only calls to the actual managed companion returned episode1 `PLAYING`, owned by the current session, with English subtitles enabled. One discovery call succeeded in5286ms; a subsequent call returned503 `cast-unavailable` in5150ms while playback remained owned/playing. The family had recovered playback without agent LOAD/PLAY/PAUSE/STOP. The exact original pause-time exception was not retained by the old worker, so that event is not retrospectively claimed as proven.

The installed PyChromecast implementation provides concrete lifecycle defects in the old adapter:

- Each scan created new Chromecast objects for already known TVs. Discarding one through `Chromecast.disconnect()` unconditionally joins its unstarted Python thread, raising `RuntimeError`; the worker reduced this to `cast-unavailable`.
- The adapter closed the discovery browser/resolver at the end of each scan, despite retained sockets needing service resolution for later reconnects.
- A stopped socket could still have `is_connected` true (`not connecting`). Checking only that property could reuse a stopped thread; `wait()` then attempts to start it a second time.
- The UI replaced all discovery failures with an empty list and asserted that no TV existed. This contradicted the live successful playback observation.

Installed source: `H:/PTI-OnePiece/pilot/tools/python/pychromecast/__init__.py`, `socket_client.py`, `discovery.py`. Primary upstream [discovery lifecycle](https://github.com/home-assistant-libs/pychromecast/blob/master/pychromecast/discovery.py) and [Chromecast connection methods](https://github.com/home-assistant-libs/pychromecast/blob/master/pychromecast/__init__.py) document the same API ownership model.

## Repair

The private worker retains one CastBrowser/Zeroconf resolver for its lifetime, creates a socket only for a new or stopped device, and preserves live/reconnecting sockets and bindings. Replaced sockets must regain the existing fresh raw platform/media session and exact-content proof before any control; no cached state authorizes control. Local socket release never sends receiver/media STOP and never joins an unstarted thread. Worker shutdown closes the resolver after its local sockets.

Failed UI scans retain known TVs, display retry guidance instead of a false no-TV result, clear old errors on successful retry, and label unavailable devices correctly. A background search cannot reopen a dismissed dialog. Authentication, media tickets, tracks, cache, playback files and receiver takeover policy are unchanged.

## Verification and release boundary

Focused Cast checks16/16; full companion227/227; frontend84/84 at the candidate checkpoint. The ten-minute pause test advances an isolated clock, omits phone renewals, and verifies receiver observations retain the paused lease, position and subtitles before resuming. That is synthetic coverage, not a physical ten-minute pause test.

Read-only LAN candidate check found the actual Bedroom TV three times through one worker in6019/78/38ms and confirmed that its owned diagnostic worker exited. It issued no playback commands and fetched no episode bytes. Evidence: `evidence/cast-recovery/candidate-discovery.json`. Reproduce with pinned Node and `PTI_RUN_CAST_DISCOVERY=1 node apps/one-piece/companion/test/cast-discovery-real.mjs --evidence <path>` on the configured PC.

The family is actively watching during preparation. Do not activate/restart the managed companion until the owner authorizes the interruption or a fresh observation establishes no active viewing. Actual paused-TV resume/seek/subtitle behavior on the installed fixed runtime remains pending until tested and recorded. The older end-of-episode issue is not silently declared fixed by this repair.

Central0.1.0 mechanical UI repair: retain existing light/dark direction; inspect failed and remembered-TV dialogs at desktop/mobile sizes. Candidate fingerprints, captures and live release outcomes are recorded separately.

## Follow-up: receiver status and reconnect links

The discovery repair was installed as companion `5bec604b2419543daab6234f24d58faff63a8176` and PR52 was deployed successfully. It fixed the reproduced repeated-scan failure, but did not establish that the family's complete pause/disconnect incident was resolved.

Real production checks on that release produced mixed results:

- Attempt1 retained pause, position and captions for90seconds, then reported ownership lost by120seconds. A subsequent passive receiver check found no running media app. The exact receiver event was not captured.
- Attempt2 retained pause for150seconds and resumed in341ms, but a later observation again found ownership lost. The owner subsequently reported using the physical Sony remote to lower volume and rewind shortly before the cast ended. This is a useful event sequence, not proof that either physical button caused the loss.
- A separate real check used normal protected app APIs to pause30seconds, resume, reduce volume and rewind10seconds. It stayed owned/playing with captions for another120seconds. Volume and seek responses took227ms and197ms respectively. App controls are not a physical-remote acceptance test.

Two further defects were identified from source review and isolated regressions:

1. The installed PyChromecast receiver parser replaces its application state when processing a volume-only message without `applications`. The adapter's old negative-status path could then return `UNOWNED` without the fresh raw proof required for its positive-status path. Node interpreted that as definite ownership loss and revoked media URLs. Uncertain status must instead fail freshness without retiring valid playback; cached state must still never authorize a control.
2. After true ownership loss, CastBridge revoked tickets while the API retained their cached delivery URLs. A retry could reuse those invalid links. Matching ownership loss must clear the cache, while callbacks from an older profile/session/generation/authority epoch must leave newer local or Cast playback intact.

Important compatibility observation: the real Sony's idle GET_STATUS replies can omit `applications` entirely. Tightening active-session loss evidence must not make an idle TV undiscoverable or prevent a new admitted LOAD. Do not conflate an unsolicited partial message with a complete correlated query reply.

Evidence for the production checks is retained under `evidence/cast-recovery/`. The physical-remote incident and long-running stability remain separate acceptance items until measured on the final installed candidate. No original source files were downloaded for these checks; the already prepared episode1 was reused.

The follow-up candidate passed229/229 companion tests. Independent review passed38/38 scoped API/discovery/transport/bridge tests and additional cases using the actual installed PyChromecast receiver parser, including idle admission, unsolicited volume-only updates, mismatched request IDs, and superseded idle replies. Command authority still requires fresh exact receiver-session/content proof. This automated checkpoint precedes the installed-candidate hardware check; it is not a claim of physical-remote acceptance.
