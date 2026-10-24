# Prepared UTF-8 subtitle repair — 24 October 2026

The reported connection failure was a playback preparation failure. Trusted `/runtime-health`, app-origin `/api/health`, CORS/private-network preflight and the owner's authenticated API requests all succeeded. The active local episode 12 session failed with `CAPTION_LINEAGE`. A direct address-bar visit to `/api/health` correctly returned `origin-denied`; the public connection test is `/runtime-health`.

## Reproduced cause

The cached original and prepared episode 12 already existed. The saved 22,434-byte full-English VTT matched its recorded SHA256 and contained 339 cues. Jellyfin's second serialization of that external VTT returned 22,437 bytes and changed one character in cue 192 (14:57.710–14:59.160): UTF-8 `ï` (U+00EF) became U+251C plus U+00BB. Cue timing was unchanged, but dialogue integrity correctly failed. This is encoding corruption, not an acceptable formatting difference.

## Repair and boundaries

The prepared session reads only its exact managed sidecar, rejects links/outside paths and files over 16 MiB, and verifies both the saved SHA256 and original canonical cue identity before readiness. It retains verified bytes for the session, so subsequent file changes cannot alter an admitted response. Existing session, family, ticket, expiry and exact resource authorization remain mandatory. Video delivery still uses the private engine's existing bounded static MP4 path. No text normalization exception, disabled integrity check, cache migration, source download, video conversion, certificate change or TV action is needed.

## Verification

- Focused prepared suite: 13/13. Regression includes accented/non-Latin UTF-8, GET/HEAD, whole-document Range response, cancellation, unsupported method, byte/cue tampering, changed timing, path substitution, link/oversize rejection, retained bytes and revoked-session access.
- Full companion suite: 245/245; One Piece app suite: 85/85; Angular ChromeHeadless: 30/30. Both production builds passed (existing Angular stylesheet warnings). The current Home contract check passed.
- Real cached episode 12 candidate: 59 ms readiness, 3 ms caption delivery, 339 cues, exact byte and canonical identity matches, Japanese audio and English subtitle selection. Initial and 80%-offset video range reads returned HTTP 206 / 65,536 bytes in 82 ms and 30 ms respectively.
- These are actual cached media and transport checks; no TV was controlled, no decoded picture/sound or physical phone acceptance is inferred. Installation and live API verification are recorded separately in the delivery evidence.

Source engine API inspection used the installed `Jellyfin.Api.xml` and [Jellyfin's subtitle controller](https://github.com/jellyfin/jellyfin/blob/master/Jellyfin.Api/Controllers/SubtitleController.cs). The repair uses no undocumented engine parameter.
