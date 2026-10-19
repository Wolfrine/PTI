# Independent One Piece PWA — 19 October 2026

The owner approved a dedicated One Piece address within PTI's existing Firebase project, matching other PTI sibling apps. The previous nested PWA manifest was distinct, but the installed root PTI app could capture its URLs and suppress independent installation.

## Deployment and identity

- Firebase project remains `pti-app-2ab59`; Hosting target `one-piece` uses site `pti-app-2ab59-one-piece` and canonical origin `https://pti-app-2ab59-one-piece.web.app`.
- The existing complete PTI build is extended with One Piece, then cloned into `pti-app/dist/one-piece-app`. Only dedicated manifest and login document metadata differ. Its root redirects to `/one-piece/`; the same existing Angular `/login` code works on that origin.
- Dedicated manifests use One Piece name/icons, standalone display, install ID `/one-piece/`, start `/one-piece/` and scope `/`. Scope includes login inside the app window. The original manifest retains `/one-piece/` scope. One Piece's worker stays scoped `/one-piece/` on both sites, avoiding a root-worker replacement. Cloned Angular index/root manifest hashes are recomputed.
- PTI launcher opens the dedicated origin. The old route remains usable with a visible migration action; it pauses and flushes local playback events, then blocks migration while events or a resume conflict remain. Episode/query/hash are retained. No Firebase token or local storage is transferred between origins.
- New browser-origin storage requires one fresh Google sign-in and a new device identifier. Firebase UID, family membership, Firestore progress/preferences and PC pairing stay shared. An old local session may require explicit takeover; TV sessions retain existing recovery behavior.
- Install One Piece is always discoverable in account/footer, with the browser prompt when available, clear fallback help, and installed status. Back to PTI uses PTI's actual origin.

## PC and authorization

Companion migration adds only the dedicated site's exact HTTPS web.app and firebaseapp.com origins. Existing controls, trusted DuckDNS TLS, scoped LAN HTTP Cast, cache paths, credentials and media preparation remain intact. Unrecognized origins, wrong schemes, lookalikes and extra ports remain denied. Authenticated API and capability media/subtitle responses support the new origins; private credentials are never returned or passed in links.

Deployment reuses the existing Actions identity. It ensures the new Hosting site exists, preserves existing Firebase Auth authorized domains while adding the two exact aliases, and fails explicitly if authorization cannot be completed. It deploys the default plus dedicated targets and compares the dedicated asset bytes, root redirect, login document and manifest identities. Existing sibling targets remain managed by their current workflow.

## Verification and limits

Full local frontend suite: **67 passed**. Full companion suite: **219 passed**. Independent reviewer reran **87 focused checks**, inspected code/generated artifacts and all four actual browser captures, and found no blocking code/layout issue. Parent inspected desktop 1440×1000 and mobile 390×844 migration/install states, without observed overflow or clipped controls. These renders use synthetic account/progress/origin flags and real catalogue/artwork.

Both legacy and independent One Piece fingerprints are frozen in `design/evidence/independent-pwa/`; CI checks both exact candidates. Complete Angular build passed with existing stylesheet warnings. This is a mechanical identity repair, not a renewed theme acceptance.

Post-release: actual new-origin owner Google sign-in succeeded; companion activation and exact-origin HTTPS/CORS checks passed. Real episode 3 MP4 ranges and English WebVTT passed bounded Node requests with the new Origin header, using a ticket minted by the existing app. The old-origin app retained resume and decoded real video. **New-origin Chrome has not established its PC connection**, so new-origin browser playback is not accepted. Local-network permission is a hypothesis, not proven; the owner phone check is pending. Browser URL policy rejected automated access to Chrome settings and no alternate permission-changing mechanism was attempted. Physical Android installation/launch remains unverified. No TV session was started, and the previous Sony end-of-episode issue remains separate. Exact scope and live captures are in the session's outputs/one-piece-independent-release.md and JSON.

Rollback: retain both old origin and prior immutable PC release. Revert the PTI launcher if necessary; do not remove local browser data, family documents, protected credentials or active cache. Restore the prior protected configuration together with its corresponding companion release when rolling back exact-origin validation.
