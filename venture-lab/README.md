# Venture Studio

A shared discovery workspace for Sachit, Shalini and research agents. Production: https://pti-app-2ab59-venture.web.app/

## Working flow

1. Sign in with Google and start a discussion. Original thoughts and voice clips remain attached to their author; add a correction as a new contribution.
2. Explore multiple directions from a thought or an existing direction. Describe the hypothesis before filling optional comparison details.
3. Queue focused research or outside discovery. A queue entry is a request, not immediate AI execution. The existing Venture Discovery Run processes it and publishes attributed findings with sources and contrary evidence. The run also develops meaningful new discussion contributions and experiment results, so a manual queue action is optional.
4. Compare the same criteria, then shortlist, park, reject or reopen with a reason. Decisions are preserved; the agent does not choose on the humans' behalf.
5. Define an experiment's hypothesis, method and success criterion. Completing it requires an observed result and learning. The next research run reads these results.

Existing discoveries, patterns, opportunities and runs remain under Outside discovery. Rejected records retain their status. Income estimates are assumptions, not proven earnings.

## Sharing and local state

The owner adds a collaborator's verified Google email under People & access, then shares the workspace link. Adding access sends no email. The collaborator signs in with that account. A link selects a workspace but grants no permission. The last successfully opened workspace is remembered separately for each account, including installed-app launches.

Firestore is the shared source of truth at `users/{ownerUid}/ventureData/workspace`. Only the owner manages membership. Draft text is retained on the device; saving requires a connection. Voice clips are limited to 60 seconds and approximately 440 KB before encoding, with accompanying text supplied by the contributor. Recording/playback depends on browser support and microphone permission; no automatic transcript is implied.

The service worker clears old Venture caches and does not cache private data. Versioned script/style URLs and revalidation prevent stale releases. `?demo=1` is a clearly labeled invented workspace whose changes stay in memory and never reach Firebase.

## Agent interface

Read [AGENT.md](AGENT.md) before research. Hosted PTI MCP provides `venture_context`, `venture_claim_research` and `venture_publish_research`; generic owner-scoped Firestore tools remain available for proposed directions and outside discoveries. Claims expire after 45 minutes. Publication appends findings atomically and is idempotent for a claim. Hosted agent access remains restricted to the authenticated owner's namespace.

## Verification and release

- Model/store workflow: `node --test venture-lab/tests/model.test.mjs venture-lab/tests/store.test.mjs`
- Shared-access rules: install `venture-lab/tests` dependencies, use Java 21, then `npx firebase-tools emulators:exec --only firestore --project demo-venture-tests --config firebase.venture-tests.json 'npm test --prefix venture-lab/tests'`
- Agent tools: `npm test --prefix tools/pti-mcp` and `npm run build --prefix tools/pti-mcp`
- Rendered design evidence: [design/STUDIO_REVIEW.md](design/STUDIO_REVIEW.md). Phone-width iframe review is responsive CSS evidence, not a real-device keyboard or microphone test.

The main Firebase workflow gates the Venture release on rule tests and provisioned rules, then compares deployed assets. The hosted MCP workflow separately verifies an authenticated live context read and tool registration. Temporary preview channels expire after seven days; the preview branch is removed after an identical tree is successfully released.
