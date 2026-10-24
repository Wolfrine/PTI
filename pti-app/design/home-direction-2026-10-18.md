# PTI Home — personal app launcher

Date: 2026-10-18
Owner visual direction: selected warm-light PTI personal operating system mockup (desktop, mobile and tablet) in conversation.
Scope: replace the authenticated `/home` three-choice layout; leave authentication, other routes, and all sub-apps unchanged.

## Product contract
- Central landing for existing PTI apps with verified links, internal dashboard and CEO-command routes, pinned launches, recent launches, category filtering and search.
- Native links: PTI Dashboard (`/new-dashboard`), CEO Command (`/codex-command`).
- Dedicated PTI Hosting surfaced in the launcher: Self-Tracking, Morsel, Venture, Personal, Luminary, SEFPO Lab, and One Piece. Velum is deliberately excluded as a private app; its separate site is unchanged.
- Separately hosted Wedding Planner: `https://mahima-mayank.web.app/`.
- Research/prototypes are separately presented as source projects, not falsely advertised as deployed applications.
- Persist only browser-local app IDs for pins and recency; do not invent completed tasks or synchronized cross-app activity.
- Exact hero art is a cropped, optimized derivative from the owner-selected design image; all other visuals use CSS and Material icons.

## Design direction
- Warm neutral, dark ink, coral accent, serif hero, understated cards, desktop left navigation, mobile-first pinned-app launcher.
- Preserve visual uniqueness of individual sub-apps; PTI is the discoverable entry point, not a replacement for their experiences.

## Validation record (not a formal design acceptance)
- Local static rendering reviewed at 1440×1000, 1024×900 and 390×844, with no horizontal overflow. Static preview does not execute Angular app logic.
- TypeScript syntax transpile: no diagnostics. CSS syntax parsing: no errors.
- Angular build/deployment and actual authenticated-browser interactions require CI and live verification.
- Independent visual critic and 5–10 substantive design iteration gate not completed; do not claim agent-reviewed acceptance.
- Reference owner approved a visual prototype; implementation itself remains subject to live feedback.

## 2026-10-24 curation and sign-in alignment

- Curated launcher: eleven launchable entries across internal PTI pages, dedicated PTI apps, One Piece, separately hosted Wedding Planner and released Noveliaa. `Entertainment` identifies One Piece, while `Creative` identifies Noveliaa.
- Privacy choice: Velum does not appear in the app list, categories, search, pins or recent-launch suggestions. Saved IDs no longer belonging to the curated catalog are filtered and purged when the home opens. This is **showcase discretion**, not access control: private app authentication and media protection remain the private app's responsibility.
- Login direction: extend the owner-selected warm-light, editorial PTI identity to unauthenticated `/` and `/login` via a split layout and the existing approved lifestyle art. Retire the unrelated dark executive control room and incorrect expansion of PTI. Keep the Google button action and TypeScript authentication/redirect logic unchanged.
- Design roles: independent designer prepared markup/styles; independent critic found short-phone CTA visibility, microtext contrast and improvised Google icon risks; these were revised before source was saved.
- Critical states to verify: 1440×900 desktop; 1024×768 tablet; 390×844 mobile; 320×568 short phone; keyboard navigation, focus, 200% text zoom; Google popup/One Tap and `?redirect=/one-piece/...`; no horizontal overflow.
- Current verdict: **unverified candidate**. This is a code-level iteration; no post-change desktop/mobile render, Angular test/build run or 5–10 substantive visual cycles were completed in this environment. Do not treat the PR or future CI deployment as aesthetic acceptance.

### Noveliaa release corrected (2026-10-24)

- Noveliaa is a **released**, privately authenticated app at `https://noveliaa.web.app/`. The [2026-10-23 Firebase release](https://github.com/Wolfrine/creative-workspace/actions/runs/40000821976) completed successfully from branch `codex/noveliaa-phase-1`; its hosted build was verified, and the public sign-in landing was inspected on 2026-10-24.
- The repository default-branch README still says planning-stage. Treat the successful release and verified live site as more recent evidence of availability; publication of a private author workspace does not make its contents public.
- List Noveliaa under **Creative** with the live external URL and normal search, launch, pin and recent-app behavior. The directory now has **11 launchable entries**. Velum remains excluded from the curated launcher.
