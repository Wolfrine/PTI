# PTI Tracker interface review — 12 October 2026

Final visual source: `10ace33d0daf09ecc8da92ae39467d4ecb185c05`.
Cache-only deployment follow-up: `9eae2b400f6452e00f35b6db568684322223b01a`.
Status: implemented, deployed, QA passed, independently agent-reviewed. Owner acceptance has not been asserted.

## Scope and direction

Reviewed the authenticated live application and its actual owner data: Review, History, Trace, Investment, Search, object detail/tabs, Discussions, expanded exchanges and evidence. Also inspected authentication, loading, empty and failure states.

Selected Review Ledger after three materially different static direction previews. These previews established the direction only; their document renderer was not evidence of browser responsiveness. References were inspected product images from Linear (aligned list and selected detail) and GitHub (explicit source/count scope). The final app uses these mechanisms without copying their palette or treating a heatmap as proof of activity.

The hierarchy now leads with recent change and exact evidence, exposes discussions alongside activity on desktop, and bounds initial activity to three rows on mobile. Navigation and search have one clear place. Trace is a typed relationship ledger; Investment counts recorded objects/events rather than inventing time or investment estimates.

## Critical acceptance dimensions

- Scan hierarchy: clear page purpose and primary rows; six initial desktop events, three mobile events with explicit expansion; at most three recent conversation rows; detail is opt-in.
- Truth and provenance: preserve exact stored messages; group only explicit parent links; distinguish prepared text, partial capture, identity limitations, imported cursor and source sync.
- Mobile readability: meaningful metadata at least 14px at phone widths; full messages and long provenance wrap; no document overflow; usable navigation and disclosures.

## Iterative review evidence

Five review cycles covered different actual candidate states; this is not a claim of five separate complete implementations.

| Cycle | Candidate state | Finding and resulting change |
| --- | --- | --- |
| 1 | First desktop Review and evidence drawer | Clearer hierarchy; corrected close/reopen behavior and opt-in detail. Mobile remained unverified. |
| 2 | First expanded discussion reader | Provenance was honest but introductory context consumed too much height. Reduced it and moved detail into disclosures. |
| 3 | First real mobile render | Discussions were too far down, metadata too small, node last-seen misleading. Bounded initial events and separated node metadata from latest linked event. |
| 4 | Trace and Investment | Selected root repeated on every edge; mobile Investment lacked an obvious action. Grouped edge direction once and restored the action cue. |
| 5 | Refined and final desktop/mobile states | Fixed the native details behavior that hid desktop rows despite a six-row label, enlarged meaningful phone metadata and removed the assumption that every ungrouped record is legacy v1. |

Two substantive implementation batches plus final mechanical corrections produced the final candidate. Separate designer, critic and parent QA roles were used. A bounded stronger design pass specifically checked chronology and Trace repetition.

Final independent critic: overall 8.4, scan hierarchy 8.4, truth/provenance 8.8, mobile readability 8.2. Parent judgment: overall 8.2, hierarchy 8.2, truth/provenance 8.7, mobile readability 8.0. These are agent judgments, not user approval or objective test measurements. No unresolved visual blocker. Remaining minor tradeoff: repeated dates and the wrapped mobile navigation/search header still consume height.

## Data and capture integrity

Read-only snapshot counts: 72 evidence records, 77 events, 42 nodes, 132 edges, 10 day indexes, 6 source states, 9 assessments, 9 runs, 6 captured exchanges and 1 conversation metadata document.

The conversation metadata declares five source turns but only one exchange in this mirror explicitly links to it. The other five captures stay ungrouped. Similar titles, dates and topics are not used to reconstruct membership. Source sync/cursor timestamps are presented separately from coverage; the source does not declare exhaustive capture. Prepared replies are not proof of the rendered assistant answer.

Client reads the existing `trackerData/workspace/chatTurns` mirror and current `chatConversations` metadata under the authenticated owner path. Existing backend, Firestore rules and record schemas were preserved. No conversations or tracker records were manufactured or written.

## Verification

- Twelve meaningful unit tests passed, including exact text projection, explicit parent grouping, capture-status precedence and source-link allowlisting, fresh shell installation, network-first navigation and offline fallback.
- Tracker tools TypeScript build passed.
- Private Chromium visual QA passed seven primary screens at 1440×1000, 390×844 and 320×740, plus expanded evidence/messages/provenance, partial capture, sync, and sparse/error/auth/loading states.
- Assertions covered exact full message text, partial indicators, source revisions, visible activity count, drawer closure, runtime errors and document overflow.
- Authenticated production browser confirmed real owner data after deployment. The canonical URL initially served an older cached HTML/CSS shell, which led to a cache-only fix: precache assets bypass HTTP cache, navigation refreshes the HTML shell before falling back offline, and registration explicitly checks for updates. Layout and CSS are unchanged from the final visual evidence.
- Visual-source Tracker CI run [38225337236](https://github.com/Wolfrine/PTI/actions/runs/38225337236) verified, deployed and compared live assets against the final client commit.
- Visual-source responsive QA run [38225337322](https://github.com/Wolfrine/PTI/actions/runs/38225337322) passed. Its machine result is retained alongside selected screenshots.
- Cache-only verification/deploy run [38226667459](https://github.com/Wolfrine/PTI/actions/runs/38226667459) and responsive regression run [38226667506](https://github.com/Wolfrine/PTI/actions/runs/38226667506) record the follow-up checks; their terminal result is available in Actions.

Responsive QA renders a read-only real-data snapshot with an isolated SDK stub. It does not verify production authentication, future Firestore synchronization or exhaustive source capture. Production authentication was separately inspected in the live browser. Other repository workflows are outside this tracker validation.

Selected evidence is retained here in the private repository, outside the Firebase hosting directory. Raw data snapshots and credentials are not retained in this review record.
