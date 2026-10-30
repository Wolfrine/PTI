# PTI Home · Development resources review

**Scope:** owner-approved bounded addition to the accepted warm-light PTI Home at candidate base `835ebcee98c62ced49a4505de8b3ecc5f78184e1`. Keep Pinned Apps first and the Codex allowance prominent; add a quiet, expandable GitHub/Firebase summary underneath. No Home rebrand or synthetic production readings.

## Source and criteria

- Existing direction: `home-direction-2026-10-18.md`, `codex-usage-review.md`, rendered `/home` and its current `new-codex-usage` component.
- Central visual design director source: `design/skills/visual-design-director/SKILL.md`, revision SHA `755e05995cfcb666d85863f43ad7a4756f2f61be`; applied with its designer guide. Designer and an independent critic reviewed real browser rendering; parent is the final acceptance authority.
- 100ms glance: Pinned Apps still visibly precede resources. 1s: Codex usage and provider summary values. 5s: GitHub account billing versus PTI-only recent workflows, Firebase per-project coverage and source timestamp.
- Critical dimensions: truthful metric scope/null handling; visual fit with existing warm-light Home; responsive 1440, 390 and 320px readability with expanded details, keyboard navigation and fixed bottom navigation.

## Actual iterations and evidence

| Pass | Browser-observed result | Action |
| --- | --- | --- |
| R1 · candidate layout | At 1440px, Codex on left and both providers stacked right left a conspicuous empty area beneath the short Codex reading. | Changed to Codex full-width, with paired balanced provider cards beneath it. |
| R2 · fresh/partial/unconnected | Playwright headless at 1440×1000, 390×844 and 320×568: no document-level horizontal overflow, cards stack on mobile, absent snapshot displays “Unavailable”/dashes rather than made-up zero. Independent critic scored truth/scope **8.5**, fit **8.1**, readability **8.1**, overall **8.2**; this is critic assessment, not owner acceptance. | Retained composition; corrected provider glyphs from font-dependent symbols to inline crisp SVG. |
| R3 · expanded/narrow | Browser at 320×568: GitHub and Firebase native `details` both open; a long monitoring project ID wraps without horizontal overflow; Enter on the focused summary toggles its open state; `:focus-visible` shows a 2px solid outline. The mobile bottom nav remains fixed, so the expanded information is scrollable behind it and can be brought above the nav by continuing down the page. | Improved scope copy to “Reads from X of Y projects”; made monthly GitHub account billing explicit in glance, used dash rather than a zero for unknown project count. |

Browser captures were created with a **labelled local usage-preview fixture**: `?platform=fresh`, `partial`, `unconnected`, `long`; data was synthetic and did not access auth, GitHub, or Firebase. Relevant transient local paths from R3: `/tmp/pti-platform-approved-fresh-1440-expanded.png`, `/tmp/pti-platform-approved-fresh-390-expanded.png`, `/tmp/pti-platform-approved-unconnected-320-expanded.png`, `/tmp/pti-platform-approved-long-320-expanded.png`, `/tmp/pti-platform-approved-long-320-detail-viewport.png`. These are test-environment evidence paths, not production assets.

## Data/readiness boundaries

- Source readings are fetched through the root-injectable `PlatformUsageService`, not from a client-held GitHub or Google credential. The panel never invents unavailable usage; a true reported zero remains zero.
- GitHub's recent run scope is `Wolfrine/PTI` only, while billed Actions minutes/cost are account-level. Firebase sums only reported metric values across authorized projects; per-project reads/writes/deletes and partial statuses remain inspectable. Collection time appears below the cards.
- Native `details`/`summary` maintain semantics and keyboard support; links open official account consoles. Screens were reviewed at desktop and two mobile widths. Production authentication, provider permissions, real collection and deployment are parent/release QA responsibilities.
- Final full ChromeHeadless Angular run: **90 of 90 tests passed**, including four component tests for absent readings, scope/partial data, expanding both disclosures, and account data teardown. Production `npm run build` passed with a non-blocking 5.35kB component style budget warning (limit4kB), other existing Atlas/login style warnings and an unresolved `/assets/styles/pti-home.css` stylesheet warning. The latter warning also predates this bounded panel. No successful live collection or deployment is inferred from the synthetic browser QA.
