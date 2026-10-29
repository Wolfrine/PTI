# Civilization Atlas delivery plan and decisions

Decision date: 29-Oct-2026. This supersedes the earlier proposal for a separate Atlas repository/site. **PTI remains central.** The separate Atlas Space documents the subject; it does not imply another application platform.

## Questions resolved by inspection

| Practical question | Decision / evidence |
| --- | --- |
| Where will it open? | Existing PTI `/atlas`, reached from `/home`; existing Firebase auth and hosting |
| Which repository owns it? | `Wolfrine/PTI`, a modular Angular feature and existing hosted-MCP extension |
| Where is private data kept? | Owner-only Atlas namespace in the existing default Firestore database; no private baseline in Git |
| How does an agent begin? | Discover PTI → read Atlas contract and enabled sources → select bounded scope → fetch actual source records → import pending batch → verify receipt |
| What existing work can be captured? | Bounded project evidence from Tracker, relevant project decisions in Pages, approved Drive reference registers and explicitly allowed GitHub artifacts; not automatically everything accessible |
| What does evidence prove? | What the source records, with its limits. Personal understanding remains an explicit self-report |
| How is existing work preserved? | Separate feature/data namespace, lazy-loaded UI, unchanged Home pins/auth/retired routes, sibling rule regression tests and immutable source records |
| How will it remain current? | Manual bounded refresh initially. Further unattended scheduling requires a separate decision about sources, frequency, runtime and cost |

## Concrete activity sequence

| Workstream | Activity and deliverable | Acceptance condition |
| --- | --- | --- |
| Product scope | Preserve the four-layer order and identify the first working Layer1+2 journey | Sector → subject → source → our evidence → explicit self-report is usable |
| Public knowledge | Create a bounded, versioned 12-sector/36-subject editorial seed with sourced branches and honest outlines | Every sourced summary has public references; outlines are explicitly unmapped; no fake completeness percentages |
| Private baseline | Select existing relevant evidence, normalize provenance without changing source dates/status and stage pending records | All records have source identity/limitations; exact readback; duplicates do not multiply on repeat |
| Owner privacy | Isolate Atlas from the legacy broad wildcard before import | Emulator and real-client owner/cross-owner/anonymous tests pass; synthetic probes clean up |
| Storage and history | Immutable evidence/receipts plus separate revisioned review/progression/consent | Concurrent stale changes fail; every owner change has exact before/after history |
| Agent initiation | Extend the already connected PTI MCP with context/import tools and a short startup contract | Bounded pagination, allowlist enforcement, idempotent import and real run receipt verification |
| Interface | Explore, Our work, Review, History, Sources, bounded capture prompt and export | Desktop/mobile primary flows, loading/error/empty/partial/long-content states and keyboard actions work |
| Design quality | Compare three directions, independently critique a real implementation, iterate | Central's required rendered cycles and independent critical-dimension gates; agent-reviewed is not owner-accepted |
| PTI integration | Add guarded lazy route and one curated Knowledge launcher entry | Existing sign-in, safe returns, pins, standalone tools and retired redirects keep working |
| Release | Deploy rules first, seed only after privacy gate, then release frontend+specialized MCP | Exact production assets, auth boundary, connected tools and source/evidence readback verified |
| Documentation | Keep repo contract, Atlas Space and central directory associations aligned | Code/site/Space links point to verified destinations; superseded separate-platform proposal removed as active guidance |

## Subsequent work, in order

1. **Broaden knowledge and work coverage.** Choose one sector at a time, deepen sourced foundations, capture a bounded approved project selection and resolve pending evidence. Acceptance is useful drill-down with trustworthy scope—not a large record count.
2. **Improve operational refresh.** Measure actual fetch time and reads, identify incremental source cursors, test duplicate/conflict recovery and expose run-level outcomes. Decide whether scheduled capture is warranted only after manual capture is useful.
3. **Add world comparison (Layer3).** Agree sources and freshness requirements; show what changed elsewhere, evidence dates and how it relates to our work. Never mix news speculation with established foundations.
4. **Add exploratory connections (Layer4).** Only after the above foundations are established, distinguish hypotheses from source-backed relationships and evaluate whether suggestions help.
5. **Consider a TV presentation mode.** Determine actual TV/casting capability and privacy needs before promising a 7:15 AM schedule. This is a presentation of the same central Atlas, not another data store.

No new paid service, scheduler or broad account permission is part of this release. Deployment evidence and the first private capture receipt belong in the private project Space; raw records do not belong in this document.
