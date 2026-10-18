# Reference pack — mechanisms only

These are supplied historical working-product screenshots, inspected as actual pixels. They are **reference-only**, not current product recommendations, current accessibility examples or permission to reuse artwork. They stay outside the Hosting artifact. The technical pilot is the existing baseline; no previous One Piece product UI exists.

| Reference | Visible mechanism worth testing | Fit / deliberate change |
|---|---|---|
| Jellyfin desktop library | Stable top navigation; consistent object sizes and label baselines; compact sorting/view controls; alphabet rail gives a long collection an index. | Replace poster dependence/alphabet with aligned episode numbers and explicit range navigation. Do not copy the empty lower screen, dense header icon ambiguity or movie poster grid. |
| Crunchyroll historical phone series page | Numbered episodes in a vertically ordered list; repeated thumbnail/metadata grouping; a season/sort control immediately precedes the list; Cast is accessible at the series level. | Keep ordered touch rows and a range selector; reduce synopsis and redundant metadata. No future thumbnails, unverified titles, ratings, tags or floating bookmark action. A strong Continue task must precede browsing. |
| Crunchyroll historical desktop Watch page | The video dominates; adjacent episode choices live immediately underneath; current episode has a clear selected treatment; metadata is subordinate. | Keep picture-first composition and current/next proximity. Remove advertising, comments and unrelated detail. Audio/subtitles and current Cast destination are working controls rather than buried metadata. |

## Pixel files and provenance

Original files live in the task's `work/design-references/` folder. Byte-identical copies are retained under `evidence/reference/` for the bounded acceptance validator. Neither location is shipped in the web Hosting artifact:

- `C:/Users/Sachit Tewary/Documents/Codex/2026-10-18/build-a-personal-one-piece-streaming/work/design-references/jellyfin-library.jpg` — 1676×872. Supplied source: <https://user-images.githubusercontent.com/55057433/220793656-80248948-f754-4dab-a125-ad42774b7dd7.jpg>.
- `C:/Users/Sachit Tewary/Documents/Codex/2026-10-18/build-a-personal-one-piece-streaming/work/design-references/crunchyroll-mobile.jpg` — 984×554 composite with a narrow phone interior. Supplied source: <https://s2-techtudo.glbimg.com/GHQl5U0OYm_DDrZUVmBj1lvrI-A%3D/0x0%3A1920x1080/984x0/smart/filters%3Astrip_icc%28%29/i.s3.glbimg.com/v1/AUTH_08fbf48bc0524877943fe86e43087e7a/internal_photos/bs/2019/3/m/mf1VnRSjGRCwp5zl5ZPQ/5.jpg>.
- `C:/Users/Sachit Tewary/Documents/Codex/2026-10-18/build-a-personal-one-piece-streaming/work/design-references/crunchyroll-player.jpg` — 1205×679. Parent supplied source: <https://userstyles.org/style_screenshots/176711_after.jpeg?r=1772442025>. This is a historical Crunchyroll user-skin screenshot, not an official current product example or endorsement. A recorded failed PNG fetch is not this image's provenance.

The supplied pack contains three task-relevant views from two product families, not three independent design systems. Desktop library, narrow mobile interior and desktop Watch each address a different working state. No style or layout is treated as accepted merely because the reference exists.
