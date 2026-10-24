# One Piece family app — implementation pilot and gate review

18 October 2026 · PTI branch `codex/one-piece-family` · base main `24b4805cf7294ac9850f2a8f0281e189779b5c42`

## Delivery status

The comparative feasibility pilot is implemented and has run against real Archive media. The production PWA, family data, managed companion installation and Hosting deployment have **not** been built or released. The approved cold-start and trusted-network gates are not yet passed. This report preserves the working alternatives and the measured failure, rather than treating a successful demonstration as completion of the family app.

The strongest current candidate is the approved PWA plus **Jellyfin reading automatically cached originals on the always-on PC**. It avoids the severe remote-subtitle extraction and seek delays measured with remote STRM inputs. It requires an explicit preparation wait for uncached episodes: the download alone took 29 seconds for episode 1 and 128 seconds for episode 1001 on this connection, before integrity checks and engine preparation. That changes the approved <=15-second cold target, so full UI work remains at the owner's stop gate.

## Verified catalogue and source access

| Collection | Listed originals | Other video renditions | Coverage |
|---|---:|---:|---|
| `one-piece-0001-1000-1999-horrible-subs` | 999 MKV | None | 1–589, 591–1000 |
| `20260622_20260622_0310` | 85 MKV | 85 MP4 derivatives | 1001–1085 |
| Combined canonical library | **1,084** | Alternatives, not duplicate episodes | **590 missing; no overlaps; 1086+ outside these sources** |

The implemented source adapter handles the SubsPlease filename for 944, differing number widths, source provenance, stable episode IDs, alternative renditions and the missing-590 boundary. No unverified titles were invented. Three separate SRTs exist, for 1068/1071/1074.

For 1, 500, 944, 1000, 1001, 1044 and 1085, real start/middle/end 16 KiB reads all returned HTTP 206: **21 successful requests, 344,064 media bytes total**. Final responses lacked `Access-Control-Allow-Origin` for the PTI origin, and all seven tested OPTIONS requests returned 405. This explains why a browser processing path needs tested source access assistance; it does not imply a plain video element cannot play MKV.

Coverage is verified from the inventories, not from watching all 1,084 episodes. The representative range tests are transport evidence, not full playback/seek/subtitle acceptance. Source inventory, hashes and requests: `evidence/sources/`.

## Comparative playback results

All timings below are measured, but the layers differ. Engine caption/segment responses are not end-to-end rendered player startup.

| Path | Episode 1 | Episode 1001 | Verdict and limit |
|---|---|---|---|
| Original MKV in actual desktop Chrome 155 | Video first playing 5.486s | Video first playing 18.677s, early stalls | Both video formats played on this PC. Native text-track list was empty. Japanese selection for the dual-audio file was not established. |
| Browser native video plus incremental ASS | English cue visibly rendered at 0:18; renderer ready 15.807–17.713s in repeated, partly warm runs | Probe alone 42.736s / 12.15 MB | Credible lighter browser candidate. Continuous captions, full fonts, mobile and reliable dual-audio selection remain unproved. |
| Browser libav fMP4 remux experiment | Read/probe and indexed caption seek worked; remux produced timestamp warnings | Probe only | Not accepted as a player. Buffering a test window is not proof all incremental browser approaches are too slow. |
| VLC 3.0.20 headless | Explicit Japanese/English tracks; decode and 600s seek recovery 2s | Explicit Japanese/full-English tracks; decode and seek recovery 2s | Native baseline works technically. Dummy outputs do not prove screen rendering or listening. It does not supply the requested unified family PWA. |
| Jellyfin 12.2 remote STRM | Full English ASS 88.140s cold / 8.735s warm; seek segment 20.765s | Full-English extraction timed out at 90.078s; selected Japanese HLS segment 26.031s | **Fails approved targets.** Remote embedded-caption extraction waits for a complete scan. |
| Jellyfin using verified local original | See cache table | See cache table | Strong candidate after preparation; individual engine timings meet the numerical warm/seek targets. Full player performance remains to test. |

The initial Chrome native failure ran under restrictive COEP and is retained as **confounded evidence**, not evidence of MKV incompatibility. The first episode-1001 Jellyfin HLS request selected default English because `MediaSourceId` was missing; that run is retained as **invalid-language evidence** and excluded from Japanese results. The corrected engine logs map Japanese track `0:2`. These corrections are documented in their lane reports.

### Bounded local-cache experiment

Only two complete originals were downloaded, each with a finite size/time budget and Archive MD5 verification. Neither the whole series nor a season was downloaded. No viewer managed these files.

| Measurement | Episode 1, H.264 720p | Episode 1001, HEVC Main10 1080p |
|---|---:|---:|
| Original payload bytes | 357,167,311 | 844,716,819 |
| First download time | **29.220s** | **127.871s** |
| Local PlaybackInfo | 0.047s | 0.032s |
| Full-English ASS response, fresh local item | 0.468s / 302 cues | 0.859s / 328 cues |
| Immediate warm ASS response | 0.016s | 0.016s |
| First HLS media segment | 0.343s, video/audio copy | 2.922s, CPU H.264 conversion with Japanese audio |
| Warm HLS media segment | 0.140s | 0.469s |
| Fresh generated-segment seek at nominal 600s | 0.235s | 2.875s |

These recently downloaded and MD5-read files benefit from OS disk caching. They are not a cold-boot or concurrent-load benchmark. Correct track metadata and FFmpeg mappings were inspected; these headless engine responses do not independently establish audible Japanese or visual synchronization. The first remote experiments did not instrument upstream byte counts; those remain unknown. The complete-cache download payload counts above are measured.

Inventory arithmetic shows the six largest originals total approximately 5.01 GiB. That leaves room within the approved 20 GiB for three current/next pairs and temporaries in principle. It does **not** prove concurrent cache admission, eviction, disk pressure or GPU capacity. A production cache must reserve space for all jobs, protect active files, deduplicate preparation and stop before the total limit. Library-wide probing, thumbnails and scheduled scans remain disabled in the isolated pilot.

Evidence: `evidence/jellyfin/README.md`, `evidence/jellyfin/CACHED_CASE.md` and their named JSON/log records. Browser/native evidence and the real caption screenshot are under `evidence/browser-native/`.

## Local DNS and actual Sony TV

**Yes: local naming can be provided without creating a DuckDNS account.** A temporary mDNS responder was implemented and tested. `onepiece-pilot.local` resolved in actual Chrome. Another Windows resolver path was intermittent, so this is not yet a reliable household installation.

The real Sony **Bedroom TV / BRAVIA VU31** fetched a prepared 30-second episode-1 H.264/AAC clip and real, shifted English WebVTT directly from the PC. Both the private-IP URL and a temporary `onepiece-cast.local` URL worked. Receiver logs show video range requests, successful subtitle fetches, active English track, advancing playback, pause, seek and resume. The first prepared load reported PLAYING in 5.016s by IP and 2.500s by local name; repeated runs were warm and faster. These are prepared-clip receiver timings, not uncached episode startup.

The owner replied **“Yes it worked”** to the explicit request to check Japanese dialogue and visible English dialogue subtitles on that TV. After an actual episode-1001 replay, the owner separately confirmed **“Yes, both worked.”** Human audiovisual confirmation therefore covers short clips from **both collections**. An earlier source-2 reply before that clip started was excluded; the exact chronology is preserved in [evidence/network/cast-owner-observations.json](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/evidence/network/cast-owner-observations.json). These confirmations are not full-episode, quantified subtitle-sync, phone-sleep or complete episode-transition acceptance. Follow-up receiver runs also confirmed subtitle track off/on changes. No volume setting was changed.

The network test is temporary, LAN-bound **HTTP media**, with a RAM-only scoped ticket, exact asset allowlist, bounded lifetime/response budget, and cleanup of only its own Cast session. It is not a deployed authenticated companion. The source-2 extension also fetched actual Japanese-mapped H.264/AAC and full-English WebVTT, reported PLAYING in 4.015s, and switched a short prepared clip queue from episode 1 to 1001 with English still active. This is a representative cross-source **clip** transition; it is not the required full episode 1000→1001 acceptance. See `evidence/network/` for exact owner observations, requests, state changes and cleanup records.

### Naming and secure access remain distinct

- **Local mDNS / conventional local DNS:** does not require a public account. A conventional `home.arpa` DNS service additionally requires the router/DHCP or clients to use it; merely starting a DNS process on the PC is insufficient. Receiver and Android behavior must be tested. [RFC 8375](https://www.rfc-editor.org/rfc/rfc8375.html)
- **Local private-CA HTTPS:** can secure a local hostname after client trust setup. PC trust does not automatically transfer to Android or the TV. No private CA has been installed; receiver trust remains unproved. [Caddy local HTTPS](https://caddyserver.com/docs/automatic-https#local-https)
- **Owner-controlled public hostname + DNS-01:** remains a way to obtain an ordinarily trusted certificate while keeping media LAN-only and opening no inbound internet ports. It requires domain/provider control. No account was created or token requested in chat. [Let's Encrypt DNS-01](https://letsencrypt.org/docs/challenge-types/#dns-01-challenge)
- **Modern Chrome local-network permission:** Google's documentation permits certain `.local`/private-IP HTTP requests from a secure public origin after permission. The actual PTI-origin fetch and Android installation remain unproved; the automation's read-only evaluation scope cannot itself perform fetch. A failed official-demo attempt with permission still at `prompt` is inconclusive. This capability does not encrypt HTTP or authorize exposing Firebase credentials. [Chrome LNA](https://developer.chrome.com/blog/local-network-access)

No certificate warning was bypassed, firewall/router setting changed, production HTTP downgrade made or internet media port opened. Tested local naming removes the need to assume external DNS first; it does not close the approved trusted-HTTPS gate.

## PTI fit and implementation changes

The owning repository and current default Hosting pipeline were inspected. `PTI_INTEGRATION_FINDINGS.md` records exact files and required later changes: complete Hosting artifact build/copy, rewrite before Angular fallback, root service-worker exclusion, isolated PWA scope, safe sibling deep-link return through existing Firebase login and exclusion of the new family namespace from the additive legacy Firestore grant.

Implemented in this worktree: real catalogue adapter, bounded range transport, adversarial transport checks, technical browser/native harness, isolated Jellyfin remote/cache experiments, local mDNS/Cast diagnostics and durable sanitized evidence. Only `.gitignore`, `apps/one-piece/` and `docs/one-piece/` are changed. Existing PTI application, database rules, workflows and production data are unchanged. No production UI, managed startup/service, invitation, deployment, paid service or cloud video store was created.

The local worktree is `F:\Workspace\Worktrees\PTI\one-piece-family`. Changes are saved locally and in the accompanying code/evidence ZIP, not committed, pushed or deployed. The ZIP excludes runtime executables, dependencies, media and credentials. Temporary listeners on 8792/8793/8794/8795/18096 were checked closed at completion; the TV was returned to no active Cast app. Two verified originals and bounded derivatives remain on H: for reproducibility; the last engine-media snapshot was 1.80 GB before the small Cast clips. See [evidence/parent-cleanup.json](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/evidence/parent-cleanup.json) and the Cast cleanup records.

## Verification and unresolved acceptance

- Source/transport tests **10/10 passed** against saved real inventory and adversarial mocked network responses; `evidence/sources/tests-final.tap`.
- Browser range-reader tests **7/7 passed**; [evidence/browser-native/tests-final.tap](https://github.com/Wolfrine/PTI/blob/78553b47adfd7105da410e1a9f6cf66fb36c29b9/docs/one-piece/evidence/browser-native/tests-final.tap). Live loopback checks rejected wrong Host/Origin/content type and oversized evidence requests.
- Independent review found and closed bounded-range/freshness and evidence-write hardening issues. Syntax checks and final review/cleanup are recorded separately.
- A parent value-based scan found no active isolated-Jellyfin token or password in the code/evidence. This is a scoped credential hygiene check, not a general security certification.
- Real network/media results are identified above. Mocked failure tests and synthetic NVENC availability checks are not viewing/capacity evidence.
- The owner confirmed Japanese dialogue and visible English subtitles on the real Sony for both short clips. The first-episode desktop ASS cue was also visually inspected and saved as a real screenshot, not a mockup.
- Root Angular tests/build were not run: no Angular/product changes or commit/release is being made. Product UI has not entered visual acceptance; the technical harness screenshot is not the final design.
- Outstanding: full Japanese/English playback across both collections, subtitle timing after long/late seeks, real 1000→1001 episode transition, trusted/authenticated LAN access from PTI, Android/tablet/laptop install, HDMI picture/sound, phone sleep/reconnect, three sessions for 60 minutes, profile conflict/resume behavior, cache pressure, source/network/disk/reboot failures, certificate recovery, production auth/rules, sibling regressions and live deployment/rollback.

Source metadata did not establish a content licence grant. Availability and an integrity hash are not permission to redistribute. Keep access private, respect source restrictions/rate limits and avoid unnecessary copying. [Archive terms](https://archive.org/about/terms)

## Proposed change before proceeding beyond the pilot

Retain the one-PWA/PC-companion/Jellyfin architecture, but feed the engine a verified automatic cache rather than remote STRM for this initial library. Prepare the selected episode and immediate next episode only; expose a cancellable preparation state and retry action. Preserve Japanese/full-English selection and source-independent progress. Continue using direct/copy playback where tested; convert HEVC only for devices requiring it. No native viewer or manual file workflow is required for this proposal.

**Owner decision required by the approved stop gate:** accept visible initial preparation for uncached episodes (the measured download component alone was 29–128 seconds here), while retaining the <=5-second ready/warm/seek targets. Integrity checks and engine work add to this; no guaranteed worst-case preparation time has been established. This is a proposed target revision, not a claim that the original cold gate passed. Do not quietly expand the adapter into a custom media server.

Continue local DNS as the preferred naming investigation, with no external account assumed. Resolve actual Android/PTI access and trusted control/media transport before product UI; the successful local-name HTTP Cast clip is a useful working baseline. If fully local HTTPS trust fails on required devices, return the measured choice between a publicly trusted hostname and an explicitly accepted LAN HTTP media design. Do not weaken production security or create an external account as an implicit consequence of accepting the cache trade-off.

After those gates pass, resume the already approved stages: freeze engine/capability modes and managed cache/startup, design/build the PTI PWA with separate implementation/visual critique/QA agents, family device/load/reliability validation, then controlled complete-site release with rollback. No further general approval of the original product scope is needed.
