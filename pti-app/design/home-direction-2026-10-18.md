# PTI Home — personal app launcher

Date: 2026-10-18
Owner visual direction: selected warm-light PTI personal operating system mockup (desktop, mobile and tablet) in conversation.
Scope: replace the authenticated `/home` three-choice layout; leave authentication, other routes, and all sub-apps unchanged.

## Product contract
- Central landing for existing PTI apps with verified links, internal dashboard and CEO-command routes, pinned launches, recent launches, category filtering and search.
- Native links: PTI Dashboard (`/new-dashboard`), CEO Command (`/codex-command`).
- Dedicated PTI Hosting: Self-Tracking, Morsel, Venture, Personal, Luminary, SEFPO Lab, Velum.
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
