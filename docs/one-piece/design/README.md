# One Piece visual direction record

Status: **B, The ship log, implemented and reviewed through five substantive cycles; final candidate-bound record in assembly**. 18 October 2026. Independent critics compared the directions and final real-media presentation; the parent separately inspected rounds3/5. This does not certify owner acceptance, the deployed product or physical-device tests.

Designer: `/root/visual_designer`. Parent/QA: `/root`. An independent visual critic will review comparable rendered candidates after the network gate and the parent's explicit implementation GO. The product owner has approved automatic uncached preparation and retained the five-second warm playback/seek target. This record does not reopen that decision or certify remaining device/security tests.

Guidance snapshot: Central plugin **0.1.0**, base `ba1235fe7b220842778414f3f70fca38e7df4c53`; bundled visual-design-director, designer and perception guides. Also read root AGENTS, the approved plan/current continuation, Stage 1 report, `agent-output-quality`, `ui-visual-verifier` and existing PTI Tracker design memory. Tracker's visual direction is not inherited by this sibling app.

## Product and task

One private family viewing application within PTI at `/one-piece/`. The daily job is to continue or find a numbered episode, then watch in Japanese with full English subtitles on this device or the family TV. The unified catalogue contains **1,084 episodes**, with **590 unavailable** and no episodes after 1085 in the supplied collections. Source choices and automatic media preparation are infrastructure, not competing catalogues or file-management tasks.

The working interface has Library and Watch. Keep account identity, watch destination and preparation/playback state legible. Future titles and imagery stay hidden by default. Do not introduce unverified titles, arcs, durations, watched counts, ratings, thumbnails or banners. No reference poster art ships with the application. Actual catalogue facts may be shown; fabricated progress is limited to explicitly labelled development fixtures.

## Intended eye path and perception prompts

- **Library:** continue/start action → current episode number → search/range navigation → ordered episodes. Account and TV destination are stable supporting controls.
- **Watch:** the actual picture/captions → playback state and timeline when controls are shown → current episode/next episode → audio/subtitle/destination settings. While casting, the remote controller replaces the inactive local player as the working object.
- **100 ms prompt:** is Continue/Start, the video, or the remote the single dominant object appropriate to the current surface?
- **One-second prompt:** can a viewer identify which episode and destination are active, including preparation or unavailable states?
- **Five-second prompt:** can a viewer find episode 944, continue the current episode, or pause the TV without parsing source filenames?

These are review prompts, not measured human perception claims.

## Critical visual dimensions declared before scoring

| Dimension | Observable pass condition in desktop and phone renders |
|---|---|
| Viewing purpose / focal hierarchy | One primary Continue/Start/Resume action; episode, destination and preparation state are explicit; search/range controls do not compete at the same emphasis. No decorative hero hides the actual task below the first phone screen. |
| Sequence and state clarity | Episode numbers align and stay readable; current, watched and unavailable use text/shape as well as colour; bounded range navigation can reach 944 without scrolling 900 rows; 589/590/591 and 1000/1001 remain correctly ordered. Preparation and errors offer honest, useful actions. |
| Composition and rhythm | Spacing and containment follow the continue/browse/watch task, not repeated equal-weight cards. Dense catalogue rows remain grouped and readable; sparse/fresh states still look intentional. Current selection and secondary context are easy to distinguish. |
| Typography and material craft | Episode numerals, action labels and metadata form deliberate readable levels with aligned baselines; meaningful phone metadata is at least 14 px. No decorative texture, excessive capitals, low-contrast fine print or uncontrolled type mix competes with the task. |
| Product identity and imagery discipline | A coherent number, type and line language suggests a voyage through numbered episodes without pirate decoration, fake maps, copied anime art or generic dashboard filler. The identity survives a sparse no-progress state. Future titles/art remain hidden and no fabricated content supplies richness. |
| Responsive Watch continuity | At 390 px and 320 px: clear grouping, controls approximately 44 px or larger, no horizontal document overflow, no cramped desktop replica or fixed overlay covering content. The video/captions dominate Watch; local/preparing/remote states retain episode identity and useful controls. Returning preserves library context. |

Independent critic and parent each judge all six dimensions and overall. These align with the separate critic's declared dimensions in `CRITIC.md`. No designer acceptance score is recorded. QA, runtime correctness and cycle count cannot raise a visual score.

## Comparable candidate content and viewports

Render each direction at **1440×1000** and **390×844** with exactly the same content; check 320×740 during implementation. Comparable development fixture: active account label `Family viewer`, Continue Episode 1000 at 10:00 of 24:00, Japanese audio / English dialogue subtitles, range 991–1010. The progress/duration/account label are **synthetic design-only fixture values**, always labelled outside the candidate viewport in the direction review tool. Production reads the active authenticated UID and actual session data. Never ship a fixture fallback that appears to be real family progress.

Companion/source/engine details belong in an optional status/details panel. Normal preparation copy: `Preparing episode 1001` with a measured stage or bytes when available, `You can keep browsing`, and Cancel. Do not invent percentage or estimated completion time. A warm episode says `Ready`; no guarantee badge implies every episode starts within five seconds.

Required candidate/interior states: Library with continue; fresh account/start; Watch local; Cast remote; automatic preparation; missing episode 590; companion unavailable; search with no result. Implementation review additionally covers long account names, progress sync/takeover, 1085 end state and delayed/failed source preparation.

## Reference and direction gate

Actual reference pixels inspected by designer on 18 October: [reference mechanisms](REFERENCES.md). Three materially different proposals are in [DIRECTIONS.md](DIRECTIONS.md). After the owner approved local HTTPS controls and limited LAN HTTP TV media, the parent gave implementation GO. All three Library/Watch directions were rendered at 1440×1000 and 390×844 and inspected live by the designer and independent critic. The critic selected B and the parent separately approved it. Those development-only candidates contain synthetic progress, duration and viewer states, labelled visibly; they are not playback evidence.

Selected B retains the ruled episode rhythm, serif title/mono sequence numbers, compact Continue and quiet reading surface. Reject A's vacant hero ornament and C's mostly empty master/detail workspace. The selected implementation replaces the giant inactive Cast picture with a purpose-built remote. Continue through at least five substantive render/critique/QA cycles; the current record is [CYCLES.md](CYCLES.md), and independent scores belong to `CRITIC.md`. Parent personally inspects rounds 3 and 5 and final desktop/mobile. No unchanged screenshot rescoring counts as a cycle. If a critical dimension fails to improve for two rounds, reopen the direction rather than polishing it indefinitely.

## Frontend contract questions to settle before wiring

- Parent confirmed: the active account is the invited Firebase Google UID/display label. Use existing PTI authentication for identity switching; there is no arbitrary cross-account family profile chooser. Invitations are administrative setup.
- Catalogue endpoint supplies canonical ID/number/availability and verified optional metadata. Renditions and sources are details, not duplicate rows.
- Session API needs explicit preparation stages/cancellation, selected tracks, ready media and caption URLs, duration/position, renewable authorization, active destination and takeover conflict.
- Cast state is receiver-authoritative; a reconnect must read actual episode/position before writing progress. Never display a successful Cast connection solely from a sender click.
- Progress persistence and autoplay are per UID; preserve deliberate rewinds and range/scroll state.

No API or shared PTI files are owned by this design lane. Build and integration details are coordinated with the parent. No production bypass, family data mutation, deployment or app acceptance is claimed here.

Frontend entry directory after GO: `apps/one-piece/web/`, with `index.html`, `src/main.mjs` and `src/styles.css`; parent may own build/test scripts around that contract. Candidate dependencies proposed by parent are plain ESM, esbuild 0.25.12, hls.js 1.7.3 and Firebase 13.0.0. Existing PTI Firebase 11 SDK authentication/session interoperability requires actual testing. A fixture route is permitted only in a separate local development build behind a `__DEV__` define removed by production dead-code elimination. No production authentication bypass or reference image will be shipped.

## Frozen candidate and formal evidence handoff

The frontend is now frozen after keyboard ownership, account identity-boundary, play-promise, logout acknowledgment, explicit native-MP4 routing, development frame-observer and paused-ready status corrections. Current candidate SHA256: `2b9695d3d712208858675d6bb8847b40f790544a49317f4065e24b33c347282a`. Inputs are retained in `evidence/candidate-fingerprint.json`; reproduce with `node docs/one-piece/design/fingerprint.mjs <exact-built-one-piece-directory>`. The binding includes the development-only frame-observer module alongside the fixture source. All 41 frontend regressions and production dead-code checks pass; fresh rendered/media evidence remains the parent's next gate. Earlier formal review records are explicitly superseded until the current candidate is verified and endorsed. [ACCEPTANCE_REFRESH.md](ACCEPTANCE_REFRESH.md) specifies the current 26-state packet requirements without relabelling the 22 prior-candidate nonmedia captures.

`acceptance.json` is deliberately a **pending-evidence draft**, not a formal pass. It binds 22 final states: 16 fresh core renders, two title-search renders using the exact production catalogue and four retained unchanged actual-media renders. All three reference images are bounded under `evidence/reference/`; five historical cycles and parent round3/5 checkpoints remain distinct from final-state coverage. The independent critic personally viewed all22 final images and supplied a candidate-bound scoped visual pass. Parent final image-hash endorsement and QA are left pending rather than inferred.

Actual keyboard testing confirmed native one-percent timeline seeks versus exact ten-second page seeks and single immediate Space toggles. A rapid play/pause then seek sequence exposed an unhandled play AbortError and a later fatal playback interruption. Play/autoplay promises are now normalized, and DEV-only allowlisted diagnostics precede HLS/video failure handling. Thirty-six targeted tests pass across routing, identity, play promises, disconnect acknowledgment, delivery MIME/lifecycle and diagnostic sanitization. The parent's 0be193 reproduction no longer emitted the unhandled AbortError, but playback still failed with native MediaError code 3 at 575.692 seconds while paused (readyState 4). No HLS diagnostic was captured before removal, so the underlying decode/demux/MSE cause remains unknown. Native MP4 routing now enables the next matched experiment; it is not a proven decoder or performance fix. This unresolved real-playback failure blocks dependable-playback acceptance. See [PLAYBACK_DIAGNOSIS.md](PLAYBACK_DIAGNOSIS.md) and [STATIC_MP4_PROPOSAL.md](STATIC_MP4_PROPOSAL.md). Real Firebase, exact-image endorsement and separate physical/hosting/operational gates remain outside the unit checks. The prior failed draft validator record is historical, not a current pass.
