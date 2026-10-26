# One Piece home PC start control

Date: 2026-10-27. Verdict: **agent-reviewed bounded addition; live release checks separate**.

Mechanical addition to the accepted warm-light `/home` direction. Reuse the existing GT Papers assistant strip's typography, surfaces, spacing, responsive wrapping and controls; show the One Piece PC companion beside the same launcher context. No new art direction or owner acceptance is claimed.

Central bundled release 0.1.0, source `ba1235fe7b220842778414f3f70fca38e7df4c53`; director and designer guide loaded, together with UI Visual Verifier. Designer: `onepiece_start_ui`; independent critic: `onepiece_start_critic`; parent: QA/release authority.

User job: when the companion is stopped but its small PC starter is available, explicitly start One Piece from PTI without finding a terminal. The panel never starts anything merely by opening PTI. Only the owner sees it; the gateway separately authorizes the owner's Firebase ID token. “Starting” means an accepted request, while “Ready to watch” requires the backend's companion-ready state. A missing starter says to keep the PC awake and connected; it does not claim that the PC is powered off.

Eye-path hypotheses, not measured perception: the launcher remains the main Home job; the small One Piece heading and state identify the relevant service; Start One Piece is the only primary action while offline. When ready, Open One Piece leads to the dedicated PWA root.

Required pass conditions: (1) distinguish offline, accepted start, ready and unavailable truthfully; (2) preserve warm Home and existing GTOP strip hierarchy; (3) show readable, fitting actions and keyboard focus at desktop 1440×1000, mobile 390×844 and narrow 320px. Parent/critic must inspect actual renders before acceptance.

Local-only synthetic preview: `ng serve --configuration usage-preview --host 127.0.0.1 --port 4331`, then `/?state=fresh&host=offline&onePiece=offline`. `onePiece` options: `offline`, `ready`, `starting`, `failed`, `starter-offline`, `loading`, `error`, `hidden` (default). Synthetic Start transitions to starting, then ready after eight seconds. No Firebase calls or local runtime changes occur; the preview entry remains excluded from production.

Functional verification: full `npm test -- --watch=false --browsers=ChromeHeadless` passes **45/45**; production `npm run build` passes (1.21 MB initial bundle). Existing login SCSS budget and root-relative stylesheet inlining warnings remain. Tests cover owner-only visibility, fixed authenticated API paths, server-side hiding, unknown cloud states, hidden-tab pause, sign-out abort including pending token retrieval, no automatic start, duplicate suppression and status confirmation/idempotent retry after uncertain responses. Production bundles include the fixed gateway and omit the synthetic preview marker.

Parent personally inspected the final combined current-main renders at 1440×1000 and 390×844; the independent critic also inspected 320px, keyboard focus and all state fixtures. No clipping or overflow was found. The d9bfc37 branding and pinned-apps-first hierarchy are preserved, followed by usage, GTOP and One Piece. Parent scores: clarity 8.5, fit 8.5, responsive readability 8.4; critic overall 8.5. These are subjective agent judgments for this small addition, not new owner acceptance. Actual screenshots and review are retained under `F:/Workspace/Codex/2026-10-27/one-piece-starter/outputs/critic-final-integrated-*` and `independent-ui-review.md`.

The preview temporarily failed during safe stash/restore of local files while incorporating four newly published Home commits. Those captures are diagnostic only. New files were recovered from the preserved stash; final 45/45 tests, production build and all three-width renders use the restored combined candidate. Fixtures are not evidence of Windows startup, actual companion health or production owner authentication.

Designer personally viewed the critic's actual Chrome headless offline renders at 1440×1000, 390×844 and 320×844. The new strip keeps GTOP's warm surface and heading/status relationship, preserves the launcher below it, and wraps the dedicated-app link onto a second action line at 320px without clipping. Independent critic reports no pixel blockers and has exercised all fixture states, Start → Starting → Ready and keyboard order. Parent retains final review authority; the designer does not award independent acceptance.
