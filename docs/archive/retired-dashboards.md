# Retired PTI dashboards — intent archive

Retired by the owner on **2026-10-24**. This is historical context, not an implementation or agent operating contract. The current dashboard is **PTI Home at `/home`**, the personal app launcher shown after login. See [current README](../../README.md) and [AGENTS.md](../../AGENTS.md).

## Original intent

The original **time-investment dashboards** at `/dashboard` and `/new-dashboard` visualized time against domains, targets and completed tasks. They offered activity charts, recent-period totals and entry points into domain/activity editing. The root README described the Profitable Time Investment idea; its speculative audience percentages were prose, not measured user data.

The later **CEO Command/CEO COE** at `/codex-command` proposed portfolio standing, urgency, blockers, project details, action items, PM handoffs and ecosystem refresh instructions. The `docs/ceo-coe/` registry/protocol and hard-coded project snapshots belonged to that proposal. The owner confirmed that this screen and the time dashboards are unused. They are retired rather than promoted as PTI's current identity.

## Retirement and preservation

- Removed both dashboard UIs, CEO Command, its project-detail UI, exclusive snapshot/action-item service and static portfolio data.
- Removed their launcher tiles, default pins, Today navigation and CEO welcome action. Existing pin/recency validation purges retired IDs.
- Old dashboard/CEO URLs and login-return destinations resolve to `/home`.
- Preserved standalone `/domains`, `/domains/:domainId`, `/activities` and activity reporting dependencies. They remain directly reachable; their back-navigation uses Home.
- Preserved **all existing Firestore documents**, including domains, targets, tasks, activities, project snapshots and action items. No production data migration/deletion is part of this retirement.
- Consolidated the obsolete CEO process/registry documentation here. Historical `.pm` reports remain dated evidence, not the current dashboard contract.

## Historical source

The full prior implementation, README and `docs/ceo-coe/` documents remain recoverable from commit [`ca8749824e0f88b49f2bab64e3008299ea58de5e`](https://github.com/Wolfrine/PTI/tree/ca8749824e0f88b49f2bab64e3008299ea58de5e). Use that revision for historical research only. Restoring retired behavior requires a new owner request.
