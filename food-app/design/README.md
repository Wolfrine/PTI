# Morsel design contract

Level: L3 consumer working surface. Goal: make the next food decision easy on a phone; receipts and inference stay inspectable.

Current visual verdict: **reopened after the owner's 2026-10-01 ecosystem design rejection**. This contract describes the implemented direction, not owner acceptance. `UI_REVIEW_NOTES.md` is the single current verdict; older numerical reviews remain historical. Before more polish, compare genuinely different meal-first directions using real or clearly labelled fixture states. Appetite/food identity, recognition and immediate meal-action clarity are critical dimensions: each must independently reach 8 for critic and parent, with rendered reference comparisons. No overall average can compensate.

App boundary: Morsel is a separate PWA at https://pti-app-2ab59-morsel.web.app/, like Personal and Velum. It shares the existing PTI Firebase project, account-scoped food memory and MCP. The PTI home tile is a launcher; former /food/ links migrate to the standalone app. Never embed the food UI back into PTI's main site.

Thesis: a personal supper club. A specific, appetising meal comes first; a compact invitation helps the user shape it, keep the chosen direction in view and teach the system through explicit reactions.

References retrieved from Central: Material (object continuity and visible cause/effect); Linear (workflow density); Collection (idea-first labels); Atum (tangible metaphor separate from precise facts); Butter (direct controls for generated objects). Anti-pattern checked: GENERIC_AI_UI. No reference palette or layout was copied.

Active direction: photographic supper club with cream, olive and terracotta, editorial type and one generous food composition. The kitchen-notebook alternative was rendered and rejected for oversized imagery and poor small-phone action reachability. The earlier pixel table remains a functional baseline, not the active visual direction. Retain journal pacing for History; Taste leads with a literal confirmed dish reaction rather than a classification grid.

Food artwork is generated, strictly matched to dish names and visibly labelled illustrative. Unsupported foods use a compact native dish-name sketch. Neither form is restaurant photography or evidence of ingredients, portion size or availability. Do not reuse wet-bhel imagery for dry bhel, yellow dal for dal makhani or dry paneer tikka for gravy.

Motion: animate only the changed meal piece with a brief entrance; preserve unchanged food through swaps, additions, removal and saving. Decode before committing a new editor, and invalidate pending work when its owner closes, navigates or changes context. Fresh controls must retain current roles even when artwork is reused. Pause and reduced motion preserve the full working flow. Receipt bar length means count, never measured psychological affinity.

Data honesty: receipt time is not order-placement time; orders may be shared; flavour/cuisine hints are name heuristics; feedback is explicit; current menus/prices/ratings are not claimed. Exclude fake percentages, decorative networks, infinite restaurant feeds and a dashboard before the dinner decision.

Verification and acceptance notes are recorded after rendering, beside this file. Keep new design guidance compact.

## Personal food studio — 2026-10-01

Promise: “This remembers what matters, helps me shape something satisfying, and improves when I correct it.” Recognition, relief, control, curiosity and the pleasure of looking forward to a meal are the product goals.

Start with the current combination of facilities, features, underlying data, journey and felt experience. Compare it with the intended outcome before proposing work. The current verified baseline is 93 delivered receipts and one confirmed dish reaction; basket-level reactions remain empty. Historical basket ranking and decorative discovery alone did not fulfill the promise.

Two interaction directions considered for this phase: (1) conversational concierge, with an agent-led exchange before every shortlist; (2) editable table, with a craving entry, visible food cues and directly changeable meal pieces. Chose (2): a useful decision survives without an agent runtime, and the user can inspect and correct the result. Agents deepen the reasoning through the same structured records. Avoid making chat the only route to a meal.

| Intelligence | Working facility |
|---|---|
| Food understanding | Dish qualities, preparation hints, main/accompaniment/contrast relationships; name interpretations remain explicit. |
| Personal taste | Confirmed personal dish reactions, convenience/shared-diner distinction, time-decayed evidence and explicit preferences scoped to food mood. Receipt frequency is weak evidence. |
| Craving | Editable sensory cues, negation, novelty, sharing, budget and meal mode; one clarifying choice for vague requests. |
| Composition | Same-restaurant combinations, compatible swaps and additions, companion cues, known-price budget checks and explicit portion/unknown-price checks. |
| Discovery | Concrete Kharghar menu names, locations, sources and review dates; research refreshes through agent tools. No invented current prices or availability. |
| Exploration | Familiar / deliberate twist / exploration; record what stayed and what changed, revisit that question after a matching receipt. |
| Memory and anticipation | User-authored meals/rituals; optional on-open receipt-context cues and a gentle feedback prompt. No emotional inference or outbound notification schedule. |

Complete loop: receipt → food/taste evidence → craving → compose/edit → chosen session → unambiguous later receipt → personally consumed dish reactions → changed later ranking. A receipt never automatically means the user consumed or loved a dish. Ambiguous or more-than-two-day matches remain unresolved.

Implementation boundary: shared deterministic `intelligence.mjs` serves app and account-scoped MCP. External agents use `food_context`, `food_plan`, `food_record_learning`, `food_publish_research` and the existing Gmail-triggered `food_ingest_email`. No embedded LLM credential/provider or persistent Dot has been invented. Preferences, plans, learning, memories and research live with the account's existing durable food data.

Perceptual choices: bind the food and dish title together on phones; keep meal pieces directly editable; temporary “Not today” refinements differ from lasting Avoid preferences. Keep the primary meal action in the first phone viewport. Cue editing, inferred signals and receipt analytics stay behind disclosure. Default context uses neutral wording rather than pretending the user explicitly requested it. Source uncertainty is attached to the choice it affects.

Acceptance: refinements change the shortlist; confirmed dish feedback changes later ranking; coherent swaps stay within one restaurant; shared baskets do not imply personal consumption; explicit dislikes beat repeat clues; sourced evidence stays inspectable; first recommendation is visible at 390×844 without horizontal overflow. Preserve the standalone app boundary.

Current evidence and acceptance are maintained in [SUPPER_CLUB_REVIEW.md](SUPPER_CLUB_REVIEW.md). [REDESIGN_REVIEW.md](REDESIGN_REVIEW.md) records the earlier functional baseline. Follow canonical Central > design before any design work: separate designer and independent critic; at least five substantive cycles; parent screenshot checkpoints after rounds 3 and 5; an occasional stronger designer pass; separate critic and parent means >=8/10 with no material defects before release. Intended feelings remain hypotheses; the owner is the final taste authority.
