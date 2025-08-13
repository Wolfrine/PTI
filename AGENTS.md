# AGENTS

This repository contains an Angular application "PTI App" for tracking time investment across domains using Firebase/Firestore and Google authentication. Components include login, dashboard, domain management, activities, and activity reports. Services manage domains, targets/tasks, activities, and local storage. The app uses Angular's standalone component architecture and Chart.js for visualisations.

## UI development guidelines
- Existing pages are basic; redesigned pages live alongside them using Angular Material.
- When creating redesigned pages, prefix component and route names with `new-`.
- Keep Firestore structure and authentication services unchanged; new components should reuse existing services.
- Run `npm test` and `npm run build` before committing.
- The login flow stays unchanged; provide links to Material redesigns (e.g., `new-dashboard`) from authenticated pages like the existing dashboard.
