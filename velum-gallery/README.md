# Velum — private Drive gallery

Static phone-first gallery deployed as a secondary Firebase Hosting site in the PTI Firebase project.

## Data boundaries
- Gallery code is public in the PTI repository.
- Private images are **not** stored in GitHub or Firebase Hosting.
- At runtime, the browser requests Google Drive read-only permission and reads only the configured `Private` folder.
- Votes, view events and preference scores remain in browser IndexedDB for V0.1.
- The Google OAuth access token is kept in sessionStorage only.

## Current experience
- Drift displays **the complete original image by default**, including multi-panel canvases. Tap to reveal the bottom controls; **Fill** optionally crops to full-screen.
- Single-finger interactions: horizontal swipe previous/next, vertical swipe up/down vote, double-tap zoom/fit, drag while zoomed. Voting advances immediately. Reset control returns to whole-image fit.
- Focus: bottom **Fit** and **Done**, double-tap zoom/fit, pinch and pan, downward swipe to close from whole-image fit, plus native Back to dismiss.
- Adaptive Drift feed: unseen images discovered recently receive a **35–80% weighted share**, increasing with fresh backlog, and are shown once before repeats. Remaining picks mix personalized ratings and old/random rediscovery. The last six items are avoided where possible.
- New-media discovery timestamps are held in this browser's localStorage; votes and completed view counts are in IndexedDB. First sync uses Drive creation dates as baseline; later synced additions use their first-seen time.
- Browse: date, confidence-weighted rating, votes, views, rarity, recent and random. Quick Exit: neutral Archive screen.
- Manual Drive sync; media remains in Drive.

## Firebase
Hosting target: `velum`
Hosting site ID: `pti-app-2ab59-velum`

If Google sign-in reports `auth/unauthorized-domain`, add `pti-app-2ab59-velum.web.app` under Firebase Authentication → Settings → Authorized domains. This is a one-time Firebase Auth configuration issue, not a gallery-code issue.
