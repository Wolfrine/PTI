# Morsel UI review

Reviewed rendered release a7474bb at 1440×1100, 390×844 and 320×740. Desktop keeps controls and three decisions together. The 390px layout now introduces the first choice in the initial viewport. The smallest layout stacks all controls and decisions without horizontal page overflow. Meal artwork, mood label and caption no longer overlap.

Playwright passed mood selection, recommendation explanations, explicit feedback, receipt details, Taste, Discover and motion control at all three sizes. Five receipt/ranking tests and sixteen MCP tests pass. Follow-up verification waits for finite animations before capturing secondary views and checks navigation while motion is paused. Continuous scene motion pauses independently of view entrance so new views remain visible.

Accepted design: forest table, warm accents, original illustrative pixel food, visible food-mood controls, three explainable directions, quieter receipt and taste views. Data remains private in user-scoped Firestore; public sample screenshots contain fictional receipts only.

Limits: receipt timestamps are not placement times, baskets may be shared, cuisine/flavour labels are name heuristics, and historical basket prices are not current menu prices. Discovery offers ideas and search links, not verified restaurant availability. Gmail event capture is configured separately; a future real event is still required to verify its complete delivery path.
