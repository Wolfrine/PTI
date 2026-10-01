# Venture Studio contract

Goal: Sachit and Shalini discuss possibilities, retain their own words, explore branching directions, and use agent research to compare and run the best next experiment. Initial goal remains steady ₹10–20k/month, then larger ventures. Sector is discovered; budget/time are not early filters.

Quality: L3 distinctive craft with L2 working efficiency. Two materially different art directions before implementation; use the five Central references staged by the parent. Designer and independent critic required, minimum five substantive rounds; parent checks after rounds 3/5 and final. Random stronger designer round selected: 2. Critic and parent each >=8/10, no material defects. Do not claim predicted emotional reactions as measured.

Assigned: designer = venture_designer (GPT-6.1 Sol), independent critic = venture_critic. Parent owns data adapter, security, MCP and deployment; designer owns index.html/app.js/styles.css/icon/manifest/sw. Do not edit another owner's files without coordinating.

Journey: Discussion -> branches -> sourced research (including challenges) -> side-by-side comparison -> reasoned decision -> experiment -> result fed back. Separate outside discovery continues. Present three entry priorities: resume discussion, what changed, next decision. Public sample uses invented examples clearly labeled; never publish private live content in fixtures/review assets.

Preserve existing discoveries/patterns/opportunities/runs. Existing rejected opportunity stays rejected. No fabricated discussions or attributions. Shared membership via verified Google email; only owner manages access. No automatic external invitations/messages. Shared link selects owner's Venture workspace; does not grant access. Research queue honestly says queued; no pretend active agent spinner or generated fake results.

Voice recording should preserve a short original audio clip with editable accompanying text; show unsupported/permission states clearly. No automatically started recording.

Visual relationships encode actual source/parent relations. Motion communicates branch creation, evidence attachment or selection. Mobile has focused thread/direction, not a shrunken canvas. Sources adjacent to claims. Monetary projections are estimates with assumptions, not proven income.

## Frontend data adapter (parent creates data.js)

`createVentureStore(onChange)` returns `{state, signIn(), signOut(), createThread(input), updateThread(id,input), addMessage(input), createBranch(input), updateBranch(id,input), requestResearch(input), addFinding(input), recordDecision(input), createExperiment(input), updateExperiment(id,input), addSignal(input), setLegacyStatus(collection,id,status,reason), inviteMember(email,name), removeMember(email), switchWorkspace(ownerUid), refresh()}`. All mutation methods async and reject actionable errors. `onChange(state)` receives new state; preserve unsaved forms across background changes.

state = `{user:{uid,displayName,email}|null, ownerUid, isOwner, loading, error, offline, demo, workspace, members:[], threads:[], messages:[], branches:[], researchTasks:[], findings:[], decisions:[], experiments:[], discoveries:[], patterns:[], opportunities:[], runs:[]}`. Each record id/createdAt/updatedAt; timestamps normalized ISO; author's uid/name stored as createdBy/authorName, user cannot impersonate co-owner.

Schema:
- threads: title, summary, status active|parked|closed, sourceOpportunityId optional. createThread {title,summary?,text?,sourceOpportunityId?}. Initial text becomes original message separately.
- messages: threadId, branchId optional, text, sourceUrl optional, kind thought|question|link|summary, audioData optional data URL <=600000 chars, audioDuration seconds <=60; original messages immutable. Add a correction as a new message.
- branches: threadId, parentId optional, sourceMessageId optional, title, hypothesis, customer, offer, assumptions, openQuestions, status exploring|shortlisted|parked|rejected|testing; comparison fields demand, access, repeatability, economics, effort, automation, uncertainty (all plain text). updateBranch keeps title/fields only; status via decision.
- researchTasks: threadId optional, branchId optional, question, scope focused|open, status queued|running|completed|blocked, resultSummary optional. UI queues. Agents publish findings and completion.
- findings: threadId optional, branchId optional, title, summary, stance supports|challenges|neutral, sourceUrl optional, sourceTitle optional, evidenceType fact|reported|inference|question; optional taskId. Distinguish human notes vs agent author.
- decisions: threadId, branchId, outcome shortlisted|parked|rejected|reopened, reason (required), revisitWhen optional; append-only and status change atomic.
- experiments: threadId, branchId, title, hypothesis, method, successCriterion, status planned|running|completed|stopped, result, learning, nextStep; outcome capture does not silently alter branch status.
- members: email, name, role editor, invitedAt. Owner implicit. Only owner can manage members. Display share link returned from inviteMember; never send email automatically.

Demo: `?demo=1` creates clearly marked isolated sample state; demo writes stay in memory only and never reach Firebase. Parent supplies sample data so all UI routes can be tested with no sign-in. Default signed-out screen offers Google login and sample tour.

Links: validate HTTP(S) only. Escape all stored text. Handle empty/loading/partial failures without substituting sample data for private data. Offline draft retained locally; no claim of cloud save before acknowledgment. Avoid full rerender of active input on snapshots.
