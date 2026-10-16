# Motion, invitation navigation and durable family sessions

The product remains a personal Botanical invitation and an online private family plan. Names, planned dates, date-boundary countdown and provisional wedding arrangements are unchanged. Existing scene/food artwork is indicative, not actual venue/food photography. Final family design captures use explicitly labelled DEV fixtures; actual Auth checks use isolated synthetic emulator accounts.

## Implemented and observed

- A short entrance and one native SVG botanical sway; no animation library. Parent sampled actual moving transforms at1440/360, personally viewed their time-separated frames, and verified a stable650ms pause. Final production tests cover1440/390/360, early pause settling names/date, remembered choice, OS reduced-motion changes and actual offscreen pause/resume.
- Direct Invitation in the authenticated header at phone and desktop widths, with Family workspace as the public return. Public code still imports no Firebase. Parent personally viewed both the exact final design states and actual emulator-authenticated360/1440 screenshots.
- Browser-local Auth survives closing/reopening an actual persistent Chromium process. Existing session sign-ins migrate; restored identity checks current membership. Revocation shows pending with zero private records, reapproval opens the plan, and manual logout clears tabs/private editors and survives another browser restart. Firestore remains memory-only.

Two real logout failures were reproduced before repair: switching from default initialization storage left new tabs listening to different storage, and a still-open migrated legacy tab could miss another tab's logout. Initialization now selects durable storage first; a logout-only random storage notification also clears legacy migration tabs through Firebase sign-out. It contains no identity, grants no access and cannot restore sign-in. Both regressions pass. The final journey test explicitly waits for the authenticated account menu and absence of the loading/login shell; its Welcome heading alone was insufficient as a state marker.

## Verification

| Check | Local result |
|---|---|
| Wedding model/menu and build |17 tests pass; TypeScript/Vite pass|
| Shared Firestore boundaries |13 wedding and9 existing Venture tests pass|
| Existing store integration |Collaboration, revision conflicts, complete export, active revocation, editor clearing and sign-out pass|
| Durable-session regression |5 emulator-backed journeys pass; one initial sign-in throughout restoration/navigation/revocation, plus one deliberate sign-in to set up the separate legacy-logout case|
| Existing browser, menus and sharing |12 task scenarios; all10 complete menu projections/search/comparison; static metadata and native/copy/manual fallback simulations pass|
| Motion and PWA |Production motion at1440/390/360 passes;6 PWA cases pass, including actual offline animation, redirected/Brotli neutral family fallback and waiting updates|
| Exact final render/lifecycle |12 unique states;121 input hashes guarded before/after; actual native BFCache persisted return with one advancing sway; actual public offline motion and zero family-network requests for private offline|
| Production dependency audit |0 reported vulnerabilities|
| Shared PTI application |Build passes; unchanged Karma baseline1 pass/8 missing Auth/Firestore-provider failures|

Final candidate and files are in `build-fingerprint.json`; screenshots, measured temporal observations and video hash are in `final-states.json`. Five substantive visual cycles and the randomly selected actual stronger round2 review remain recorded in BRIEF/CRITIQUE/STRONGER-ROUND2. The first final candidate was held for authentication QA and never accepted/deployed. Later test-marker strengthening changes verification bytes while leaving the deployable build unchanged.

The retained videos were captured, not claimed as watched playback. Temporal judgments use measured animation state and personally inspected time-separated frames plus independent live-browser observations. Earlier synthetic visibility-handler events are labelled and do not establish real OS background behavior. Physical installed-app restart, a human Google popup, owner aesthetic acceptance and comprehensive accessibility certification are not claimed. Current browsers can still require sign-in after data deletion, credential invalidation or changing browser/origin.

Release/hosted byte checks and operational Firestore preservation are recorded separately in RELEASE.md after deployment.
