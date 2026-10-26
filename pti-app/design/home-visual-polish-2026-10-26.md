# PTI landing and Home image/visual refinement — 26 Oct 2026

Status: **unverified implementation candidate**, awaiting current desktop/mobile rendered review. This refines the owner-selected warm-light direction; it does not establish new owner acceptance.

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

## Critical visual checks

1. **Image fidelity:** crisp photographic surfaces at 1440+ desktop and native DPR; no baked-in words, blocky upscale or prominent artifacts.
2. **Hierarchy and craft:** coherent warm-light experience with actual PTI heading/CTA and app-launch choices clearly identifiable without competing artwork typography; legible secondary text.
3. **Responsive usability:** at 1440 × 900, 1024 × 768, 390 × 844, and 320 × 568, no horizontal overflow; signed-out Google action, signed-in pins/search and usage qualifiers remain usable; mobile app shortcuts precede usage readings.

Independent critic's pre-change baseline from retained historical dashboard desktop/mobile images: image fidelity **4.0**, composition/type **7.4**, responsive readability **8.0**, overall **6.5**. These are baseline scores, not scores for the new candidate. The images included synthetic usage values; never commit actual owner readings to public evidence.

## Verification ledger

- Angular production build: **passed** locally on 26 Oct 2026; pre-existing style-budget and external stylesheet warnings remain.
- PTI Home contract checker: **passed**.
- `git diff --check`: **passed**.
- Local Karma tests: **not executed successfully** — this environment has no ChromeHeadless binary; required CI browser tests must be checked before claiming release verified.
- Fresh desktop/mobile screenshots of the changed build, independent critic rescoring, and direct deployment verification: **pending**. No 5–10 round agent-review acceptance claim is made.

Current owner verdict: **unverified candidate**. Review the actual deployed login and authenticated Home at desktop/mobile and address defects before any acceptance statement.
