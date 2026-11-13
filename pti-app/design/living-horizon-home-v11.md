# Living Horizon Home v11 — seamless sky and original artwork framing (13 Nov 2026)

## Visual defects reported after v10

- The sticky navigation read as a darker, separate band even before scrolling.
- The daily illustration appeared enlarged, horizontally cropped and soft, especially on phones.

## Source-grounded causes and corrections

1. The embedded sky extends 48px above its frame. Therefore its first visible pixel is already ~32% of the way between `--sky-top` and `--sky-mid` on desktop; a parent spacer painted with only `--sky-top` cannot match. The iframe also applied a horizontal dark vignette all the way to its upper edge, while the header carried an always-on translucent sky tint and blur.
   - The weather iframe now sends a filtered `skySeam` sample along with its existing sky-top colour, via the existing same-origin palette event.
   - The same-height header spacer continues the gradient over its final 48px. The upper portion remains the sky-top tone.
   - The header paints nothing on initial load; its `::before` glass layer settles in only when the scenery is nearly out of view. The embedded vignette now darkens only the lower caption area.
2. The v10 artwork element was 220px taller than the weather strip on desktop and 124px taller on mobile. Because its natural ratio is approximately 16:9 and `object-fit:cover` was active, the oversized box itself enlarged the art. At a 390px-wide phone this forced ~45% magnification and side cropping.
   - Embedded artwork is now exactly the scene's size. Its original `object-fit:cover` composition and image resolution are preserved.
   - Parallax pans `object-position` through the image's **naturally available cover overflow**, not through an enlarged image element. Movement is clamped dynamically to avoid exposing empty edges on narrow screens; cloud and sky depth motion remains separate.

## Verification and constraints

- Angular production build, standalone JS syntax and Git whitespace checks are the minimum engineering checks.
- Actual authenticated desktop/mobile visual approval is pending: the signed-in browser connector refused page inspection by host policy. Do not treat these source calculations or a passing build as visual acceptance.
- The original 1600/1672px illustrations are unchanged; a future 4K TV landscape quality pass can use larger image assets without changing this composition mechanism.
- Standalone experimental weather controls and the Resource Pulse placement remain unchanged.
