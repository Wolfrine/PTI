# Episode artwork

The checked-in `apps/one-piece/web/artwork.json` supplies image URLs and English metadata for the **1,084 listed episodes** in the existing Archive catalogue. It does not supply or alter media availability. Episode 590 remains missing and has no artwork record. No video was downloaded, probed, prepared or played during this artwork task.

## Source and attribution

The provider is [TVmaze's 1999 Japanese animation record, show 1505](https://www.tvmaze.com/shows/1505/one-piece), not the live-action show. The [official API documentation](https://www.tvmaze.com/api) permits directly linking its image CDN and describes immutable image URLs suitable for browser caching. Metadata is provided under CC BY-SA; the manifest retains the provider link and licence, and the application must show the supplied attribution link. Programme imagery retains its underlying owners' rights. The API requires no account or paid key. There is no live API dependency when the app starts: the catalogue is bundled, and visible images use the CDN.

## Absolute episode mapping

TVmaze uses calendar-year seasons, rather than absolute episode numbers. Its documented episode endpoint returns airing order excluding specials. The inspected endpoint returned 1,181 regular rows, with all of the first 1,085 carrying image URLs; it has no alternate episode list. The mapping uses that regular airing order, checked against the consecutive season numbers and complete per-year counts. It is **not** inferred from the API's per-season `number` field alone.

Cross-checks include absolute anchors 1, 500, 590 (the missing crossover), 944, 1000, 1001, 1044 and 1085, plus all 85 titles already independently numbered in the second Archive collection. Of those 85, **60 match exactly after case and punctuation normalization**. The remaining 25 are translation/spelling variants reviewed for the same plot/characters, such as “Defend Luffy” versus “Protect Luffy” for 1027 and “Fifth Gear” versus “Gear 5” for 1071. No shifted block appeared. This provides strong numbering confidence; it does not mean every individual thumbnail's pixels were manually matched against every video.

The ordered upstream record IDs through episode 1085 are pinned with SHA-256 `a9a1f324e75665a24138496ce16e816c79145a89fb5940d601d687c68dfeec39`. `refresh-artwork.mjs` rejects upstream insertion/reordering, year/episode sequence changes, or regression in the 60 exact title matches. Extending coverage needs a deliberate mapping review, rather than silently adding newly indexed episodes. The original canonical catalogue remains the authority for availability.

## Availability checks

Actual bounded GET requests fetched and validated JPEG signatures and dimensions for **1, 500, 944, 1000, 1001, 1044 and 1085**. All seven returned HTTP 200, `image/jpeg`, and 250×140 pixels: **92,652 total response bytes**. The manifest records individual byte counts and the fetch time. The other 1,077 playable episode image URLs are present in metadata; their HTTP availability and scene correctness have not been checked individually. The UI must retain an image fallback.

The `safeHero` URL is the provider's existing 1280×720 promotional background. Its actual pixels were inspected: Luffy and the classic early Straw Hat crew, with no late-series transformation or episode plot scene. It introduces general series characters and is not an episode thumbnail. Episode 1's original still was also inspected but depicts Alvida, so was rejected as the main hero. Future episode stills and titles remain subject to the app's spoiler preference; general series marketing art can be displayed as a fallback.

Refresh, if needed: `node apps/one-piece/scripts/refresh-artwork.mjs`. This fetches one metadata response and seven small image samples serially. It does not crawl or download the complete image library. Focused checks: `node --test apps/one-piece/tests/artwork.test.mjs`.
