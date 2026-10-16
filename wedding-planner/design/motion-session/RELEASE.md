# Released 16 October 2026 — motion and remembered family access

Live: [invitation](https://mahima-mayank.web.app/) · [family workspace](https://mahima-mayank.web.app/family/).

[PR #42](https://github.com/Wolfrine/PTI/pull/42), source `95085f86ecdbe30200cca77b67ea946d65b3ed18`, merged as `cc704f5499b93200e2004c556bc0e7a06e71e88a`. [PR CI 38847786807](https://github.com/Wolfrine/PTI/actions/runs/38847786807) and [main release 38848250044](https://github.com/Wolfrine/PTI/actions/runs/38848250044) succeeded. Source and merge have identical Git tree `0150e2df8f95e57315f5234e815d3315c6a3d6e7`. A fresh canonical Git-archive build reproduced all 121 reviewed inputs, including 47 deployable files.

Exact agent-reviewed candidate: `3399717616f513235eeac31e3d9ac6f3e8d5b72527df58934b6f4c0be62ca505`. Public PWA version: `637de44bb62da798a10a`, with 22 public cached assets plus saved-time metadata. No Firebase/family code or private data entered that cache. Native motion adds approximately 3 KB JavaScript and 1 KB CSS before compression, with no animation-library dependency.

The release preserves the planned date window and centred midnight-IST countdown. The invitation has a short opening and sparse botanical sway, remembered Pause/Resume and reduced-motion support. Invitation remains directly visible after family login on desktop and phone; Family workspace returns without another sign-in. Durable Auth restoration still verifies current roles; manual logout clears private state across normal and legacy-migration tabs. Firestore stays memory-only.

## Actual verification

Both CI runs pass 17 model/menu tests,13 wedding and 9 Venture rules, existing collaboration/export/conflict/access checks,5 persistent-profile Auth/Firestore emulator journeys,12 existing UI scenarios, all 10 menu projections/search/comparison, sharing metadata/fallbacks, production motion at 1440/390/360 and6PWA cases. Main also passes 64 isolated live registration/role/write/revocation/owner-protection probes. Provisioning reports `seeded:false`; it did not reset the existing plan.

Parent independently matched every hosted file to the reviewed build and every public cache hash, checked static social metadata/response policies and additional source routes returning 404, and exercised the actual Hosting saved invitation→neutral private offline→saved invitation→online recovery. Hosted motion tests pass early pause, remembered choice across reload, changing OS reduced-motion and genuinely offscreen pause/resume at 1440/390/360. Parent personally inspected live motion 1440/360, signed-out family 1440/360 and both offline 390 states. Actual authenticated Invitation/Family journeys and browser-process restart use synthetic Firebase emulators and a real persistent Chromium profile; live Google popup/physical phone behavior is not inferred.

[Deployment and byte binding](deployment-binding.json) retains public hosted/cache hashes, actual motion observations and archive proof. [QA.md](QA.md) records the two reproduced/fixed logout defects, strengthened authenticated readiness marker and precise boundaries. [acceptance.json](acceptance.json) binds 12 final states and five substantive visual cycles; its evidence validator passing proves retained-evidence integrity, not beauty or owner approval.

## Operational preservation

PTI MCP complete bounded reads after deployment were field/value identical to the pre-change baseline, including update metadata:10 events,7 decisions,2 history entries,5 memberships and 5 access requests; guests, attendance and arrangements remain empty. Root owner UID matches the protected account and its membership remains Admin. All 10 canonical menu texts remain exact. [preservation.json](preservation.json) contains counts/verdicts only; private raw documents/emails are not committed. No operational wedding write belongs to this feature.

## Remaining boundaries and recovery

Owner aesthetic review, a human Google popup and physical installed-app restart remain unverified. Browser credential validity/storage and origin still govern remembered sign-in. The unchanged shared PTI Angular build passes with existing budget warnings; its unrelated Karma baseline remains 1 pass/8 missing Auth/Firestore-provider failures. Optional GitHub artifact uploads hit the existing storage quota; CI continued and committed review/release evidence is available here. Existing unrelated SEFPO main-workflow failures were not changed.

PWA updates wait until wedding windows close; they do not reload open private drafts. A person using an older release may need one initial sign-in after the update; subsequent restoration is retained in that browser/device. If recovery is needed, rebuild a chosen reviewed wedding version with the current public-only worker generator and release only `hosting:wedding`, including `/sw.js`. Preserve operational Firestore data and current shared security rules. Recheck hosted hashes, public/private offline behavior and Auth/logout after rollback.
