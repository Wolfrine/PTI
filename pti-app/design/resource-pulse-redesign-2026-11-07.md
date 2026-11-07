# PTI Home — compact Resource Pulse

Status: **Resource Pulse direction positively reviewed by owner** (7 November 2026: “This is good”); the subsequent full-width meter refinement awaits owner visual acceptance. The original compact panel was deployed and checked on desktop. This replaces only the oversized usage section of the owner-selected warm-light Home; it does not redesign the rest of Home.

## Intent, evidence and alternatives

The current `/home` directly renders the full Codex panel plus account-wide GitHub repo activity and each Firebase project/database, causing many screens of scroll before the next Home section. Keep Home for orientation and quick decisions; detailed source investigation lives off Home.

| Approach | Home interaction | Tradeoff | Decision |
| --- | --- | --- | --- |
| **A. Resource instrument rail** | Three simultaneous signals, each a direct link to its own detail route; segmented desktop rail, compact mobile rows | Less data in Home, but all three are visible; exact source context is still carried | **Selected** |
| B. Attention-first editorial briefing | One priority narrative with supporting secondary labels | Requires an opaque importance ranking, obscures sources without alert | Rejected |
| C. One-at-a-time tabbed mini-console | Same footprint, but one source visible at a time | Hides two resources, adds navigation before insight | Rejected |

## Implementation contract

- `/home`: `new-resource-glance` renders a compact, quiet three-source reading. Each entire instrument and keyboard focus target routes to `/new-resource-usage/{codex|github|firebase}`. No expanding panels, nested accordions or additional Firestore reads beyond existing source listeners.
- AuthGuard protects the detail route. Detail nav changes source within that page; Back Home restores the launcher. Existing Codex and GitHub/Firebase full-information components are reused, with a filter for a single provider; no duplication of the full data model.
- Desktop target: one horizontal three-segment instrument panel (~150–180px including heading). Mobile target: three dense rows (roughly ~250–300px including heading and qualifiers), one tap per resource, strong focus states.
- Palette: warm parchment `#faf7f2`/paper `#fffdfa`, fine neutral dividers, familiar Georgia headings, understated coral plus blue/amber source icon accents. No dominant hero photography, no generic three raised cards, no dark treatment.

## Measurement truth

1. **Codex**: prefer a numeric primary weekly allowance when available; show remaining percentage, window name and reset countdown. `0` is valid; stale, offline, reset-due, unsupported and unavailable remain distinguishable. The progress bar represents *used* allowance, not remaining.
2. **GitHub**: repo-wide runs/failed runs over the *last 24h*, summed only from non-null reported repo metrics. If the old snapshot is PTI-only, label it PTI-only. Repository coverage is a separate count, never a run count; `Partial` can reflect missing account billing despite complete repository coverage.
3. **Firebase**: headline is the *maximum observed* percentage among numeric reads/writes/deletes for confirmed `freeTier === true` and `edition === 'Standard'` **individual databases**. Limits are 50,000 reads and 20,000 writes/deletes per Pacific day. Display exact project/database/metric/day. No sum across independent database quotas. 24-hour Cloud Monitoring project coverage is distinctly labeled; missing metrics stay unavailable, never silently zero. The quota progressbar visually caps at 100%, while source overage percentage remains visible.

## Verification handoff

Local Angular build, actual authenticated desktop/mobile screenshots and independent reviewer judgments are parent-owned release gates. Existing full detail pages remain intentionally scrollable; only Home is compacted.

## Owner-requested meter refinement — 7 November 2026

The owner observed that the 54–64px progress tracks felt too small, particularly on mobile. Retain the three-source panel and detail-page navigation, but place Codex/Firebase usage tracks as full-card-width, 6px recessed rails below one-line context labels. Gentle coral/amber fills match existing source colors; unavailable readings remain visually unknown. Keep GitHub barless because runs are a count rather than a known quota. Source-only independent review found width improved and metric truth unchanged; a rendered mobile verdict remains open.
