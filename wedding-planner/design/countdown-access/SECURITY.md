# Countdown and family access — independent security review

Review lane: Firebase authorization, registration, role transitions, deployment guards and preservation of existing wedding records. UI aesthetics and countdown behavior are outside this review. Initially read-only; the parent subsequently assigned this reviewer the wedding provisioning/baseline/cloud-verification scripts and the Personal provisioning drift allowlist. Those script changes are **self-tested implementation**, not independent review of the reviewer's own output. The parent owns rules, store and application tests. No live writes were performed by this reviewer.

## Baseline inspected

PTI `main` at `075b1e390c285aba3868f00b17e935dc193ca80c`, followed by the shared working branch `codex/wedding-countdown-access`. Evidence: `personal-harness/firestore.rules`, wedding store/config, provisioning and cloud-verification scripts, maintainer/delivery documentation, rules tests and emulator store-browser harness.

The current production-source rules at that commit hash to `b1c3ca368a37a733b3505214611868866f0d19ccf5d1de66a722e5f642f21c4d`, calculated from raw `git show` bytes. This is source evidence; this reviewer has not inspected the live Firebase release.

## Findings before implementation

1. **Membership existence currently grants read and write access.** Baseline `firestore.rules:13–16` checks only that `members/{email}` exists; records and history use it at lines 62, 74–79 and 86. Adding viewer/blocked documents without replacing all those gates would grant them edit access. Authorization must use current persisted membership, with separate read/edit/admin predicates; legacy `editor` remains a family alias. Self-created registration must never enter the authorization predicate.
2. **Registration must precede private access.** Baseline `store.ts:30` reads the private root before subscribing to membership. A pending account otherwise fails before being registered. Pending and blocked accounts must retain their own membership listener so approval/unblocking can take effect in an open tab. Private/admin collection subscriptions and drafts must clear on role changes.
3. **Verify the protected owner through Auth, not the general user document.** The existing `/users/{uid}` document is writable by any signed-in account (`firestore.rules:8`). It cannot establish the protected owner's email. Verify the fixed owner UID against an authoritative Auth or verified PTI OAuth identity before bootstrap. Protect the canonical owner membership from demotion/deletion in rules as well as UI; UID-based access must remain Admin even if that document is absent.
4. **The existing rule drift baselines are stale for this change.** Baseline `wedding-planner/scripts/rules-baseline.json` still contains `8548e6c`/`3fcfe…`; `personal-functions/provision.mjs:21–32` similarly lacks the current `b1c3…` predecessor. Both deploy paths must approve the exact reviewed current source. Retain rejection of unknown sources and acceptance of concurrent releases containing the exact intended source.
5. **Custom-token checks do not establish a human Google login.** Baseline `verify-cloud.mjs:22–23` signs synthetic accounts in with custom tokens. These are not `google.com` provider sessions. The parent explicitly chose verified-email authorization while offering Google as the website sign-in method. Custom tokens therefore exercise the intended production authorization predicate without a test bypass. Real Google popup behavior remains a separate unverified claim.
6. **Preserve operational data and invitation compatibility.** Baseline `provision.mjs:50–58` correctly leaves an existing workspace intact. Owner bootstrap must be a separate idempotent operation, not a reason to seed/reset records. Existing lowercased-email `editor` invitations, revision checks, immutable history, archived references and consistent exports must keep working.

## Required focused acceptance evidence

- A verified account can create/read/update only its own bounded identity profile. Wrong UID/email, extra `role`/approval fields, changing first-seen identity and unverified registration are denied. Google is the UI sign-in provider; no provider-claim restriction or production test bypass was added. No profile operation grants private access.
- Pending and blocked accounts cannot read root, records, history, member lists or other profiles; viewer reads but cannot write records/history; family edits but cannot assign roles; admin can manage roles. Test direct requests and atomic self-promotion batches.
- Legacy editor remains able to collaborate. The protected owner remains Admin without a member document, and another admin cannot demote, delete or replace the protected owner membership.
- Real store + Auth/Firestore emulators exercise pending→family, family→viewer, admin→family, blocked/revoked and reapproved transitions. Open editors/toasts and admin-only state disappear on loss of permission; pending accounts update without a reload.
- Shared Venture rules regressions pass. Deployment drift guards accept only the reviewed predecessor/exact target; bootstrap leaves all five wedding record collections and existing history untouched.

## Implemented safeguards and review result

No major unresolved authorization defect was found in the inspected parent rules/store diff. The shared broad allowance still excludes `weddingData`. Current persisted member roles drive separate admin/read/edit predicates (`firestore.rules:13–21`); registration has a strict identity-only shape (`68–79`); member changes require an existing admin and protect the immutable root's owner-email key (`81–91`); record/history writes require edit permission (`95–107`). Existing `editor` memberships remain valid.

The store registers before private reads, retains a separate self-membership listener for Pending/Blocked approval and clears role-specific subscriptions/state through `viewEpoch`. An export crossing a role change now checks the captured view epoch; this was identified during this review and fixed by the parent. Rendered draft/toast clearing and complete interactive role transitions remain the parent's browser-test responsibility.

The assigned release scripts now:

- Validate the fixed owner against enabled, verified Firebase Auth identity. The general `/users/{uid}` document is never an identity input.
- Atomically merge only protected `ownerEmail` into an existing root, pin that verified email to Admin, and populate the owner's identity profile. Absent first/last family-login timestamps stay empty until the owner actually enters the family site. Existing timestamps/invitation provenance remain intact.
- Bootstrap before publishing role rules. The five existing planning collections/history are untouched. A changed existing canonical owner email or owner UID stops for explicit migration review.
- Accept the exact `075b1e3` predecessor in both wedding and Personal guards, preserving earlier accepted states, unknown-drift rejection and concurrent-identical-target tolerance.
- Extend the isolated cloud verifier to 64 checks of registration identity, profile isolation, pending/blocked denial, viewer read-only access, legacy editor writes, admin assignment/downgrade, atomic self-promotion denial, protected-owner override/protection, revision checks and immutable history.

## Verification observed

1. `node --check` passed for both edited provisioning scripts and the cloud verifier.
2. The actual cloud-verifier body ran through a local wrapper that replaced configuration with `demo-wedding-security-tests`, explicitly bound both client/Admin SDKs to Auth `9098` and Firestore `8086`, and rejected missing emulator environment variables. **All 64 checks passed**, execution session `94627`, exit 0. Local report: `.wedding-qa/security-role-probe.json`. The wrapper preserved the probe logic and changed only runtime/endpoints/report destination. Emulator accounts/workspace were removed and both emulators stopped. This is emulator evidence, not a live cloud check.
3. The provisioning source ran against synthetic Auth/Firestore/API stubs: verified bootstrap retained existing root fields/record/history; owner profile used empty login times; repeated bootstrap made zero Firestore writes; unverified/disabled identities and unknown predecessor drift stopped before writes; mismatched owner email stopped without a transaction commit. These are self-tests of the assigned script implementation, not live bootstrap evidence.
4. The parent separately reported 13 passing wedding rules tests. This reviewer did not rerun or independently own that suite. Shared sibling regressions and full browser role transitions remain part of parent acceptance.

Local setup limitations were resolved: the system Node 20 invocation could not run the current Firebase CLI; bundled Node 24 ran it. Firebase Admin's optional Firestore dependency was missing locally, so dependencies were installed without changing a package manifest/lock. CI uses its configured Node 22. A temporary isolated Firebase config was removed after verification; ignored QA evidence remains outside the Hosting build.

No live Firebase configuration, production bootstrap/deployment, human Google popup sign-in or real wedding facts are inferred from these synthetic accounts. Before final release acceptance, the parent must run the normal deployment/verification lane and inspect active Viewer/Pending/Admin transitions and draft clearing. No reviewer edits follow this handoff without coordination.
