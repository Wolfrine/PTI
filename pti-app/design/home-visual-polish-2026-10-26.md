# PTI landing and Home image/visual refinement — 26 Oct 2026

Status: **landing and Home desktop-verified; Home tablet/mobile visually inspected; independent Home and mobile login acceptance pending**. This refines the owner-selected warm-light direction; it does not establish new owner acceptance.

## Problem and scope

- The same 270 × 203 WebP thumbnail was stretched across the full desktop login art panel and signed-in Home hero. Its embedded wall lettering was visibly soft and competed with the actual HTML heading.
- At 390 × 844, Home hid its hero altogether and showed Codex/GT Papers readings before pinned apps, pushing the primary app-launch task below the first viewport.
- Keep Google auth, login returns, app registry, Velum exclusion, Codex/GTOP readings, domain data and PWA behavior unchanged.

## Visual direction and new assets

Continue the accepted warm-neutral, coral and editorial-serif identity, with tactile architectural photography rather than text rendered into a bitmap.

| Consumer | Art | Resolution | Approx. optimized size |
| --- | --- | ---: | ---: |
| Signed-out `/` and `/login` | `public/assets/images/pti-home-lifestyle.webp` — sunlit lakeside workroom | 1536 × 1024 | 112 KB |
| Signed-in `/home` desktop and mobile | `public/assets/images/pti-home-journal.webp` — journal, pen and distant landscape | 1774 × 887 | 140 KB |

Both are AI-generated editorial photographs (built-in image generation, then WebP conversion). Art prompts: a detailed warm limestone/oak studio looking onto misty hills with botanical/craft textures; a companion close-up of blank journal, pen, ceramic cup and distant lake in the same palette. Explicit exclusions: text, watermarks, interfaces, logos and people. Images are intentionally decorative, not factual project evidence.

Home puts pinned launch choices ahead of the usage and host widgets. Mobile gains a compact photo-backed greeting so the app launcher stays visible early. The separate original production auth flow and private data remain untouched.

Browser identity receives the matching coral four-petal SVG/ICO favicon, a descriptive PTI tab title and warm PWA installation chrome rather than the previous magenta favicon and default blue theme.

## Critical visual checks

1. **Image fidelity:** crisp photographic surfaces at 1440+ desktop and native DPR; no baked-in words, blocky upscale or prominent artifacts.
2. **Hierarchy and craft:** coherent warm-light experience with actual PTI heading/CTA and app-launch choices clearly identifiable without competing artwork typography; legible secondary text.
3. **Responsive usability:** at 1440 × 900, 1024 × 768, 390 × 844, and 320 × 568, no horizontal overflow; signed-out Google action, signed-in pins/search and usage qualifiers remain usable; mobile app shortcuts precede usage readings.

Independent critic's pre-change baseline from retained historical dashboard desktop/mobile images: image fidelity **4.0**, composition/type **7.4**, responsive readability **8.0**, overall **6.5**. These are baseline scores, not scores for the new candidate. The images included synthetic usage values; never commit actual owner readings to public evidence.

## Verification ledger

- Angular production build: **passed** locally on 26 Oct 2026; pre-existing style-budget and external stylesheet warnings remain.
- PTI Home contract checker: **passed**.
- `git diff --check`: **passed**.
- Local Karma tests: **not executed successfully** — this environment has no ChromeHeadless binary; GitHub CI executed the Home/navigation/browser tests successfully instead.
- The main push `9a9ba02979bdc5392b59464f2dcbeee96431ade4` triggered [workflow run #230](https://github.com/Wolfrine/PTI/actions/runs/40300468276); all jobs, including Home tests, Angular build, Firebase Hosting deployment and artifact verification, **passed**.
- Follow-up browser-branding push `5757b031e57687adab641a0dcf58b99402c22002` triggered [workflow run #231](https://github.com/Wolfrine/PTI/actions/runs/40301791709); all CI and Hosting jobs **passed**. The live page title was checked as `PTI · Your Personal Operating System`.
- Fresh public login at desktop (~1350 × 920) was visually observed with a sharp new 1536 × 1024 photograph, readable Google CTA and correct warm-light styling. Independent critic scored this observed login desktop image fidelity **8.8**, composition/type **8.4**, desktop functional readability **8.5**.
- Authenticated Home at desktop (1920px) was personally observed by release lead: the new 1774 × 887 journal is crisp, the six pinned apps are immediately below the hero and within the first viewport, the reading panel follows, Noveliaa search returns one matching app and no Velum text appears in the launcher. Private usage numbers were not saved in this public repository.
- Initial mobile viewport override in the reused browser tab did not apply. A new browser tab resolved that issue: authenticated Home was visually inspected live at **1024 × 768**, **390 × 844**, and **320 × 568**, with the real responsive breakpoints active. At 1024px the icon rail, hero and six pinned apps fit without horizontal overflow. At 390px a compact photo-backed greeting and 3 × 2 pinned grid precede usage; at 320px pins switch to two columns with the bottom navigation present. The document scroll width was narrower than the window at all three sizes; there was no horizontal overflow. The full-sized journal was confirmed loaded at its native 1774px width.
- A further CSS-only pass improved tiny utility text, pinned labels/categories, directory descriptions, filters and contrast across Home and login, while keeping the existing layout and authentication intact.
- Independent critic could not access authenticated Home, and the separate mobile signed-out login view was not observed. **Do not treat independent Home or mobile login acceptance as verified**; no five-cycle acceptance claim is made.

Current owner verdict: **unverified candidate** (no explicit post-release owner approval). Address unobserved mobile login and independent Home review before claiming agent-reviewed acceptance.
