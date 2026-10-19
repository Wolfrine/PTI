# One Piece install and login repair — 19 October 2026

Historical stage, superseded by [SINGLE_APP.md](SINGLE_APP.md). One Piece now owns sign-in directly; its deployment contains no Angular/PTI login or directory, and old app/login links are redirect aliases.

The owner reported no One Piece entry in the Android app drawer, an old One Piece URL in PTI's new app directory, and PTI branding on login. An actual signed-in live PTI browser reproduced the old directory href `/one-piece/?ngsw-bypass=true` while current source and deployed server artifacts contain the dedicated origin. This establishes a stale installed Angular client. Android installation itself cannot be established from a webpage or desktop check.

The root app now checks for updates and offers an explicit activation action with recoverable failure. Future root-worker navigation prefers the network. Already-loaded old code cannot acquire a new banner retroactively: reopen [PTI with a fresh navigation](https://pti-app-2ab59.web.app/home?ngsw-bypass=true) once. No browser storage, credentials or progress are cleared. The canonical launcher remains [One Piece](https://pti-app-2ab59-one-piece.web.app/one-piece/), opened externally.

The existing Google login is retained. One Piece context now shows family sign-in copy and cream/coral branding; the dedicated origin defaults safely to `/one-piece/` rather than a cloned PTI home page. Valid episode/query/hash returns remain intact; ordinary PTI login remains PTI. Update prompts use the same app identity.

One Piece now shows installation near the top, explains that opening a website does not install it, and distinguishes Android Install from Create shortcut. Accepting the browser prompt or receiving `appinstalled` marks installation requested, not proven app-drawer completion. These handlers patch text without replacing the media DOM. The PC companion, media engine, Cast transport and Google authentication methods are unchanged.

Validation:68 One Piece frontend tests passed, including safe sign-in return behavior. Two actual ChromeHeadless155 update tests passed: no premature activation; activation failure preserves a useful retry state. Independent reviewer reran55 auth/frontend checks and reviewed source. Full Angular/default/dedicated builds passed with existing warnings. Parent inspected actual built Angular login/update at1440×1000 and390×844; horizontal scrollWidth equals clientWidth. Install banner/help renders use explicitly labelled synthetic account/progress with real catalogue/artwork. Reviewed fingerprints and four captures are retained in `design/evidence/install-repair/`.

Physical Android installation/app drawer, real phone launch and the previously unconfirmed new-origin browser-to-PC connection remain separate acceptance gaps. No TV playback, companion restart or media preparation was started for this repair. Existing Sony end-of-episode issue remains.
