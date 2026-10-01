# Morsel design contract

Level: L3 consumer working surface. Goal: make the next food decision easy on a phone; receipts and inference stay inspectable.

App boundary: Morsel is a separate PWA at https://pti-app-2ab59-morsel.web.app/, like Personal and Velum. It shares the existing PTI Firebase project, account-scoped food memory and MCP. The PTI home tile is a launcher; former /food/ links migrate to the standalone app. Never embed the food UI back into PTI's main site.

Thesis: a personal table, with a pixel meal responding to the chosen food mood, and three grounded directions immediately beneath it.

References retrieved from Central: Material (object continuity and visible cause/effect); Linear (workflow density); Collection (idea-first labels); Atum (tangible metaphor separate from precise facts); Butter (direct controls for generated objects). Anti-pattern checked: GENERIC_AI_UI. No reference palette or layout was copied.

Explorations: (1) pale receipt ledger with photographic dishes; (2) forest table with pixel meal, explicit craving controls and quieter receipt history. Selected (2); the ledger remains the history view. Raster artwork is original and illustrative, never a photo of a restaurant's actual dish.

Motion: a selected mood changes the label/caption and reveals the same meal object through a short stepped mask. Meal hover/steam establish warmth; the pause control and reduced-motion CSS stop the scene. Recommendation entrance preserves the three choice modes. Bar length means number of receipts, never measured psychological affinity.

Data honesty: receipt time is not order-placement time; orders may be shared; flavour/cuisine hints are name heuristics; feedback is explicit; current menus/prices/ratings are not claimed. Exclude fake percentages, decorative networks, infinite restaurant feeds and a dashboard before the dinner decision.

Verification and acceptance notes are recorded after rendering, beside this file. Keep new design guidance compact.

## Product direction — 2026-10-01

Planning rule: first assess the existing combination of facilities, features, data, user journey and felt experience. Compare it with the desired user outcome, identify the missing capability, then plan the smallest complete improvement. A feature earns its place by improving the food decision or learning from its outcome.

Promise: “This remembers me, helps me choose, and improves when I correct it.” The intended feelings are recognition, relief, control and curiosity.

Verified baseline: 93 delivered receipts, no saved meal feedback. Current intelligence ranks historical baskets using counts, receipt timing and dish-name hints; notes and feedback mood do not personalize the model. Discovery uses four curated directions. Receipt baskets can include other diners; frequency is not enjoyment.

First implementation slice: a complete decision and learning loop. Combine food mood with meal context, diners, budget and temporary exclusions. Offer three distinct directions and one-tap refinements such as too heavy, had recently or something different. Keep session rejections separate from lasting dislikes. Record the selected choice; reconcile later receipts only when evidence supports it. Ask which dishes the user ate/enjoyed and make feedback easy to correct. Let confirmed dish-level, context-specific feedback influence subsequent suggestions and show why they changed. Confirm structured interpretations of free-text notes.

Then: build an editable taste summary from explicit preferences and time-aware patterns, with evidence and uncertainty. Research concrete delivery/dine-in options with source timestamps and verified menus/location/prices where obtainable. Add optional proactive assistance after the decision loop demonstrates value.

Acceptance: fewer steps to a satisfying choice; refinements visibly change the shortlist; feedback changes a later decision; shared baskets do not become assumed individual consumption; sparse Zomato receipts do not become a complete diet; existing history stays inspectable. Motion should express narrowing, choosing and learning. Preserve the standalone app boundary.
