# Light and dark theme independent review

18 October 2026. Reviewer: `/root/theme_critic`. **Scoped visual pass**, after correction of phone hero height and enlarged Cast artwork. This is a design review of the local candidate, not a new TV, decoder, deployment or physical-device certification.

## Scope and evidence

Owner supplied two actual image boards: `codex-clipboard-e926ab81-3e57-411f-b482-0b2f1bc902b4.png` (cream/ink/coral) and `codex-clipboard-8f162b2e-7d87-447c-a8b3-09928e4b4684.png` (navy/gold). Both were personally viewed, together with the prior deployed `outputs/one-piece-live.png` remote. The owner chose this direction and asked for implementation/deployment; no alternative concept exercise was opened.

Personally inspected the actual rendered app in isolated Chrome tab **1189485187**, at `http://127.0.0.1:8919/one-piece/`, using the declared development fixtures. No production tab, companion process, actual TV or real account was changed by this review. Progress, account and receiver labels in these fixtures are explicitly synthetic; the thumbnail images themselves load from TVmaze.

| Viewport | Personally inspected states |
|---|---|
| 1440 × 1000 | Library light and dark; Cast remote light and dark; final original-resolution remote image |
| 390 × 844 | Library light and dark; fresh library; Cast remote light and dark; local Watch dark; preparation light |
| 320 × 740 | Fresh library, search, protected and revealed episode cards with long real titles; preparation light |

Final affected renders were refreshed after the phone and Cast-art fixes. Source snapshot inspected on the final pass: `views.mjs` SHA256 `ad86f5501fcf526c9b19e7661260542a0ae792cd1c067b891729ef926014e2c8`; `layout.css` `7f045e4e5514e125de1e1d81688430905e3090cf50a4ac82a3c0728a31e68f89`; `styles.css` `0bfd5d3015b32beadad0b16216057719756cbc59bab042d90ec25026aa91891f`. Parent owns the final built-asset fingerprint and saved release screenshots.

## Findings and corrections

1. **Phone hero originally delayed browsing.** At 390 px it consumed about 545 px below the header, placing search beyond the first 844 px screen. The revised safe-art strip, shorter mobile supporting copy and tighter spacing expose search in the first screen (observed search top approximately 722 px including the development banner). The 320 px layout also remains readable without horizontal document overflow.
2. **Desktop remote originally enlarged a 250 px thumbnail to about 810 px.** The visible result was blurred. The final remote requests the original image instead: episode 1000 loaded successfully at natural width **741 px**, and the reviewed picture is materially clearer. Episode grid cards retain the small lazy-loaded rendition.
3. **Dark button contrast was corrected.** Final settled dark primary is `rgb(223, 184, 116)`, with dark text; secondary is `rgb(23, 29, 37)` with light text. Immediate screenshots during the short theme transition can show intermediate colors; the final settled view was checked separately.
4. **Parallel-tab theme edge corrected.** A toggle deriving its previous state from shared storage could contradict the visible tab after another tab changed storage. Parent changed it to toggle from the current rendered state, then persist it. After the final rebuild/reload, the reviewer personally confirmed light → dark and dark → light both update the document theme and accessible next-action label correctly. This does not require rebuilding the video element.
5. **Fresh-fixture caveat identified.** Bare `?fixture=fresh` retains a synthetic episode-1000 session even though progress is empty. Spoiler protection was therefore checked with `?fixture=fresh&episode=1`, avoiding a misleading claim about the fresh-account state. With previews off, episode 1 uses its own still and episodes 2/3 use the common cover with **Preview hidden**. Enabling the checkbox reveals distinct real stills and source-backed titles.

## Independent visual scores

| Critical dimension | Score | Visible basis |
|---|---:|---|
| Viewing purpose / focal hierarchy | 8 | Continue/start is the strongest hero action; actual episode and language appear together; compact phone hero restores quick access to search. |
| Sequence and state clarity | 8 | Canonical episode numbers remain prominent, range navigation is separate from the primary action, hidden previews are labelled, and preparation reports its actual bounded fixture stage/bytes. |
| Composition and rhythm | 8 | Broad hero, compact search band, four-column desktop / two-column phone episode grid and narrow range rail form distinct useful regions. |
| Typography and material craft | 8 | Heavy italic show wordmark, editorial serif headings, compact labels and coral/gold accents clearly translate the boards. Final controls remain readable on both palettes. |
| Product identity and imagery discipline | 8 | Actual One Piece imagery replaces the sparse prior catalogue; real episode stills have a distinct role from the common cover; no fabricated saga ranges or sample-board episode facts were introduced. |
| Responsive Watch continuity | 8 | Native video remains dominant; remote keeps destination, state, seek, pause and next controls; no document overflow was observed at checked widths. |

Overall: **8/10** for the requested bounded design refresh. These scores are independent design judgments; automated checks cannot increase them.

## Generic-risk diagnosis and layer decisions

- **Repeated cards — justified.** Episode cards are comparable watchable objects with actual imagery, canonical numbering and progress/state, rather than interchangeable dashboard containers.
- **Large promotional hero — refined.** It supplies the requested artwork and recognizable title; its excessive phone height was corrected. Retain the direction and compact mobile form.
- **Theme as recoloring alone — justified by the brief.** The shared family workflow remains stable while cream/coral and navy/gold provide the two requested appearances. Different layouts per theme would add relearning without helping viewing.

Retain type, palette, navigation, card composition and original-resolution imagery. The reported current-state theme toggle behavior is now corrected. No full direction replacement is warranted. Motion beyond the short observed appearance transition was not evaluated.

The strongest remaining reference gap is that the dark board uses bespoke moonlit scenery, while this implementation uses a source-backed common show cover with a dark treatment. That is an honest asset difference, not a reason to fabricate artwork provenance or delay this requested release.

## Safety and verification limits

Source inspection confirms the principal video and remote IDs/data-actions remain present. In the fixture, Pause TV changed to Play TV as expected. Theme switching changes appearance without requiring the video element to be replaced. Artwork URLs are restricted to the intended HTTPS TVmaze image host and values are escaped before rendering.

No major remaining visual blocker was found in the inspected states. Parent still owns functional tests, actual prepared-media playback regression, exact production asset binding and deployment/live verification. This review does not close the known TV end-of-episode issue or certify hardware tests that were not run. CDN availability and the quality of third-party stills remain residual dependencies.
