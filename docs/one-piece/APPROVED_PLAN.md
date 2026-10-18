# One Piece family viewing — approved implementation contract

Approved in this chat on 2026-10-18. Owning repository: Wolfrine/PTI. Implementation branch: `codex/one-piece-family`, created from freshly fetched `origin/main` at `24b4805cf7294ac9850f2a8f0281e189779b5c42`.

## Product and boundaries

- One installable PWA at the existing PTI default site's `/one-piece/`, reusing Firebase Google authentication and the default database.
- Three invited family profiles, independent progress, Android phones/tablets and desktop/laptop browsers. V1 is home-network only; remote delivery is deferred.
- Watch locally, through PC-to-TV HDMI, or Google Cast. Actual TV Japanese audio and full English subtitles are required acceptance evidence.
- Always-on Windows PC companion, bounded automatic current/next cache, source adapters, no manually managed video files or separate required catalogue UI.
- Free-first: no paid cloud processing, storage, relay, subscription or registration without a separate spending decision.

## Source truth

- `one-piece-0001-1000-1999-horrible-subs`: 999 MKV originals, episodes 1–589 and 591–1000, no MP4 derivatives. Episode 944 exists under a SubsPlease filename.
- `20260622_20260622_0310`: 85 MKV originals and 85 MP4 derivatives, episodes 1001–1085; separate SRTs only for 1068/1071/1074.
- Combined: 1,084 distinct numbered episodes; 590 missing; 1086+ outside supplied collections. Inventory is not proof of universal playability.
- First sampled originals: H.264/AAC Japanese/embedded English ASS. Later sampled originals: HEVC Main10, default English audio, separate Japanese audio and full-English versus signs/song ASS tracks. Never trust default track selection.

## Mandatory stage gate

1. Compare real direct/browser processing, Jellyfin-assisted, and installed VLC/native paths, initially episodes 1 and 1001, then 1/500/944/1000/1001/1044/1085.
2. Prefer a mature media engine, but do not assume Jellyfin's remote STRM and embedded subtitle preparation passes. Measure video **with required audio and subtitles ready**, transferred bytes, startup, seeking and cache behavior.
3. Pilot targets: cold <=15 seconds; warm start and seek recovery <=5 seconds. Prove trusted LAN HTTPS and actual Sony Cast rendering/controls/transition before substantial UI work.
4. A systematic failure blocks full UI work. Report comparative evidence and a revised proposal; do not silently implement a custom media server or hide preparation delays.

## Companion and security

- Runtime, binaries, source/subtitle/transcode temporaries and media cache on `H:/PTI-OnePiece`; all media temporaries share a hard 20 GiB limit. Do not put media on nearly full F:.
- Trusted LAN HTTPS planned via a free DNS hostname, public CA DNS-01 certificate and pinned Caddy DuckDNS module. No internet port forwarding, viewer VPN, self-signed certificate bypass or assumed HTTPS-to-LAN-HTTP access.
- Protect credentials outside Git. Loopback-only engine administration. Allowlisted source IDs, bounded upstream requests, cancellation, rate-limit handling, no arbitrary proxy URLs.
- Firebase identity/family membership at companion API; receiver-compatible episode-scoped media/caption tickets. Never distribute administrator keys.
- Fix the existing legacy Firestore grant's namespace exclusion as well as adding explicit new family rules.

## Product acceptance after the gate

- Library + Watch, continue, search/ranges, source-independent episode IDs, Japanese/full-English defaults, audio/subtitle controls, fullscreen, keyboard/touch, previous/next and autoplay.
- Stop at missing 590 with explicit continuation to 591; seamless source transition 1000→1001; collection-ended state after 1085.
- TV authoritative while casting; persistent remote, controls, queue, sleep/reconnect and position-preserving transfer back. HDMI uses the same player.
- Scoped One Piece manifest/worker and root PTI worker navigation exclusion; safe post-login full-page return; complete default Hosting artifact deployment preserving sibling apps.
- Independent implementation, visual critique and QA agents. Required Central design direction and review cycles apply after technical feasibility passes.
- Real Android/desktop installation, actual HDMI/Cast, three concurrent streams for 60 minutes, profile/session conflicts, recovery/failure/security tests and rollback evidence.

## Current status

Pilot started. No production application, firewall change, service installation, DNS registration, certificate or deployment is yet accepted. Evidence records must distinguish file metadata, headless decoding, visual rendering, listening, and actual receiver playback.

## Subsequent owner clarification

The owner asked whether custom DNS could be set up locally instead of creating an external DuckDNS account. An ephemeral mDNS/health pilot was authorized by that clarification. Local naming has been demonstrated in desktop Chrome; no external DNS account was created. This does not establish trusted TLS, Android networking, or Cast access and does not silently replace the approved HTTPS security gate with production HTTP.

## Owner continuation approval — 18 October 2026

After inspecting the pilot, the owner explicitly approved: “Automatic preparation is fine. Keep the five-second warm playback/seek target, use local DNS, and continue with the remaining checks and full implementation.”

This supersedes the 15-second uncached-start stop condition. Uncached episodes may have a visible, cancellable automatic preparation wait; the measured downloads alone took 29 and 128 seconds before further checks/engine work. Warm rendered playback and seek recovery still target five seconds. Use local DNS; do not create an external DNS account by assumption. Continue backend implementation and the remaining secure networking/device tests, then the full PTI PWA and release within the existing scope. Security, full-episode, mobile/installation, TV/HDMI, concurrency and preservation acceptance still require actual evidence.

## Owner transport approval — 18 October 2026

After the real Sony rejected the private local CA, the owner explicitly selected “Approve local HTTPS controls + LAN HTTP Cast media.” The question disclosed one-time PC/Android household public-CA trust and the ability of a LAN observer to capture/replay short-lived episode-scoped media capabilities until expiry. Firebase and administrator credentials remain HTTPS-only. This approves implementing that local-DNS hybrid, installing the public CA on the PC, and providing Android setup. It does not establish Android installation, firewall reachability, reboot startup, or end-to-end production Cast acceptance.
