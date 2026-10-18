# One Piece light and dark refresh

18 October 2026. User-authorized update to the deployed `/one-piece/` application. This supersedes the earlier no-art direction for this bounded redesign; source coverage, private family access, playback and casting remain the same product contracts.

## Chosen visual direction

The owner provided two complete visual reference boards and explicitly asked to implement both. The light board uses warm paper, ink typography, coral accents, illustrated browsing and episode cards. The dark board uses navy/charcoal, warm brass and cinematic imagery with a usable TV remote. Both actual supplied images were inspected. This pass follows that selected direction rather than reopening three unrelated concepts.

The intended eye path is **One Piece artwork → current episode and Continue → searchable ordered episode cards**. Desktop has a quiet range index; phone uses a two-column episode grid and retains the same search, range selector, account and TV controls. The player picture and subtitles keep priority in Watch. Cast uses a real remote surface with its existing authoritative state and controls.

## Implementation boundaries

- `views.mjs`: presentation only. Existing player, Cast, account, preparation, range, missing-590 and end-1085 contracts are retained. The header identifies PTI Anime and adds a theme toggle. No fabricated Series/Movies/My List navigation, ratings, arcs or catalogue facts were copied from the references.
- `styles.css` and `layout.css`: shared light/dark tokens, art hero, 16:9 image cards, responsive layouts and control skins. Reduced-motion preference suppresses thumbnail hover motion and transitions.
- Parent integration owns persisted theme state, root `data-theme`, delegated preference actions, image-failure handling and the static artwork manifest. Artwork contains safe HTTPS image URLs from TVmaze. Episode metadata must be matched to canonical episode numbers.
- The visible **Show titles & episode previews** preference controls spoiler exposure. Future episodes use shared early-series promotional artwork when disabled, with a **Preview hidden** badge. Watched/current pictures may be shown. The missing episode uses a deliberate image-free unavailable state.
- Images declare intrinsic dimensions, lazy-load in the catalogue and decode asynchronously. Thumbnail requests do not download episode video, prepare media or trigger companion jobs. A CDN failure exposes a styled fallback.
- Theme changes must not recreate the video element, reload playback, change receiver ownership or restart the companion.

## Review status

First source pass completed, followed by a legibility correction: meaningful episode states now use 12px+; phone search/range inputs use 14px; phone actions use 13px and retain touch-sized controls. The independent critic requested removal of the unconditional next-episode-ready promise; it now reads “Pick up where you left off.”

Rendered light/dark desktop/mobile review, functional regressions and deployment are owned by the parent release lane. No visual acceptance or live release is claimed by this source-only design record until those results are appended.

Final critic correction: the TV remote requests the original-resolution image while catalogue cards keep small lazy thumbnails. Unwatched catalogue state reads “Not watched” without implying cached playback readiness.
