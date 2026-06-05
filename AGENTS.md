# AGENTS

This repository contains an Angular application "PTI App" for tracking time investment across domains using Firebase/Firestore and Google authentication. Components include login, dashboard, domain management, activities, and activity reports. Services manage domains, targets/tasks, activities, and local storage. The app uses Angular's standalone component architecture and Chart.js for visualisations.

## UI development guidelines
- Existing pages are basic; redesigned pages live alongside them using Angular Material.
- When creating redesigned pages, prefix component and route names with `new-`.
- Reuse the existing Firebase authentication flow. New executive/Codex workflow data belongs under `users/{uid}/codexProjects/{projectId}`.
- Run `npm test` and `npm run build` before committing.
- The login flow stays unchanged; provide links to Material redesigns (e.g., `new-dashboard`) from authenticated pages like the existing dashboard.
- Any UI/dashboard/page change is incomplete until it has been visually checked in browser on desktop and mobile-sized viewports.

## CEO command operating model
- PTI is the CEO COE: the hosted visual command surface, operating registry, and instruction home for mobile-accessible Codex planning and portfolio review.
- `ops-forge` is archived legacy work. Do not use it as an active operating root, process source, MCP source, dashboard source, or automation source unless the user explicitly revives it.
- The canonical ecosystem registry and refresh rules live under `docs/ceo-coe/`.
- Start every implementation by identifying the owning repo, active branch, dirty worktree state, and deploy lane.
- Use broad F-drive scanning for discovery only; implementation should happen inside the owning repo unless a cross-repo change is explicitly required.
- Preserve unrelated dirty files. If a repo already has user or agent changes, inspect and work around them instead of reverting.
- Keep project action items in Firestore so the PTI dashboard, Codex chats, and MCP tools share the same tracker.
- The Firebase Functions MCP endpoint is the agent access layer for PTI Firestore. Keep it token-gated and verify `tools/list` plus a real `tools/call` before treating it as available.
