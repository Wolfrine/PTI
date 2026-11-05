# One Piece receiver startup repair — 5 November 2026

The owner reported a failed Cast attempt from episode 48 at 21:52 IST. The TV picker retained Bedroom TV with “Already in use” alongside “The TV is not responding.” This repair changes only companion receiver startup and safe diagnostics. It does not change the player, authentication, media preparation, saved progress, firewall or other PTI apps.

## Measured incident evidence

- The installed companion was release `a809e2cde8f826668524a178feadb946c24ce4bb`, with source on F:. Its backend, HTTPS proxy, Cast-media listener, DNS and media engine were running on their expected bindings. Strict public-certificate HTTPS health and PTI-origin API health both returned 200. No listener rebinding was necessary.
- A separate read-only worker discovered the actual Sony BRAVIA VU31 / Bedroom TV three times in one process, in 7217 / 5 / 4 ms. That diagnostic worker exited. The TV and PC were on the configured household subnet; the production worker also had an established Cast connection. Discovery and socket reachability were therefore available during investigation.
- Fresh receiver observations identified `AndroidNativeApp`, displayed as Spotify, with the Cast media namespace. A later observation showed actual paused Spotify media. This was not an active One Piece session. The sole saved One Piece lease was local and had expired; it was not a stale active Cast lease requiring deletion or forced takeover.
- The private diagnostic timeline recorded a LOAD followed by `cast-ownership-lost` after 54 ms at 16:20:54 UTC, another LOAD followed by `cast-unavailable` after about 3 seconds at 16:21:48 UTC, and later rapid ownership failures. Some busy failures had been collapsed to `internal-error` by the diagnostic allowlist.
- The picker retains previously discovered rows after a failed LOAD. Thus an error and an old busy row can appear together. A fresh busy result here was justified by Spotify; that label is not proof that the home PC owns a One Piece session.

These observations do not retrospectively prove the cause of every failed attempt. In particular, the three-second `cast-unavailable` event lacks a retained underlying library error. Current reachability is not proof that discovery was continuously healthy at the screenshot time. A fresh firewall-rule readback was unavailable; existing rules were preserved.

Private, sanitized machine evidence and command logs are retained at `F:\Workspace\Codex\2026-11-05\one-piece-cast\outputs`. No credentials, media capabilities, native conversation transcripts or private profile identifiers are added to this repository.

## Reproduced defect and repair

The installed PyChromecast `MediaController` sets `app_must_match=False`. Its sender only launches its supported app when the current app lacks the media namespace. With a synthetic socket representing the actual Spotify namespace, the installed controller emitted **one LOAD and zero launches**. That directs the request to the wrong receiver app.

A second isolated reproduction established that `play_media` can return while the library's app-launch callback is still pending. The old confirmation loop immediately rejected the still-visible previous app as ownership loss, before the requested receiver could become ready.

[`cast-bridge.py`](../../apps/one-piece/companion/src/cast-bridge.py) now sends one explicit Default Media Receiver LAUNCH after the existing idle/ownership or explicit takeover admission. It requires a fresh raw receiver response with the intended app, media namespace and matching transport before sending LOAD once. The first observed intended session is pinned even while its media channel is opening; replacement before or after LOAD fails ownership. Launch and playback confirmation share an 18-second deadline, with an in-flight bounded status request able to finish afterward. Missing acknowledgements cause observation rather than repeated LAUNCH or LOAD.

Only the exact freshly observed, explicitly displaced app/session/transport may remain during launch. A different foreign identity still fails. Playback success and all later commands retain the existing exact receiver-session, media-content, raw-status and lease checks. Read-only discovery/status never launch an app. Cached ownership does not authorize recovery, and unrelated playback is never automatically taken over.

The diagnostic allowlist now retains the safe `cast-tv-busy`, `cast-load-not-confirmed` and `cast-command-not-confirmed` codes instead of recording them as an undifferentiated internal error. Exception text and media URLs remain excluded.

## Verification and acceptance boundary

The isolated regressions exercise delayed launch, an unchanged app that never launches, rejected/missing launch acknowledgements, changed app/session/transport, foreign replacement after receiver admission, and refusal without takeover. They require a single LOAD, preserve the requested resume position and full English subtitle URL/language/track 1, and prohibit a STOP on unrelated playback. Existing tests cover failed-load local recovery, ticket rotation, deliberate rewinds, paused Cast lease renewal, subtitle retention and receiver-to-local position handoff.

At the software checkpoint, all 248 companion tests passed under the installed pinned Node 24.19.0, all 85 One Piece frontend tests passed, all 107 PTI tests passed in ChromeHeadless, and both production builds passed with existing Angular warnings. The default shell's older Node 20.13.1 failed the existing stream-diagnostics ordering assertion; that check and the full suite passed with the production runtime. The Home-contract check and whitespace check passed.

No UI source changed and no new visual acceptance is asserted. The local build's fingerprints differ from the historical October design record; that record was not rewritten to claim a new reviewed candidate. Native browser verification could not complete because the browser host was unavailable and native screenshot capture timed out.

Bedroom TV was accessible for real read-only inspection. A new controlled One Piece playback/subtitle/resume test was not performed while it was occupied by Spotify. That remains a physical-device acceptance step after installation, separate from the reproduced software defects and automated checks. The owner's earlier successful TV playback does not establish acceptance of this repair. Source commit, installed release and Firebase workflow outcome must be reported separately in the delivery result.
