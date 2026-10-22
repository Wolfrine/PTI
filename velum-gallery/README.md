# Velum — private Drive gallery

Static phone-first gallery deployed as a secondary Firebase Hosting site in the PTI Firebase project.

## Data boundaries
- Gallery code is public in the PTI repository.
- Private images are **not** stored in GitHub or Firebase Hosting.
- At runtime, the browser requests Google Drive read-only permission and reads only the configured `Private` folder.
- Historical votes, graded heart reactions, view events and preference scores remain in browser IndexedDB.
- The Google OAuth access token is kept in sessionStorage only.

## Current experience
- **One viewer:** Drift is the only full-image viewer. Browse thumbnails open the selected image directly in Drift; there is no Focus screen or additional zoom/Fit/Reset button.
- **Full-image presentation:** the original image uses `object-fit:contain` and is never cropped. The same cached media fills the edges as an enlarged, softly blurred background with a restrained vignette. Backgrounds crossfade as images change. Videos reuse a tiny first-frame poster when available.
- **Single-finger Drift gestures:** left/right swipe = next/previous; vertical swipes are no longer ratings. A stationary first press held for 450 ms starts floating hearts, growing from level 1 to 5 over ~3 seconds. Release saves one local `affection` event and retains the image. Further holds reinforce it with diminishing weight; no dislike gesture or "Show less" control is present.
- **One-thumb zoom:** double-tap while zoomed returns to full fit (1x), even after panning. Double-tap and **hold the second touch, then slide up/down** zooms continuously without pinching; dragging while zoomed pans without accidental votes/navigation.
- **Auto-advance:** 15-second image timer with bottom-edge pause/resume. Touch pauses the timer, zoom pauses it for inspection, and returning to fit resumes after an eight-second grace period unless manually paused. Videos advance at completion and expose native playback controls on tap.
- **Feed:** unseen/new images have a 35–80% adaptive allocation while a fresh batch exists; previously enjoyed and forgotten media continue to appear between additions. Browse supports date, rating, votes, views, rarity and random sorting.
- **Local-only data:** Drive media is fetched read-only. Hearts, historical votes, view history and scores remain in the browser IndexedDB; new-image discovery is in localStorage. Sync is manual. Quick Exit opens the neutral Archive screen.

### QA and release
`node --test velum-gallery/tests/*.test.mjs` verifies one-finger swipes, zoom, timed heart holds, cancel paths, affection scoring, timer contracts, feed and removal of Focus. The `deploy_velum` GitHub Action gates Hosting on these tests and compares the live app, script, style and service worker with the release commit.

- **Ratings and analytics:** heart particles are purely visual. Each hold stores one level (1–5) locally, existing likes remain valid, long legacy “skip” events are excluded from scoring, and the Stats/Copy State view includes affection strength. There is no Firestore or Notion syncing; updated Notion snapshots are pasted manually for UX reviews.

## Firebase
Hosting target: `velum`
Hosting site ID: `pti-app-2ab59-velum`

If Google sign-in reports `auth/unauthorized-domain`, add `pti-app-2ab59-velum.web.app` under Firebase Authentication → Settings → Authorized domains. This is a one-time Firebase Auth configuration issue, not a gallery-code issue.
