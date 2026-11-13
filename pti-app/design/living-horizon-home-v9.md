# Living Horizon Home v9 — ambient weather refinement (13 Nov 2026)

Owner direction: keep the accepted painterly full-width sky, free the space below it for Resource Pulse, make weather facts secondary to the current clock and app actions, and give the scene visible parallax and fresh art on reload/refresh. No regional US AQI.

## Bounded design decisions and review passes

| Pass | Decision / issue addressed | Review outcome |
| --- | --- | --- |
| 1 — information placement | Move observed visibility and computed moon illumination immediately beneath the weather description; allow wrap on narrow screens. | Keeps the atmospheric facts together, rather than occupying a separate Home row. |
| 2 — space and provenance | Hide the full landscape/source paragraph and empty environmental row only in embedded Home; retain the detailed public study and a tiny in-frame source credit. | Reclaims vertical space without losing the standalone provenance explanation. |
| 3 — refresh semantics | Replace the decorative refresh glyph beside the clock with a keyboard-focusable action; remove the former hover tooltip; weather age remains a separate, smaller label. | Clock stays primary; action is no longer deceptively inert. |
| 4 — visual variety | Select a random art treatment from the resolved *regional* pool on each page boot; explicit refresh chooses a different eligible treatment immediately and bypasses the weather cache. | Automatic 15-minute weather checks do not change the image. Regional fit and the standalone studio art selector remain intact. |
| 5 — optical depth | Observe scroll events in capture phase, compute the iframe's real viewport displacement, and parallax sky/cloud/art at different strengths up to 20px. Overscan prevents edge reveal; reduced motion sets displacement to zero. | Addresses the ineffective prior `window.scrollY`-only, 14px implementation. |
| 6 — sticky sky connection | Make Home's already-sticky navigation visually continue the scene's sky-top colour; use a scroll-progressed glass overlay that settles to warm cream by clear day or muted navy at dawn/dusk/night, with a storm-darkened daytime variant. | Navigation stays readable and fixed when the panorama leaves the viewport, without adding another card or distracting animation. |

## Independent review and verification

- Designer source audit: moving both facts beneath the condition, replacing the plain-text sync glyph, and tracking the *actual* scroll container solve the requested hierarchy and interaction concerns.
- Independent critic source review: no blocking code defect; narrow-phone metric wrapping and tiny attribution require rendered inspection. No rendered quality score is inferred from code alone.
- Browser guidance consulted: MDN `position: sticky` and `backdrop-filter`, and Chrome's scroll-animation advice to favour opacity/transform and respect reduced-motion; this implementation uses the existing frame-scroll bridge because the sky is inside a same-origin iframe.
- Production Angular build and main.js syntax: passed. Existing unrelated Angular style-budget and external CSS lookup warnings remain.
- Home route/navigation contract checker: passed. Previous dirty worktrees were left untouched.
- Public Home embed and authenticated desktop/mobile scrolling: **rendered acceptance pending deployment and browser observation**. Keep this distinction in the release report.

The change is a refinement of the owner-approved warm-light direction, not a new design theme. Standalone simulation controls remain available outside authenticated Home.
