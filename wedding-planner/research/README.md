# Wedding research and evaluation handoff

Research date: **15 October 2026**. Status: **research complete for an initial domain baseline; family calibration and application evaluation pending**.

## Purpose and ownership

Chat records the base intent; Work researches the domain and develops evaluation material; Codex implements and supplies execution evidence. This pack supports that division. It adds no application code, infrastructure, bookings or deployment.

Start with the [project intent](../README.md) and [live wedding record](../WEDDING_RECORD.md) for actual family-supplied facts; then the [guest intent](../guest-experience/README.md) and [family intent](../family-workspace/README.md). Read the [domain guide](DOMAIN_GUIDE.md) for the subject at hand and [eval guide](../evals/README.md) before evaluating. The machine-readable [cases](../evals/cases.json) contain synthetic situations and expected outcomes.

For the current food decision, read the [**source-backed menu review**](MENU_REVIEW.md): ten listed services, within-service overlaps, cross-event repeats, flavour and texture profiles, targeted substitutions, combinations and guest-preference limits. It includes its own 29-source register. All recommendations are proposals; the [Wedding Record](../WEDDING_RECORD.md) remains canonical for actual selections, and no tasting or guest survey has been performed.

**The coverage map is a research reference, not a feature backlog or a requirement to create one page per topic.** A family can handle an arrangement outside the app, mark it irrelevant, or express it through a simple note. Evaluate whether the intended outcome is supported with reasonable effort. Keep the celebration lightweight.

## Established context and open facts

| Established by the current repository | Still unknown; must come from invitation/family/vendor evidence |
| --- | --- |
| Three-day wedding; bride **Mahima Mishra**, groom **Mayank Awasthi**; catering sheets dated **18–20 Jan 2027**; **Sangeet on 18 Jan evening** | Dates and programme are not yet invitation-verified; city, venues, other ceremony timings and Reception date unknown |
| Public living invitation; authorized family workspace | Traditions, officiant-confirmed rites/order/timings and each event's audience |
| [Initial handwritten catering menus](../WEDDING_RECORD.md) for 18–20 Jan and an **undated Reception**; stalls and meals considered together | Final selections, wedding-wide food policy, dietary needs, caterer and per-meal counts are unconfirmed |
| Existing PTI repository and Firebase project; separate public identity | Guest groups, travel, stay dates, hotel policies, sponsor/payment arrangements |
| Personal, simple, connected planning | Budget, vendors, family owners, publication decisions, site name |

The owner's personal vegetarian preference does **not** establish the entire wedding's menu. No regional custom, venue, guest count, price or travel time has been inferred. Example dates, names and quantities in evals are fictional and must never populate live wedding data.

## Research method and limits

Research used first-party wedding service descriptions and official sources, rather than treating search rankings as quality evidence. Commercial sources describe possible services and reflect their own regions/market segments, often luxury destination weddings. They establish useful questions and options, not this family's budget, mandatory customs, vendor quality or availability.

The guide distinguishes **source observations**, **proposed planning checks**, **illustrative options**, and **family/vendor decisions**. The latter three are synthesis, not facts asserted by the cited source. There are no verified local quotes, capacity surveys, hotel allocations, menu tastings, interviews, family-approved exemplars or application runs yet. Legal/permit applicability and current catering requirements need local/vendor confirmation; the dated FSSAI material supplies food-safety background, not a current legal certification.

## Sources and claim boundaries

All links were accessed or inspected through web retrieval on 2026-10-15. A source ID links research to eval cases; the expected results remain our proposed acceptance criteria until calibrated.

| ID | Source | Useful evidence and boundary |
| --- | --- | --- |
| S01 | [Studio Eventz: rituals](https://www.studioeventz.com/faqs/wedding-rituals) | Examples of mehendi, haldi, sangeet, baraat and ceremony dependencies. Planner perspective; do not import its universal or legal claims. |
| S02 | [Hitkari: guest services](https://hitkariproductions.com/wedding-guest-list/) | RSVP, guest needs, accommodation, transfers and hospitality desk are connected service areas. Vendor marketing; performance claims unverified. |
| S03 | [Studio Eventz: guest experiences](https://www.studioeventz.com/faqs/guest-experiences) | Welcome guides, ceremony explanations, language support and arrivals. Optional ideas; luxury staffing levels are not a baseline. |
| S04 | [Jain Caterers: menu planning](https://jaincaterers.co.in/blogs/wedding-catering-in-mumbai-with-thoughtful-jain-menus/) | Parallel dietary menus and balancing familiar/regional dishes. Individual Jain/fasting requirements still need confirmation. |
| S05 | [New Bhojon: live counters](https://newbhojon.com/live-counter-food-for-wedding-guide/) | Examples of chaat, dosa, grills and international stations. Use as an option catalogue; reject claims that any counter is mandatory or automatically safe. |
| S06 | [FSSAI: catering guidance](https://www.fssai.gov.in/docs/business/guidance/Guidance_Document_Catering_Sector_19_01_2018.pdf) | Voluntary guidance on water, handling, storage, transport, service and hygiene; document first edition October 2017. Regulations take precedence. |
| S07 | [FSSAI: 2022 direction and catering provisions](https://www.fssai.gov.in/upload/advisories/2022/12/638edf17bdbb2Direction_Licensing_28_11_2022_.pdf) | Allergen ingredients, cross-contact controls and disclosure when controls cannot be guaranteed. Historical primary document; verify current requirements with caterer. |
| S08 | [JW Marriott Mumbai Juhu: event capacity chart](https://www.marriott.com/en-us/hotels/bomjw-jw-marriott-mumbai-juhu/events/) | Layout-specific capacities differ within the same room. Illustrates why an advertised maximum is insufficient; not a venue recommendation or a capacity for this wedding. |
| S09 | [JW Marriott Mumbai Juhu: hotel information](https://www.marriott.com/en-us/hotels/bomjw-jw-marriott-mumbai-juhu/overview/) | Check-in/out, accessibility and transport provisions are property-specific. This property's policies must not become universal hotel defaults. |
| S10 | [DEPwD: universal accessibility guidance listing](https://depwd.gov.in/en/document/harmonised-guidelines-standards-for-universal-accessibility-in-india-2021/) | Official entry point for physical accessibility guidance. Listing read; underlying full standards not audited here. No dimensional certification is claimed. |
| S11 | [IMD: district warnings](https://mausam.imd.gov.in/responsive/districtWiseWarningGIS.php) | Official district-level warning source. No forecast for an unknown wedding date/location has been made. |
| S12 | [Studio Eventz: photography](https://www.studioeventz.com/faqs/photography-cinematography) | Coverage style and delivery commitments are distinct decisions. Drone/rights requirements require separate official/local verification. |
| S13 | [Studio Eventz: timeline](https://www.studioeventz.com/faqs/timeline-planning) | Multi-event coordination and indoor weather alternatives. Its suggested sequence, booking windows and discounts are not universal requirements. |
| S14 | [National Government Services Portal: marriage services](https://services.india.gov.in/service/search?kw=Marriage+Registration+Certificate&ln=en) | Registration services vary by jurisdiction. Actual process and applicability remain unresolved. |
| S15 | [W3C: WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Testable web accessibility criteria, including contrast, reflow, keyboard and target size. A few checks do not establish full conformance. |
| S16 | [Firebase: basic Security Rules](https://firebase.google.com/docs/rules/basics) | Data access must be authorized; being signed in alone does not establish family membership. Applies to product evals, not a prescribed schema. |
| S17 | [Anthropic: agent evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | Outcome checks, mixed graders, positive/negative cases, isolated trials and repeatability. Method, not wedding-domain authority. |
| S18 | [OpenAI: evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices) | Task-specific criteria, human calibration and comparison-based grading. No platform purchase or API integration is required. |
| S19 | [Hamel Husain: error analysis](https://hamel.dev/notes/llm/officehours/erroranalysis.html) | Derive useful evals from observed failures. Current synthetic cases need real family usage to establish frequency and importance. |
| S20 | [Anthropic: long-running application harnesses](https://www.anthropic.com/engineering/harness-design-long-running-apps) | Self-grading leniency and rubric wording affecting design direction. Supports separate, calibrated review; no automatic aesthetic score is trusted. |

## Decisions to resolve during actual planning

Obtain confirmed invitation facts, event audiences, customs and timing windows; count people per event and meal; establish food and stay needs; confirm venue/hotel/caterer terms; assign family points of contact. Resolve these through the normal planning conversation, without a large compulsory onboarding questionnaire.

Next research should be triggered by a real decision: a specific locality, venue offer, menu, hotel policy or family custom. Refresh volatile facts before commitment. This baseline is broad coverage, not a claim that every regional wedding tradition has been exhaustively documented.
