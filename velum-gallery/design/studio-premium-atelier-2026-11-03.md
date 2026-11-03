# Studio — Photographic Atelier (3 November 2026)

## Owner's verdict and protected identity

- The owner primarily uses Velum on a phone. Existing Drift and Browse were liked; the expanded Studio had become visually crowded and harder to use. This is an owner-authorized Studio redesign, **not** permission to rework Drift/Browse, inference backends, permissions or private media contracts.
- **Dark-only, rose-black Velum** remains the sole supported palette. Keep the photo as the visual subject, the verified original uncropped, and actions accessible without repeated microcopy.
- Brand-emotion hypothesis: **private creative confidence, tactile restraint, photographic presence**. Unwanted impressions in the former UI: administrative cards, competing equal controls, an inset modal that squeezes the image, and a long technical wall immediately after opening a creation.
- Product mode: *Operate* (compose, inspect, iterate, save), with an *Explore* gallery and mobile gestures.

## Structural directions considered

| Direction | Mechanism | Trade-off |
| --- | --- | --- |
| **A. Photographic Atelier — selected** | Keep Create/Creations mental model. Prompt-first in an empty session; image-first once generated. Immersive full-frame review with contextual controls and a deeper details sheet. | Secondary functions must remain discoverable and accessible. |
| B. Darkroom Gallery | Creations as the landing with a floating Create flow. | Attractive, but duplicates Browse and adds friction to generation. |
| C. Continuity Reel | Active generation, old creations and compose controls in one continuous timeline. | Good continuity, but long archive filtering and mobile density suffer. |

Reference mechanisms inspected by the design team: iPhone Photos' spacious image stage and natural next/previous motion; Lightroom's media-first editing and contextual controls; Midjourney's results archive; Krea's specialized editor; Arena's dark editorial density. None was copied wholesale.

## Implemented composition

1. **Create (phone):** No dead output box before a job. Start with the verbatim prompt, then engine and compact references, settings, required consent and Generate. Once a job exists, its image and View/Iterate/Save precede the composer.
2. **Creations:** Dense, quiet photographic grid. Existing filters and pagination stay contextual; browsing an opened creation follows the currently visible filter/order without fetching full neighboring images.
3. **Opened creation:** Full viewport on mobile. The entire verified image fits inside the stage; a slim position indicator, Quick Exit/Close and a restrained action bar remain. Swipe horizontally or use keyboard arrows / desktop chevrons for adjacent loaded creations. Vertical scrolling and original-image tap/hold comparison remain distinct gestures. At the loaded-page edge, no automatic archive query is made.
4. **Review and editing:** Primary actions are Edit (when available), Save and Details. Details expands a dark bottom sheet with Keep/Iterate/Reject, collapsible notes and one **Save review** action; reused prompt, download and deeper provenance follow. **Keep + save to Drive** and reversible removal are in Manage; removal requires a separate confirmation tap.
5. **Settings and PC:** Shorter mobile bottom sheets. Pose, Seed and Image format stay visible; guidance is behind a disclosure. Worker approval/recovery logic is unchanged.
6. **Desktop:** Empty Studio is a centered composer, not a dead preview; active Studio is an image/editor workbench. Opened creations use a dedicated media area plus action dock and right-side review rail, without covering artwork pixels.

## Guardrails

- No new worker, model, Firestore schema, inference, Drive or authentication behavior. Source prompts/settings and verification remain authoritative.
- Preserve private object-URL cleanup on auth changes, PIN lock, pagehide and selection changes. A viewer opened from Creations restores the previous Create selection/verified Blob locally when it closes, without a new read.
- Swipe only on the media, with a deliberate horizontal threshold; keep compare tap/hold, accessibility/keyboard navigation, and reduced-motion support.
- No automatic neighboring original downloads, no unapproved image deletion, and no change to Drift/Browse.

## Evaluation status

Baseline: detached PTI revision `b1524c7`, with matched 360×800, 390×844 and 1440×900 synthetic-media screenshots. The first candidate exposed a desktop image crop and crowded Details. Subsequent iterations corrected the crop with an uncropped desktop media stage, moved actions to a separate dock, made optional Notes collapsible, separated review from Drive saving, and removed duplicate actions.

**Final independent visual verdict: agent-reviewed 8.7/10 overall.** Artwork 9.3; mobile hierarchy 8.8; swipe/compare 8.1; dark craft 8.8; progressive disclosure 8.6; desktop 8.7. No material visual blockers identified. Technical QA separately passed **158 tests**, including real Chromium swipe/tap/hold, private viewer lifecycle, review and two-tap removal checks, with no fixture page errors or horizontal overflow at the inspected sizes. This is **not** owner acceptance.

The browser fixture uses synthetic photography, no owner photos, no real Firestore/Drive, and no PC inference. Real owner-device behavior and authenticated model generation remain separate verification gates.
