# PWA / companion API

The PTI PWA lives at `https://pti-app-2ab59.web.app/one-piece/`. Control origin is `https://onepiece.local:8443`, trusted using the household CA. The owner approved this local-DNS HTTPS control + LAN HTTP Cast-media configuration on 2026-10-18 after the Sony rejected the private CA. Android CA installation and browser LAN permission remain setup requirements.

Every `/api/` request sends `Authorization: Bearer <current Firebase ID token>` and JSON bodies with `Content-Type: application/json`. Caddy supplies its own private proxy header; the browser must never know that secret. Private responses and media are `no-store` and excluded from the PWA worker.

## Account and setup

| Route | Contract |
|---|---|
| GET `/api/health` | `{status,version,setupRequired}` only; no private account information |
| POST `/api/pair-owner` | `{code,confirmOwner:true}`. One-use five-minute code shown only by local PC setup. Fixes verified Google UID; cannot overwrite owner. Never put code in URL. |
| GET `/api/me` | `{uid,email,role,ownerUid,needsWorkspace,needsClaim}`. Setup metadata is allowed for verified owner/pending invite; playback still requires active membership. |
| POST `/api/pair-viewer` | `{googleIdToken}` from explicit fresh Google reauthentication: `GoogleAuthProvider.credentialFromResult(result).idToken`. This is the Google provider token, not Firebase ID token or browser refresh token. PC exchanges/verifies and DPAPI-encrypts its own per-viewer refresh session for unattended Cast. |
| DELETE `/api/pair-viewer` | No body. Disconnect only the verified caller's PC credential, capabilities and active session; use on explicit logout. Works after invitation removal or a family-service outage; still requires trusted HTTPS and a valid Firebase identity. Preserves progress and other profiles. |
| GET `/api/progress` | `{progress:{[episodeId]:record},lastEpisodeId,lease,sync}` for this UID only. |

Client uses the Firebase user SDK and reviewed rules for owner workspace creation, invitations, one-use invited UID claim, and self preferences. See `INTEGRATION_IMPLEMENTATION.md` for exact namespace/schema. Never reset an existing/disabled workspace during setup. One profile per verified Google account; other family members' progress is private. Defaults are Japanese, full English, hidden spoiler titles, explicit persistent autoplay.

Firebase token signature and expiry are checked on every control request. Routine progress/session reads, heartbeats and ordinary TV controls can reuse a positive membership decision for less than 60 seconds; setup, pairing, session/episode admission, handoff and explicit Cast Next use a fresh decision. Fresh denial invalidates that caller's grant, and a late older response cannot restore it. This API cache is separate from the PC credential's independently bounded membership check; neither extends the other's expiry.

Public build catalogue has 1,084 listed episodes plus missing row 590 and source provenance. It excludes original filenames/media URLs/checksums. Use verified titles where available, hidden by default; do not invent titles, arcs, thumbnails or durations.

## Viewing

| Route | Contract |
|---|---|
| POST `/api/sessions` | `{episodeId:'one-piece-0001',deviceId:<stable browser random id>,takeover?:true,audioIndex?:integer}` → `202 {lease,...state}`. Different-device conflict is `409 active-session`; explicit takeover required. |
| GET `/api/sessions/{id}` | `{lease,episodeId,episodeNumber,state,progress,next,error,playback,cast,sync}`. Playback is inspected duration, selected indices, mode and tracks; no engine URLs. Poll about every two seconds. |
| POST `.../renew` | `{}` renews local lease. Optional `{autoplay:boolean}` applies the active TV policy and returns `{lease,autoplay,cast}`; turning off replaces the queued receiver load with the same warmed episode at its actual position, preserving paused state/subtitles/volume. Use ~30-second heartbeat while paused/watching. Receiver observations renew Cast while sender sleeps. |
| POST `.../delivery` | `{}` → `{episodeId,mediaUrl,subtitleUrl,contentType,durationSeconds,expiresAt}` when ready. hls.js for HLS if no native support; attach English WebVTT default showing. Cache URL only in memory; renew before expiry. |
| POST `.../events` | `{episodeId,generation,authorityEpoch,revision,positionSeconds,reason}`. Reasons: `heartbeat,pause,seek,restart,ended,transition,mark-watched`. Increment/serialize revision using acknowledged lease. Submitted duration is ignored. Local events rejected during Cast. |
| POST `.../episode` | `{episodeId,automatic:boolean,audioIndex?:integer,positionSeconds?:number}` prepares same-session next/manual selection. Automatic is strictly current+1. Changing audio rebuilds delivery; preserve position. While casting, explicit selection pauses/stops only this app's captured TV session, rotates authority, prepares visibly and reloads that TV; it does not interrupt another app that takes over during preparation. |
| DELETE `.../{id}` | Close own session/resources. Do not close merely on hiding a Cast controller. |

The explicit `prepared-mp4` installation mode prepares a complete conventional MP4 with its front seek index and full-English WebVTT before marking playback ready. Compatible H.264 video is copied; unsupported video is converted to 8-bit H.264, with the selected audio recorded separately from the original track indices. The rendition identity includes the source checksum, selected tracks and preparation recipe. Current and immediate-next presentations are pinned in the shared 20 GiB cache; independent viewers share a preparation job. No separate viewer file management is required.

Cold preparation includes actual download/integrity, metadata, full English captions, the complete prepared video and finite engine import. It may take minutes; automatic preparation was explicitly accepted by the owner. Show actual phase/bytes and never promise five-second cold startup. Warm target remains five seconds and rendering has its own acceptance check. A receiver launched from idle has separate discovery/launch latency.

590 must stop automatic playback; continuation to 591 is explicit. 1000→1001 preserves destination/tracks/progress. After 1085 explain these collections ended. No Netflix integration.

Progress is durable on the PC before acknowledgment. `sync.state:'pending'` means saved locally with bounded cloud retries. The latest-state cloud projection preserves position/reason/time and accepted ordering, including intentional rewinds. It does not choose max(position).

## Cast

The PC controls Google's Default Media Receiver via private persistent IPC, so the PWA requires no browser Cast SDK and casting survives phone sleep.

| Route | Contract |
|---|---|
| GET `/api/cast/devices` | `{devices:[{receiverId,name,model,available,busy,owned}]}`; discovered UUID only. |
| POST `.../cast` | `{receiverId,positionSeconds,takeover?:true,autoplay:boolean,subtitleEnabled?:boolean}` → `{lease,cast}`. Pause local video before admission. Authority epoch changes and local URLs revoke. Busy TV needs explicit takeover; current volume preserved. |
| POST `.../cast-command` | `{receiverId,action,value?}`; action `play,pause,seek,volume,subtitles,next`. Seek seconds, volume 0–1, subtitles boolean. Next waits for immediate-next preparation, never silently skips missing episode. |
| POST `.../disconnect` | `{receiverId}` → `{lease,episodeId,positionSeconds}` read from actual receiver. Fetch new local delivery and resume there. |

Read returned receiver state before saving progress after reconnection. TV is authoritative. Failed Cast admission requires fetching current lease and fresh local delivery; never reuse revoked local URLs. HDMI uses local fullscreen player.

Media capabilities are `/m/<192-bit token>/<canonical episode>/<encoded engine resource>`. HTTP listener accepts media GET/HEAD/OPTIONS only, exact authorized graph/current lease, no credentials/cookies, API routes, arbitrary URLs or filesystem paths. Never persist capabilities in localStorage/history/service-worker cache/logs. Old generation/epoch, expiry, replacement and revocation fail closed.

Completed MP4 responses use exact verified byte lengths and single explicit/open/suffix byte ranges; HEAD ignores Range and describes the full file. The loopback engine transport rejects redirects, inconsistent headers, truncated/excess bodies and unbounded paths. Header, stalled-read and overall-response deadlines are distinct, so downstream backpressure does not trigger a short body timeout.

Open responses are also registered for revocation. Closing/replacing a session, rotating authority, explicit sign-out or shutdown aborts its affected responses. Ticket expiry has its own timer. During long responses, ticket checks precede emitted chunks, and lease/viewer authorization is rechecked at least every second using the existing `ViewerCredentials.getAuthorized()` membership window of at most 60 seconds. Output pauses while a check is pending; this layer adds no second positive membership cache. Bytes already buffered on a device cannot be recalled.

Distinct UI states: preparation, source timeout/rate limit, missing590, collection ended, companion offline, certificate/LAN permission, uninvited, viewer reauthentication, same-profile takeover, disk pressure and expired session. Use plain language with relevant retry/setup/sign-in/continue actions. Never expose raw diagnostic payloads or credentials.

Session creation/episode selection also accept `audioLanguage:'ja'|'en'`. The engine resolves this against each episode's inspected tracks. Queued transitions inherit the effective language, rather than reusing a release-specific numeric track index. The primary default remains Japanese. An absent optional English audio track falls back to available Japanese and the UI reports the effective selection.

Closed sessions retain a private final lease projection solely for retrying durable progress after a cloud outage. The PC's active lease and all media capabilities stay closed. A bounded startup scan restores pending profile journals; the background mirror retries even when no player remains open.

These are implemented adapter contracts; fixture checks are not full authenticated-family, rendered-player, installed-PWA or production TV acceptance.
