# PTI — Firestore I/O Optimization and Repository/Schema Cleanup Audit

**Date:** 2026-10-19 (Asia/Kolkata)  
**Repository:** [Wolfrine/PTI](https://github.com/Wolfrine/PTI)  
**Code baseline:** [`54c9134c168f`](https://github.com/Wolfrine/PTI/tree/54c9134c168f85ed8ed49cb69c6bea92cf41b78b) (main, observed before this documentation commit)  
**Scope:** PTI Angular shell; PTI-owned Firestore sub-apps; comparison to GTOP source; Git branches; orphan/unused Firestore schema review.  
**Status:** **Audit and implementation proposal.** This report itself does not optimize/deploy application code, delete Git branches, change Firestore rules/indexes, or delete production documents.

## Executive decision

**Optimize behavior before changing database structure.** The most actionable inefficiencies are avoidable writes and oversized listeners, not a lack of cache alone:

1. **Codex Command:** a screen initializes **13 project snapshots** with unconditional `setDoc` writes and **13 distinct live action-item queries**. At present a normal authorized mount can attempt at least **13 writes**, even if the portfolio is unchanged. The detail screen can add another snapshot write.
2. **Domain/target editing:** target-list updates resubscribe to every target's tasks; task snapshot callbacks calculate and **write** domain progress. Repeated subscriptions, redundant writes, and incomplete aggregate updates while child lists are still loading are all plausible from source.
3. **Dashboard:** computing the last 30 days of completed tasks scans the entire owner domain → target → task tree and filters locally; it does not constrain reads to the requested window.
4. **Self-Tracking:** opens **10 unrestricted collection listeners** simultaneously, including historical evidence and conversation-turn text.
5. **Venture and Morsel:** start broad multi-collection listeners at login, despite only a subset being immediately needed.
6. **Secondary write hotspots:** two writes per new target/task; repeated profile or workspace writes on sign-in; event-level Luminary telemetry produces at least two Firestore writes for each `track()` invocation.

**Important:** Firestore persistent caching already exists in Morsel and Tracker, and the Angular shell attempts legacy IndexedDB persistence. A migration to the GTOP pattern is useful, but only after fixing unnecessary operations. A shared cache is **per origin and Firestore client**, not one cache spanning independently hosted PTI sub-apps.

**Evidence level:** source-level confirmed patterns and live collection-name checks; **no measured production read/write totals, billing savings, full collection counts or deployment benchmark**. Impact ordering is qualitative, not a fabricated percentage.

---

## 1. Evidence and scope

### Sources checked

- PTI main source: links below pinned to commit `54c9134c168f85ed8ed49cb69c6bea92cf41b78b`. Reviewed core Angular services/components, Tracker, Morsel, Venture, Personal, SEFPO, Luminary, Wedding and One Piece sync.
- GTOP main source: [persistent Firebase configuration](https://github.com/Wolfrine/gtop-app/blob/main/gtop-app/src/app/app.config.ts), [query-sharing implementation](https://github.com/Wolfrine/gtop-app/blob/main/gtop-app/src/app/services/firestore-read.service.ts), [operational contract](https://github.com/Wolfrine/gtop-app/blob/main/docs/QUESTION_MODULE_OPERATIONS.md) and [v2 Firebase client](https://github.com/Wolfrine/gtop-app/blob/main/gtop-v2/src/app/core/firebase.ts).
- Live PTI owner-scoped Firestore: direct root/subcollection listings and bounded sample queries through the existing owner-scoped PTI Apps connector. These establish **presence**, not exhaustive document counts.
- GitHub: enumerated all 36 repo branches (including main), compared each non-main branch to main on 2026-10-19, and inspected currently open PR metadata.
- Firebase official references: [billing of reads/listeners](https://firebase.google.com/docs/firestore/pricing), [offline persistence and metadata](https://firebase.google.com/docs/firestore/manage-data/enable-offline), [aggregation pricing](https://firebase.google.com/docs/firestore/query-data/aggregation-queries), and [Query Explain](https://firebase.google.com/docs/firestore/query-explain).

### What is NOT established

- Per-screen **production** reads/writes, query latency, reconnect frequency, full document counts, database size, paid billing cost, or actual live users.
- Whether all source files listed are deployed exactly as inspected; both PTI and GTOP contain multiple apps and deployment lanes.
- Whether a Git branch with divergent commits is valuable or obsolete solely from its name.
- Whether a collection absent from `listCollections` is safe to delete: it could be intentionally empty, used by another owner, referenced by rules or agents, or have logically planned future data.

## 2. Evidence-based hotspot inventory

| ID / priority | Code evidence and current behavior | Read/write exposure | Recommended action | Acceptance proof |
|---|---|---|---|---|
| **IO-01 / P0** | [Codex Command](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/pti-app/src/app/components/new-codex-command/new-codex-command.component.ts#L563-L580): 13-entry portfolio loops over `saveProjectSnapshot()` and `watchActionItems()`. [Service](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/pti-app/src/app/services/codex-command-notes.service.ts#L57-L99) always `setDoc` with a fresh timestamp. | **13 attempted project writes + 13 queries per authorized mount**, irrespective of changes. | Remove the write-on-read bootstrap; version/update only changed projects; subscribe only to visible actions plus a compact shared queue; unsubscribe on destroy/sign-out. | Repeat mount with unchanged portfolio: **zero project metadata writes**; listener count stabilizes after navigation. |
| **IO-02 / P0** | [Target subscriptions](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/pti-app/src/app/components/domains/manage-targets-tasks/manage-targets-tasks.component.ts#L60-L76) are opened inside a target-list subscription without teardown. [Calculation](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/pti-app/src/app/components/domains/manage-targets-tasks/manage-targets-tasks.component.ts#L78-L102) always writes domain stats. | Repeated target updates create extra listeners; snapshots cause writes even when aggregates are unchanged. Partial child arrival can persist incomplete totals. | Per-target managed subscriptions (`switchMap`/`combineLatest` or tracked teardown), pure calculation, mutation-triggered aggregation, equality guard, atomic revision/transaction where required. | Initial load and metadata-only updates cause **no aggregate writes**; changing a task produces exactly the intended updated result after all affected data is considered. |
| **IO-03 / P0** | [Task creation](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/pti-app/src/app/services/target-task.service.ts#L27-L66) calls `addDoc` then `updateDoc` to duplicate its generated ID in data. | **2 billed writes** per created target/task. | `const ref=doc(collectionRef); await setDoc(ref,{...payload,id:ref.id})`. Do not alter existing IDs. | 1 new document and **1 write** per creation; old saved records still read correctly. |
| **IO-04 / P1** | [Dashboard completion scan](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/pti-app/src/app/services/target-task.service.ts#L102-L153) loads all domains, then all targets and all tasks, and filters on completion date on the client. [Dashboard caller](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/pti-app/src/app/components/dashboard/dashboard.component.ts#L150-L155). | Rough document-scan shape **D + Σtargets + Σtasks** per refresh, regardless of 30-day matching count; also multiple query requests. | Prototype an owner-scoped completion index or owner `activities` date query; only use the latter if historical semantics match. Optionally maintain idempotent daily summary records after validating value. | Exact 1d/7d/30d chart parity on seeded history, timezone boundaries, and corrections/reopen/re-delete. |
| **IO-05 / P1** | [Tracker load](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/tracker-app/app.js#L58-L60) starts all **10** collection listeners without `limit`; `chatTurns` and `evidence` expand over time. | Full-history initial reads and replay/reconnect risk. IndexedDB is **already enabled** here. | Recent review with bounded queries, cursor-paginated history, on-demand conversation-turn/evidence expansion, local cache reuse. Search requires a separate full-history search plan; do not silently break it. | Bounded first open; deep-link to old record, trace, search and offline recent view preserved. |
| **IO-06 / P1** | [Venture loader](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/venture-lab/data.js#L33-L54) listens to **11 collections** (and `members` for owner), each with a `limit(500)`, plus workspace doc. | Up to **11×500 result positions** in the collection listeners (not actual current documents); collaborators multiply listener cost. | Subscribe to selected discussion/messages and critical statuses; use cursor pages for history, bounded summaries for landing and separate discovery views. | Multi-user edits stay live on relevant screens; mount no longer opens all 11 collections; no lost message or stale access. |
| **IO-07 / P1** | [Morsel loader](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/food-app/app.mjs#L164-L173) subscribes to root + 7 collections; orders allow 501 and other lists 300 each. [Cache initialization](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/food-app/app.mjs#L204-L210) already uses persistent multi-tab cache. | **8 listeners** on first visit and broad potential history read. | Keep meal-critical records live, load long order history in pages and load secondary research/memory views only when opened. Respect personal learning signals. | Suggested meal quality remains consistent; history pagination correct; fewer active queries on the landing screen. |
| **IO-08 / P1** | [SEFPO](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/sefpo-lab/app.js#L77-L99) fetches five bounded collections again after mutations; [auth handler](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/sefpo-lab/app.js#L240-L247) unconditionally writes workspace metadata at sign-in. | Repeated full-list reads and ≥1 avoidable metadata write on returning sign-in. | Targeted local mutation update or scoped invalidation; only initialize missing workspace; preserve audit/event writes and source integrity. | Saving a single unit does not refetch all five collections; second sign-in on unchanged workspace performs no metadata write. |
| **IO-09 / P2** | [Luminary usage logging](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/luminary-observer/app.js#L255-L283) creates `usageEvents` doc **and** updates `usageDaily` for each `track()`; [startup](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/luminary-observer/app.js#L1809-L1819) updates `appMeta`. | ≥**2 writes per tracked event**, plus exposure writes and one metadata write on start. | Retain meaningful capture events but sample/coalesce high-volume UI telemetry; flush counters periodically or on exit; avoid unneeded appMeta refreshes. | Metric definitions, eventual counters, event deduplication and offline reliability tested; no silent loss of meaningful observations. |
| **IO-10 / P2** | [Personal](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/personal-app/app.mjs#L29-L36) issues **6 bounded getDocs queries** at workspace load, default memory Firestore client. | Repeated initial result sets across sessions. | Cache current edition/threads where privacy policy allows, fetch historical reflections on demand, selectively refresh news-sensitive records. | Paused/generation rules respected; fresh news not confused with cached editions. |
| **IO-11 / P2** | [Angular Firestore bootstrap](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/pti-app/src/app/app.config.ts#L31-L37) calls legacy, unawaited `enableIndexedDbPersistence()`. | Single-tab persistence attempt can fail silently; duplicate Angular consumers are not centralized. | Initialize the **one** Firestore instance using GTOP-style `persistentLocalCache` + `persistentMultipleTabManager` before any use; expose explicit fallback state. | Reload/offline/multiple-tab/account-change tests; no duplicate SDK instances. |
| **IO-12 / P2** | [PTI login](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/pti-app/src/app/services/auth.service.ts#L115-L130) reads profile then always writes it on explicit Google sign-in. [Codex detail](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/pti-app/src/app/components/codex-project-detail/codex-project-detail.component.ts#L173-L186) also writes a project snapshot when viewed. | Unnecessary writes for unchanged data. | Compare stable fields and write only on actual changes; keep initial creation/migrations explicit. | Returning login/detail with identical metadata produces no write. |
| **IO-13 / P2** | [Wedding store](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/wedding-planner/src/store.ts#L30-L72) registers `lastSeenAt` on sign-in, live-listens to plan collections and membership; [initializes memory cache](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/wedding-planner/src/store.ts#L93-L107). | Presence write per login and reads on initial plan load; plan revision/history deliberately produces multiple documents per confirmed edit. | Throttle genuinely optional presence updates, lazy-load archival views. **Do not** trade away online role verification, revision checks or immutable history merely to reduce I/O. | Permission downgrade, invited roles, history and revision-conflict tests remain green. |
| **IO-14 / P2** | [One Piece CloudProgress](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/apps/one-piece/companion/src/cloud-progress.mjs#L40-L88) already coalesces in-flight syncs and throttles retries, but cloud commits repeat a lease write in chunked progress flushes. | Potential repeated lease writes during sync batches. | Measure actual lease/progress write traffic; suppress identical writes only if lease authority and revision semantics are preserved. | Takeover, stale-session rejection, offline resume and device handoff regressions remain green. |

**Interpretation rules:** Listener cap represents the maximum query result size, **not** a proven billed read count. Unchanged `setDoc`/`updateDoc` operations remain write operations; a batch or transaction reduces network/atomicity concerns but **not the number of billed document writes**. An absent/empty query can still incur a minimum query charge, so many listeners have overhead even without rows.

---

## 3. Reusable GTOP pattern and proposed PTI read layer

GTOP code already provides:
- **Persistent multi-tab Firestore caching** via `initializeFirestore(app, {localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})`, also represented in GTOP v2.
- **Authenticated identical-query sharing** via `FirestoreReadService`: compares queries with `queryEqual`, shares one `onSnapshot` among consumers, holds unused listeners for 15 seconds, caps idle subscriptions at 12, and closes on auth change.
- **Bounded page reads**: question bank ~25, recent papers/requests ~20, cursor pagination, cache-then-server UX, and required server freshness for confirmation and approval operations.
- **Tests** for share/refcount/teardown, cache-vs-server behavior, reconnect, account switching, and confirmed writes.

### Proposed PTI architecture

1. **Angular shell only:** replace legacy initialization with the supported persistent multi-tab configuration, add one DI-owned authenticated query registry, and reuse same-query streams across screens. Never instantiate Firestore separately in each Angular component.
2. **Distinct hosted PWAs:** each is its own origin; adopt the *pattern* per app, not an imaginary cross-domain shared IndexedDB. Morsel/Tracker already persist; Wedding intentionally uses memory-only until a security-reviewed change.
3. **First-render tiers:** overview = small bounded cached snapshot; details = on-demand indexed query; history = cursor pages; edits = current server/transaction where permissions or conflicts matter. Treat `snapshot.metadata.fromCache` and `hasPendingWrites` explicitly. Cache-only **empty** data is not an authoritative empty server result.
4. **Write policy:** only writes for true user or agent intent, not component lifecycle; deterministic IDs for idempotent source ingestion; no-op equality checks; consolidate related writes atomically only when that actually maintains invariants.
5. **Source of truth:** do not reintroduce parallel `localStorage` copies of Firestore domain records. Firestore's local persistence handles its own sync; keep only UI transient state locally. Operational tracker evidence, event relationships, human messages, corrections and history remain canonical and auditable.
6. **Indexes:** maintain only required single/composite indexes and test queries with server-side **Query Explain**. Do not remove an index merely because it is not referenced by one screen; production jobs and security-rule queries may depend on it.

### Completion-time reporting: alternative designs to test

- **A. Indexed owner-scoped activity query**: simplest, but current task activity writer derives start time from `estimatedTime` and may not match `completedTime` semantics. Validate all historic charts before using it as the truth source.
- **B. Owner-scoped flattened completion ledger**: e.g. `users/{uid}/taskCompletions/{taskId}`, with stable IDs, `completedAt`, estimate/actual, domain and target references. Makes 30-day queries bounded by date. Requires backfill, reconciliation for edits/uncomplete/delete and atomic coupling to the task.
- **C. Daily aggregates**: e.g. `users/{uid}/timeSummary/days/{date}` derived from the authoritative ledger. Fast charts, but extra write load and risk of drift; warranted only after measuring the query-vs-update tradeoff.

**Preference:** test B first for predictable correctness/query scope; use C only if read savings exceed additional aggregate writes and audit complexity. Do **not** delete original task data or overwrite historical completion evidence.

### Firestore billing boundaries

Firestore Standard billing charges reads for returned/updated listener documents and writes per document. Long listener disconnects can trigger a fresh query charge: with persistence enabled, the documented threshold is **more than 30 minutes**. Persistent cache lowers latency/offline dependence but is not a zero-cost server query system. Query Explain provides plans and read-operation statistics on **server queries**, not streaming listener measurements. See the [official billing rules](https://firebase.google.com/docs/firestore/pricing).

---

## 4. Git branch cleanup — verified inventory

This is **Git branch cleanup**, distinct from deleting Firestore collections. Branch deletion **does not itself reduce Firestore reads/writes**. It reduces maintenance clutter, stale CI targets and the possibility of deploying old work.

**Snapshot:** 2026-10-19; `main` baseline `54c9134c168f85ed8ed49cb69c6bea92cf41b78b`; **36 branches total** = `main` + **17 branches whose tips are ancestors of main** (`ahead_by=0`) + **18 diverged branches** (`ahead_by>0`). These are GitHub compare results, not guessed status from names.

### 4.1 Safe-to-*review-for-deletion* candidates — no unique commits

| Group | Branch names | Result |
|---|---|---|
| One Piece (9) | `codex/one-piece-access-requests`; `codex/one-piece-family`; `codex/one-piece-independent-pwa`; `codex/one-piece-install-clarity`; `codex/one-piece-mobile-connection`; `codex/one-piece-public-https`; `codex/one-piece-seasons`; `codex/one-piece-single-app`; `codex/one-piece-themes` | All `ahead=0`; already contained in main |
| Wedding (6) | `codex/wedding-home`; `codex/wedding-botanical`; `codex/wedding-countdown-access`; `codex/wedding-illustrated-pwa`; `codex/wedding-motion-session`; `codex/wedding-offline-reconnect` | All `ahead=0`; already contained in main |
| PTI/SEFPO (2) | `codex/pti-mcp-access`; `codex/sefpo-release` | Both `ahead=0`; already contained in main |

**Disposition:** eligible for branch reference deletion **only after** confirming no active worktree, open PR, CI reference, branch protection, deployment or user-pinned dependency. Record the exact tip SHA before deletion. No branch was deleted in this audit.

### 4.2 Diverged branches — preserve until disposition

`ahead` means commits not reachable from the snapshot of main; `behind` means main commits absent from that branch. Divergence is **not** a declaration that the work is useful or useless.

| Branch | Ahead | Behind | Review concern |
|---|---:|---:|---|
| `codex/monsoon-conservatory` | 17 | 27 | Visual experiment source/assets; may contain active work |
| `codex/pti-shared-mcp` | 5 | 122 | MCP access/backend changes |
| `codex/tracker-deploy-fix` | 2 | 83 | Deployment/workflow changes |
| `codex/tracker-pwa` | 17 | 84 | Tracker rules/app changes |
| `codex/tracker-rules-fix` | 1 | 82 | Provisioning/security-sensitive change |
| `codex/tracker-visual-reset` | 2 | 81 | Tracker UI changes |
| `design/venture-evidence-desk` | 12 | 93 | Venture visual/data exploration |
| `feat/pti-mcp-runner-release` | 8 | 127 | Release workflows and backend provisioning |
| `feat/sefpo-lab-mcp` | 25 | 129 | SEFPO MCP work |
| `feature/venture-lab-discovery` | 15 | 100 | Venture data and discovery changes |
| `fix/design-acceptance-authority` | 1 | 89 | Morsel design governance |
| `fix/pti-pr-triggers` | 2 | 126 | CI workflow rules |
| `fix/sefpo-release-via-check` | 1 | 125 | SEFPO CI/release |
| `fix/venture-data-loading` | 1 | 92 | Venture functional fix |
| `fix/venture-mobile-review` | 4 | 97 | Venture UI fix |
| `luminary/v6-generated-material` | 33 | 141 | Luminary visual assets |
| `luminary/v6-production-fix` | 3 | 137 | Luminary source / service worker |
| `luminary/v7-motion` | 19 | 136 | Luminary motion and source |

**Disposition:** do **not** auto-delete or auto-merge. For each, inspect exact changes against current main, determine active agent/worktree ownership, look for equivalent implementation already present on main, and classify **retain active / cherry-pick useful changes / archive explicitly rejected / discard after approval**. Large `behind` counts make blind merge especially risky.

**Open PR guard:** [#5](https://github.com/Wolfrine/PTI/pull/5) and [#6](https://github.com/Wolfrine/PTI/pull/6) were still reported **open**; their PR head refs were `codex/improve-ui-design-of-the-dashboard` and `codex/pti-refoundation`, respectively (not in the enumerated current PTI branch list). Resolve why their refs differ before any associated cleanup; do not treat missing search results as an authorization to close/delete.

### 4.3 Approved Git cleanup procedure (future execution, not performed)

1. Freeze the branch list and main SHA; enumerate **all** refs, open PRs, protected/default branches, workflows, pending CI and active Codex worktrees.
2. For candidate branch `b` verify `merge-base --is-ancestor origin/b origin/main` (or equivalent GitHub compare `ahead_by=0`) against **fresh** refs; save tip SHA.
3. Confirm no deployment, release tag, workflow, service worker build, user-pinned artifact or unfinished agent is depending on the branch.
4. Require a documented approval/disposition for deletion; capture `branch, tip_sha, ancestry, PR refs, owner, rationale, deleted_at, actor` in an auditable cleanup log.
5. Delete only approved remote branch refs, never default/main; verify main build and deploy lanes afterward. Do not force-push or squash away source history.
6. Review diverged branches separately, prioritizing CI/security and active experiments. Preserve useful unique work before deletion.

---

## 5. Firestore namespace and obsolete-data review

This is **not** an authorization to delete live data. The direct current owner root includes: `domains`, `activities`, `activity-categories`, `codexProjects`, `trackerData`, `foodData`, `personalData`, `ventureData`, `weddingData`, `onePieceData`, `luminaryData`, `sefpoData`, `operatingSystems`.

| Candidate / inconsistency | Observed evidence | Decision |
|---|---|---|
| `operatingSystems` | Root collection name present; bounded direct query returned no documents. Descendant/reference audit **not completed**. | **Investigate only**; don't infer emptiness or delete. |
| Legacy `timeSummary` | Earlier design mentioned it, but owner root listing does **not** show this collection. | Treat as **not present**, not as something that needs deletion. New daily summaries require an explicit model decision. |
| Venture `threads/messages/branches/researchTasks/findings/decisions/experiments` | App registry/code reference these; owner `listCollections` showed only `discoveries/patterns/opportunities/runs` at the time of the check. | **Keep schema contract**; absent collection currently is not obsolete. No speculative initialization/deletion. |
| Morsel `feedback/sessions/memories/research` | App still subscribes to these; owner `listCollections` returned `orders/dishes/restaurants/preferences/learning`. | **Keep intended feature paths** until live usage/agent validation; reduce reads by lazy subscription, not destructive cleanup. |
| SEFPO `units/entities/edges/context/changes/inbox` | The UI writes/queries these; existing owner workspace document was found, but no subcollections were returned by the owner scan. | Investigate whether this is simply unused, different owner data, or provisioning gap. Do not delete contract paths. |
| Wedding `guests/attendance/arrangements` | Present in app model/schema despite no corresponding owner subcollection result. | Reserved functionality, **not deletion candidates**. Keep linked history and access records. |
| Tracker `chatConversations/chatTurns` | Both actually contain indexed history; older app registry omits these collections. | **Retain.** Update documentation/registry instead of removing current data. |
| Wedding and One Piece registry entries | Actual `weddingData` / `onePieceData` exist; current `pti_apps_list` does not advertise these two apps. | **Update app registry after access review**. No migration needed merely to document presence. |
| Luminary `usageEvents/exposures/patterns` | App source references these although some live subcollection listings were absent. | Retain functional schema; telemetry volume reduction is a separate decision. |
| Stale indexes / preview hosting / unused build artefacts | No complete index inventory, release-channel inventory or artifact references were obtained. | **Inventory first**. Git branches, preview sites, cache, indexes and Firestore documents require separate evidence and separate approval. |

**Firestore deletion gate:** establish producer/consumer ownership, document count, latest write, last read/query usage, security rules and scheduled-agent references; export/backup with restore verification; run staging tests; obtain explicit scope approval; delete only bounded confirmed records. Collection/document deletion is irreversible from the app's perspective and may leave orphan subcollections. **No deletion candidate currently passes this gate.**

**Schema hygiene recommendation:** one maintained, versioned owner-scoped collection registry (paths, authors, readers, retention, indexes, visibility, lifecycle) must reconcile **source, MCP registry, Firestore rules, live data and workflows**. Do not create `v2` shadow collections just to rename entities.

---

## 6. Implementation plan and go/no-go gates

| Phase | Scope and deliverable | Required acceptance |
|---|---|---|
| **0 — Observe** | Add *non-Firestore-writing* per-screen I/O instrumentation in emulator/browser tests; capture baseline Firebase Console/Cloud Monitoring stats for matching traffic windows, production index metrics where accessible and screen recordings for representative journeys. Include cold/warm/offline/multi-tab. | Store reproducible journey, branch SHA, current user count, listener/operation counts, cache status and timing. Do not claim billable savings from local snapshots alone. |
| **1 — Eliminate write waste** | IO-01, IO-02, IO-03, IO-08 auth init, IO-12. Preserve concurrency and data contracts; regression tests before merging. | Zero writes on unchanged Codex/target screens; one write per new target/task; correct aggregates after edit/complete/delete; no stale listeners. |
| **2 — Bound initial reads** | IO-04, IO-05, IO-06, IO-07, then Personal and SEFPO history reads. Decide authoritative completion reporting only after parity tests. | No full-history fan-out during overview; pagination and old-record retrieval work; source-linked search remains functional or openly marked limited. |
| **3 — Cache alignment** | Upgrade Angular shell to GTOP-style persistent multi-tab cache and shared authenticated query streams; app-specific policies for non-Angular PWAs. | Cache-first UI does not misreport freshness; account switch/revoked access evicts private visible state; pending writes do not falsely indicate successful save. |
| **4 — Telemetry and sync** | Profile Luminary, One Piece and scheduled-agent collection usage; reduce only observed excess. | Preserved high-value event capture and durable handoff/audit guarantees. |
| **5 — Controlled cleanup** | Reconcile source/app registry, classify Git branches, inspect candidate Firestore roots/indexes/deployments. Produce approved cleanup manifest. | Delete **only** individually approved refs/data; no active PR, rule, worktree, automation or restoration dependency broken. |
| **6 — Verify results** | Repeat phase-0 journeys after staged deployments, inspect Firebase daily reads/writes plus errors/latency. | Per-screen operations and whole-database billing trend lower under comparable use; all correctness/security/evidence tests pass. |

### Test matrix

- **Account state:** first login, second login, same-tab navigation, two tabs, logout, different account, role revocation, blocked member, online/offline/reconnect, denied writes.
- **Progress integrity:** create/edit/complete/uncomplete/delete, cross-device concurrent updates, renamed domain, shifted timezone boundary, partial child loads, invalid/missing timestamps, legacy records.
- **Audit integrity:** immutable tracker evidence, conversation provenance, scheduled reconciliation source cursor, Wedding history, Venture rejected directions, Morsel confirmed taste feedback, One Piece lease authority.
- **Performance:** warm navigation does not multiply subscriptions; no writes from display-only reads; 30-day queries exclude older records; cache-only results are labeled; cursor history has no duplicates/gaps; index and query count changes are measured.
- **CI/deployment:** run required repo build/tests, Firestore rules emulator suites, selected sub-app browser flows, and post-deploy verification. Do not deploy mixed unrelated rule changes during optimization.

### Quantitative acceptance ledger (capture measured values; do not guess)

| Journey | Baseline from source (structural) | Target | Actual baseline/after |
|---|---|---|---|
| Codex Command unchanged opening | 13 snapshot write attempts + 13 action listeners | **0 snapshot writes**; bounded active listeners | Not measured |
| Domain target screen initial read | Task listeners created per target snapshot; unconditional domain update per callback | No write on read; subscriptions settle to unique visible scopes | Not measured |
| New target/task | 2 writes per new record | 1 write | Not measured |
| Tracker landing | 10 full collection listeners | Only bounded, view-needed listeners | Not measured |
| Venture landing | Root + 11 (owner + 1) live collection listeners, cap 500 each | Small essential subset; scoped live conversation | Not measured |
| Morsel landing | Root + 7 listeners; up to 501 order rows | Minimized initial listeners and paged history | Not measured |
| SEFPO returning sign-in | 1 workspace metadata write | 0 if unchanged | Not measured |
| Luminary tracked event | 1 event doc + 1 daily update | Fewer writes only if telemetry fidelity remains sufficient | Not measured |

**Decision standard:** accept an optimization only if it reduces the relevant measured operations **without** worsening correctness, permission isolation, offline continuity or historical evidence fidelity. Reject unsupported claims such as “90% savings” until the production baseline exists.

---

## 7. Immediate Codex/Work handoff

**Suggested first implementation slice:** eliminate PTI UI-triggered write amplification before undertaking schema changes.

1. Observe/write tests that reproduce: 13 portfolio metadata writes on authorized page mount; repeated target task subscriptions and domain writes on read; and two writes per target/task creation.
2. Fix the relevant Angular services/components with the smallest maintainable implementation. Follow existing repo instructions and preserve old records.
3. Verify no-op navigation, changed-data writes, concurrent task completion, error handling, account switch and production build.
4. Report before/after measured emulator operations plus any differences between emulator and actual billed Firestore counts.
5. Commit as separate, reviewable changes. Leave destructive cleanup, historical migration and index/rules deletion for their own gated tasks.

### References

- [PTI repo operating instructions](https://github.com/Wolfrine/PTI/blob/54c9134c168f85ed8ed49cb69c6bea92cf41b78b/AGENTS.md)
- [GTOP read-sharing service](https://github.com/Wolfrine/gtop-app/blob/main/gtop-app/src/app/services/firestore-read.service.ts)
- [GTOP persistent cache configuration](https://github.com/Wolfrine/gtop-app/blob/main/gtop-app/src/app/app.config.ts)
- [GTOP query and cache QA notes](https://github.com/Wolfrine/gtop-app/blob/main/docs/QUESTION_MODULE_OPERATIONS.md)
- [Firestore pricing](https://firebase.google.com/docs/firestore/pricing)
- [Firestore offline caching](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Firestore Query Explain](https://firebase.google.com/docs/firestore/query-explain)

**Change log:** 2026-10-19 — initial source-based audit, 36-branch inventory, staged cleanup policy, no source or production deletion.
