# Live Weather — full-scene artwork in a shallow panorama

## Visual contract

Home keeps a short weather panel (224px desktop; 194px mobile). The 14
original paintings are roughly 16:9 and have transparent sky. Their painted
content must never be enlarged with `object-fit: cover` to fill a 5:1 panel:
that silently hides mountains, trees and most foreground detail.

The embedded Home renderer therefore uses **visible-art fitting**:

1. Each artwork declares `visibleStart`, the first painted source row (from an
   alpha scan). The original WebP and its aspect ratio remain unchanged.
2. Scale = `min((panelHeight - headroom) / (imageHeight - visibleStart),
   (panelWidth - side margins) / imageWidth)`.
3. Bottom-align the complete image and place it toward the right on desktop,
   centered on mobile; dissolve the leading lateral edge into the live CSS sky.
4. The procedural, time-of-day sky fills the entire width, including the
   space beyond the painted scene. Header sky continuation and sticky glass
   treatment remain controlled by the existing Home palette handshake.
5. Scroll parallax translates the painting **downward relative to the
   scrolling page** at 0.24 times the parent-supplied depth offset, while
   clouds and sky move at different rates. Reduced-motion disables it.

The standalone Living Horizon studio retains its original full-frame framing.
Any *edge-to-edge* desktop painting would require actual 5:1 panoramic
outpainting; simply applying `cover` is not a valid substitute.

## Local visual QA (14 Nov 2026)

- Checked the production source from a clean `origin/main` worktree.
- Opened a local static server in shared Chrome, with real art/rendering code.
- Inspected day and night, 1200×224 desktop and 390×194 mobile, including
  Himalayan botanical, Himalayan woodblock, gouache, paper, vellum and ink.
- Verified uncut mountain peaks and foreground, natural alpha-to-sky blending,
  legible captions, and a visible 110-offset parallax displacement.
- Home header source remains unchanged; full Home development route requires
  Google authentication, so it is separately checked after publication.

Do not reintroduce `object-fit: cover` on `.horizon-embed .daily-art`.
