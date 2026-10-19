# One Piece — one app, one sign-in

Canonical app: **https://pti-app-2ab59-one-piece.web.app/**. Existing installed One Piece apps keep the same identity/start URL and receive the update without reinstalling. The owner confirmed Android's Install option, completed installation, and confirmed a drawer entry and separate app launch.

The old PTI `/one-piece/` entry is a redirect alias, not another application. Old episode/login bookmarks carry only validated viewing fields to the canonical app. Unknown query fields, tickets, tokens and external destinations are excluded. Already-open old playback tabs are not forcibly navigated; existing compatibility resources remain available until they close. Legacy workers direct future navigations to the canonical app and clear only their old shell caches.

The dedicated Hosting output contains only the One Piece subtree, its own manifest, a redirect document and an Angular-worker retirement script. It contains no Angular login, PTI app directory, Angular chunks or root ngsw manifest. The retirement script removes only old Angular caches/registration on that dedicated origin; Google identity, IndexedDB, local progress and the One Piece worker are retained. PTI's root worker is not retired.

Google sign-in starts from One Piece's own screen using the same Firebase project and existing account/family records. There is no `/login` link or Angular handoff in the One Piece UI. Signed-out episode actions retain their episode and show native sign-in on the same origin. Ordinary PTI login retains its own appearance and behavior; validated old One Piece login returns are forwarded before shared Google login.

The parent inspected actual production-bundle native sign-in at1440×1000 and390×844 with no horizontal overflow. These are signed-out local renders, not mock accounts. Real Google chooser opening and safe cancellation recovery were checked on localhost; automated Google account selection did not complete, so successful fresh authentication is not claimed. Existing signed-in production identity is checked separately after deployment. Physical Android installation/separate launch is owner-confirmed.

Full frontend/build and independent review results bind the exact release in `design/acceptance.json` and `design/evidence/single-app/`. No new design-direction acceptance, TV test, media preparation or companion restart is implied. Media/Cast/runtime code and family storage remain unchanged. Fresh new-device Google authentication, the previously unconfirmed new-origin PC connection and existing Sony end-of-episode issue retain their explicit remaining scope.

The earlier `INDEPENDENT_PWA.md`/`INSTALL_REPAIR.md` cloned-login approach is superseded by this single-app contract. Older evidence remains historical rather than being re-labelled as current proof.
