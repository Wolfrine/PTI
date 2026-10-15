# Countdown and family access — release record

Status: implemented and locally verified; cloud release pending. Branch `codex/wedding-countdown-access`, based on main `075b1e3`.

The invitation retains the Botanical artwork and concise journey, with a centred live countdown to the explicitly labelled **18 January 2027, midnight IST**. This is the planned date's boundary, not a ceremony time. No event times, venues, contact or menus were newly published.

Family access now registers verified accounts when they enter the family site. Admins open **Family account menu → Manage family access** (`/family/#/access`) to search/filter accounts and assign Viewer, Family or Admin, return an account to Awaiting approval, or block it. Approval is required before new accounts can read private records. Current role, proposed choice, saving and recoverable errors remain distinct. Existing Editor memberships retain Family permission. This does not enumerate unrelated PTI accounts or recover historical visits.

The existing connected owner UID is always Admin. Provisioning obtains its canonical enabled, verified email from Firebase Auth, pins the Admin membership and protects that key in the rules. Empty owner-profile login timestamps mean bootstrap only. Operational records/history are excluded from this bootstrap transaction. Unknown shared-rule drift stops publication; existing sibling namespaces remain unchanged.

## Evidence and verification

- Five bounded visual cycles retained in [BRIEF](BRIEF.md), [critic report](CRITIQUE.md) and [stronger round 4 review](STRONGER-ROUND4.md). Final candidate `22c25dc3fc0c4a9cdc8f6fee22d5ac162419ab657f335db5d49b28fe9c8bdb20` binds 47 source/build/content/capture-fixture entries. Parent independently recomputed that fingerprint and checked every current entry's bytes.
- Parent personally inspected final invitation at 1440/360, access roster at 1440/390, Pending at 390, Viewer home at 360 and failed role assignment at 390. Parent visual scores: identity 8.3, clarity 8.2, craft 8.2, overall 8.2. Names and art remain dominant; the four timer units fit; owner/current/draft role hierarchy and phone controls are readable. The orphaned Decisions letter is resolved. This is agent review, not family aesthetic approval.
- Separate functional QA: 10 model tests, 13 wedding rules tests, 9 Venture shared-rule regressions, 43 Personal contract tests and 12 browser scenarios pass. Actual Auth/Firestore emulator browser tests pass automatic registration, all role transitions in open tabs, owner protection, stale role/revision rejection, focused-menu preservation, archive/history export and private draft clearing. Local reports/logs remain in ignored `.wedding-qa/access-*` and `store-integration.json`.
- All 64 isolated role/profile/security probes passed on emulators; provisioning stub tests checked verified identity, idempotence, preservation and drift rejection. [Security report](SECURITY.md) distinguishes self-tested release-script implementation from independent review of parent code.
- Wedding and unchanged shared PTI production builds pass; production wedding audit reports zero vulnerabilities. Existing shared Angular specs still have **8 missing Auth/Firestore-provider failures, 1 pass**; source/specs were not changed. Build size advisories remain nonblocking.

Family screenshot identities/errors/roles are browser-only synthetic fixtures. Interactive authorization tests use isolated synthetic accounts. No real wedding records were used as test fixtures or overwritten. A real human Google popup, actual native BFCache navigation and full accessibility conformance were not tested. Controlled page events verify countdown stop/resume; static screenshots do not prove motion or user comprehension.

Live release, protected-owner readback, hosted-byte comparison and before/after operational-record comparison will be recorded after deployment.
