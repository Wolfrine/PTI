# Velum — private Drive gallery

Static phone-first gallery deployed as a secondary Firebase Hosting site in the PTI Firebase project.

## Studio: private local generation

Studio is the fourth navigation item after Drift/Browse/Stats. It uses PTI Google sign-in independently of the gallery's read-only Drive permission. Approve the installed PC once remotely in Studio, choose one of four PC-verified models, enter your prompt verbatim, optionally choose a seed, confirm lawful/consensual adult use, and Generate. The [unattended Studio worker](../tools/velum-worker/README.md) restores its own DPAPI-protected device sign-in automatically. Installation, approval and a fresh online heartbeat are separate states. No hidden rewrite, enhancer, aesthetic correction or negative wording is added. Original prompt, seed and settings remain attached to each result.

The outbound Firebase queue, real PNG bytes and explicit Keep/Iterate/Reject feedback are private to the owner under `users/{uid}/velumStudio/workspace`. They are separate from local gallery reactions and never go to GitHub or Firebase Hosting. Actual preview requires a completed image manifest and successful SHA-256 verification; pending/error states show no fabricated result. The private Firestore transfer is bounded and uses normal quota/storage. The gallery remains read-only: Download is explicit; gallery saving and source-image editing are deferred.

Studio has its own scroll region for phone keyboards, preserves Quick Exit/PIN and pauses Drift media/auto-advance. Approved-PC requests can queue offline for seven days and start when it reconnects. Revoke or re-enable this PC from Studio. No localhost sign-in or daily pairing is required, and monitor credentials are never reused. Automatic recovery runs while the Windows user is signed in (including locked) and at logon; the PWA cannot wake the PC or bypass Windows logon. See [verification](design/studio-first-pass.md) for rendered fixtures, engine tests, production delivery and end-to-end acceptance.

## Data boundaries
- Gallery code is public in the PTI repository.
- Private images are **not** stored in GitHub or Firebase Hosting.
- At runtime, the browser requests Google Drive read-only permission and reads only the configured `Private` folder.
- Historical votes, continuous heart-hold durations, view events and preference scores remain in browser IndexedDB.
- The Google OAuth access token is kept in sessionStorage only.

## Current experience
- **One viewer:** Drift is the only full-image viewer. Browse thumbnails open the selected image directly in Drift; there is no Focus screen or additional zoom/Fit/Reset button.
- **Full-image presentation:** the original image uses `object-fit:contain` and is never cropped. The same cached media fills the edges as an enlarged, softly blurred background with a restrained vignette. Backgrounds crossfade as images change. Videos reuse a tiny first-frame poster when available.
- **Single-finger Drift gestures:** left/right swipe = next/previous; vertical swipes are no longer ratings. A stationary first press held for 450 ms starts floating hearts. As the hold continues, hearts grow in size and appear in richer rhythmic bursts; maximum visual size settles at roughly 60–70 px by 8 seconds, but hearts keep flowing for any hold length. Release saves one local `affection` event with **actual duration**, retains the image, and produces a final bloom. Repeated holds reinforce it with diminishing weight. No numeric levels, dislike gesture, or "Show less" control exists.
- **One-thumb zoom:** double-tap while zoomed returns to full fit (1x), even after panning. Double-tap and **hold the second touch, then slide up/down** zooms continuously without pinching; dragging while zoomed pans without accidental votes/navigation.
- **Auto-advance:** 15-second image timer with bottom-edge pause/resume. Touch pauses the timer, zoom pauses it for inspection, and returning to fit resumes after an eight-second grace period unless manually paused. Videos advance at completion and expose native playback controls on tap.
- **Feed:** unseen/new images have a 35–80% adaptive allocation while a fresh batch exists; previously enjoyed and forgotten media continue to appear between additions. Browse supports date, most-loved, views, rarity and random sorting, while preserving historic vote evidence.
- **Local-only data:** Drive media is fetched read-only. Hearts, historical votes, view history and scores remain in the browser IndexedDB; new-image discovery is in localStorage. Sync is manual. Quick Exit opens the neutral Archive screen.

### QA and release
`node --test velum-gallery/tests/*.test.mjs` verifies one-finger swipes, zoom, timed and continuous long heart holds, bounded visual growth, duration-based scoring, cancel paths, timer contracts, feed and removal of Focus. The `deploy_velum` GitHub Action gates Hosting on these tests and compares the live app, script, style and service worker with the release commit.

- **Ratings and analytics:** heart particles are purely visual. Each hold stores its original duration, with no 1–5 conversion or hard ceiling. Existing historical likes and previous level-based events remain readable. Hold duration contributes logarithmically to preference strength; repeated holds are discounted progressively, and the feed smoothly limits an individual favorite's recommendation share. Long legacy “skip” events are excluded from scoring. The Stats/Copy State view (VELUM_STATE_V2) includes counts and total time expressed. There is no Firestore or Notion syncing; updated Notion snapshots are pasted manually for UX reviews.

## Release visibility
- A small muted footer label sits **inside a reserved bottom row of the Drift/Browse/Stats navigation**, never as a separate overlay on the image, e.g. `v2026.10.22.160045`, with date and time in **IST**. Seconds differentiate multiple releases on the same day. Hovering exposes the associated short Git commit.
- The label is embedded into the **actual deployed index.html** (no live version request), so an outdated offline/PWA page continues to show its **old** release version instead of falsely showing the newest server release.
- The `deploy_velum` job runs `node .github/scripts/velum-release.mjs` after tests, before Firebase Hosting. That stamps the HTML label and a unique service-worker cache identity for each deployment run. The workflow compares the stamped files with the actual production files.
- To confirm an update on a device, use Velum's Refresh control and compare the bottom version stamp. The stamp is display-only; it neither stores nor synchronizes usage data.

## Firebase
Hosting target: `velum`
Hosting site ID: `pti-app-2ab59-velum`

If Google sign-in reports `auth/unauthorized-domain`, add `pti-app-2ab59-velum.web.app` under Firebase Authentication → Settings → Authorized domains. This is a one-time Firebase Auth configuration issue, not a gallery-code issue.
