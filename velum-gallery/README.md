# Velum — private Drive gallery

Static phone-first gallery deployed as a secondary Firebase Hosting site in the PTI Firebase project.

## Data boundaries
- Gallery code is public in the PTI repository.
- Private images are **not** stored in GitHub or Firebase Hosting.
- At runtime, the browser requests Google Drive read-only permission and reads only the configured `Private` folder.
- Votes, view events and preference scores remain in browser IndexedDB for V0.1.
- The Google OAuth access token is kept in sessionStorage only.

## Current experience
- Drift: randomized, adaptive recommendation with deliberate exploration.
- Swipe up/down: new upvote/downvote event for every appearance.
- Horizontal swipe: previous/next.
- Random two-image moments; pair votes influence both images at reduced strength.
- Browse: date, confidence-weighted rating, votes, views, rarity, recent, random.
- Focus: pinch zoom, drag, double-tap zoom/reset.
- Quick Exit: neutral Archive screen.
- Manual Drive sync; new Drive images enter the same pool automatically after sync.

## Firebase
Hosting target: `velum`
Hosting site ID: `pti-app-2ab59-velum`

If Google sign-in reports `auth/unauthorized-domain`, add `pti-app-2ab59-velum.web.app` under Firebase Authentication → Settings → Authorized domains. This is a one-time Firebase Auth configuration issue, not a gallery-code issue.
