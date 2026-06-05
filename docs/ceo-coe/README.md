# PTI CEO COE

PTI is the CEO COE for this local Codex ecosystem.

It owns:

- the portfolio dashboard visible from desktop and mobile
- the canonical project registry
- CEO refresh instructions
- CEO-upward PM report intake and CEO-downward task allocation
- project action-item tracking
- agent-facing operating rules
- PTI Firestore and MCP access for dashboard updates

`ops-forge` is archived legacy work and must not be used as the operating source unless explicitly revived by the user.

## Source Of Truth

- Registry: `docs/ceo-coe/ecosystem-registry.json`
- Human registry view: `docs/ceo-coe/ECOSYSTEM_REGISTRY.md`
- Refresh protocol: `docs/ceo-coe/CEO_REFRESH_PROTOCOL.md`
- Repo-level agent rules: `AGENTS.md`

## Operating Rule

Every ecosystem activity starts from PTI.

For implementation, agents must still work inside the owning project repo. PTI governs the ecosystem view; it does not replace repo ownership.

Project PMs operate inside each repo's `.pm` space. They summarize recent repo evidence upward for the CEO dashboard and receive CEO-downstream task packets without touching project implementation files during PM refresh work.
