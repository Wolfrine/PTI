# Living Horizon Home v10 — sky continuity and measurable parallax (13 Nov 2026)

## Owner's acceptance contract

1. **Initial load:** the sticky Home navigation must not cover any part of the weather scene. A sky-coloured continuation *behind* the navigation occupies exactly its height. The scene starts at the navigation's lower edge.
2. **While scrolling:** navigation stays fixed, becomes a lightly tinted glass surface over the passing scenery, and the image moves demonstrably slower than the page. Sky, art and clouds travel at different rates.
3. **After the scene leaves:** navigation retains a legible colour based on actual day phase/weather, rather than remaining transparent over the application cards.

## Mechanism

- Header height: 77px desktop; 112px two-row mobile. A matching `.horizon-header-sky` spacer shares `--horizon-sky-top` with the sticky navigation. Negative header flow margin makes the header sit over *only* the spacer on first paint.
- Embedded sky sends its computed `--sky-top` to the parent using the existing validated same-origin `postMessage` channel. Rain/storm filters are reflected in the colour. The parent sets the variable on the shared Home workspace.
- Header base has 20% sky-colour tint and blur. The separate settled layer only increases opacity during the weather scene's final 75px behind the header. Sky phase selectors use specificity at least equal to the base header selector, including **night**.
- Parent computes scroll travel from the sticky header's bottom to the iframe top, independent of window versus nested scrolling. Landscape compensates for ~49% of desktop travel (up to 110px) or 27% mobile travel (up to 55px); sky and cloud layers move at lesser rates. Overscan prevents exposed image edges; reduced-motion stops the effect.

## Checks and next QA

- Production Angular build, standalone weather JS syntax and `git diff --check` passed; existing unrelated style-budget / external stylesheet warnings remain.
- Compare actual authenticated Home desktop/mobile on first load, after 100–150px scroll and after weather exit. Check scene geometry, computed phase tint, image displacement, Resource Pulse visibility, contrast and reduced-motion behaviour before marking the design accepted.
- No new test fixtures or generated tests were introduced; standalone landscape and controls stay unchanged.
