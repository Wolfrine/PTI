# Personal / design contract

L2, editorial reading workspace. User goal: absorb five useful items, record a reaction, continue a question. Scope: new Personal PWA only; existing PTI/Velum/Luminary visuals are not changed.

Direction: paper-like surface, ink typography, restrained rust emphasis; serif article hierarchy, typographic numbering, quiet source/selection annotations. Proximity binds feedback to its article. Borders separate records, not arbitrary card grids. The collection visibly ends. No orbit/glow/network metaphor, invented analytics or decorative imagery. Image generation adds no value to this reading/capture surface.

Use Central design README, UI_AGENT_PROTOCOL and EXECUTION_ROUTING as the source standards; do not copy their corpus. Rendered-browser fallback is used in this chat because no Codex execution tool is present. Original code was rendered locally with module bundling and synthetic sample state at 1440, 768 and 390px. A submit-button interception defect was found and fixed; flows and overflow were rerun. CI also tests the served modules and stores screenshots. Owner taste acceptance remains separate from functional/visual checks.

Acceptance: five-item hierarchy; obvious source and why; minimum usable tap sizes; form labels/focus states; mobile bottom navigation; no horizontal overflow; empty/stale/error/offline/sample states labelled; no sample-to-live persistence. Offline supports the shell, not private cloud writes. Private content is not persisted in the service-worker cache.
