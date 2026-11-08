# Local Codex: complete inspected limits and dependencies

Audit date: 8 November 2026. Scope: installed Windows configuration, worker/relay source, hosted Local Codex admission and protocol source, plugin guidance, relevant desktop configuration, and actual native-chat/browser operation. This is a control inventory, not a claim that every failure condition was deliberately triggered.

## Confirmed working and changes delivered

- Existing native chat `01a1b6f2-9121-7412-b874-370f30fe57da` completed bridge generation 5, then ran through the desktop app in turn `01a1b9f4-c353-7e72-88ff-9d6446c8dac2`. The official Chrome tool operated the authenticated Taleweald tab, clicked Supervisors and Milestones, and saved a screenshot. No replacement chat or PTI Chrome consent was needed.
- Real screenshot, also inspected by the supervising chat: `F:/Workspace/Codex/2026-11-08/local-codex-repair/outputs/existing-chat-official-chrome.jpg`. Milestones showed 8 total, 4 in motion/review, 0 blocked and 0 owner accepted. These are page observations, not gameplay or owner acceptance.
- Worker 0.4.10 fixed persisted instructions which incorrectly carried standalone browser prohibitions into desktop continuations. Final worker 0.4.11 also removes the remaining preemptive tool prohibition based on missing environment metadata. Actual official tool permission checks now decide access.
- PTI Owner Chrome's active pointer and Native Messaging registration are disabled. New worker jobs receive no `pti_chrome` MCP injection. Existing extension/release files and historical evidence are preserved; the Chrome extension itself remains installed. It is not a prerequisite for normal browser control.
- Plugin 0.4.12 uses the existing desktop-owned chat for browser work and treats the QA broker and PTI Chrome provider as optional. No new model provider or API key was added.
- Removed the stop caused solely by a model-catalog upgrade recommendation. The selected model/effort must still actually be available and must not be silently replaced.
- Fixed the detached updater's inherited PowerShell module-path mismatch using only its own built-in modules and process environment.
- Added the actual Taleweald repository to the installed project catalog. Existing Ragnarok mappings and historical tasks were preserved.

Final activation: worker **0.4.11**, source `3b8a2ed`, installed through the detached owner updater. The receipt verified all seven files, fresh hosted/local heartbeats, connected listener and no maintenance fence left. Receipt: `F:/Workspace/Support/LocalCodexBridge/maintenance/0.4.11-release-3b8a2ed/result.json`. Live catalog readback confirmed all 9 configured projects available. An actual no-model Codex catalog request also verified the configured model/effort after release. No synthetic suites were run.

## Model execution and external services

Model execution uses the installed official Codex executable and the owner's ChatGPT subscription sign-in. Live `codex login status`, the completed bridge turn, and desktop continuation support this. The inspected runtime reports `codex-cli 0.166.0-alpha.5.1`, model `gpt-6.1-sol`, effort `xhigh`.

`subscriptionEnvironment()` removes API-key/custom-endpoint overrides from the child environment; task startup requires `account.type === chatgpt` and provider `openai`. No alternate LLM service is called by the bridge. This deliberately enforces the owner's Codex-only requirement.

The web/mobile connector still uses the existing PTI HTTPS/Firestore/Firebase Authentication infrastructure for job delivery, authentication, status and stored results. Those are network APIs, not additional AI-model APIs. Its Firebase public application key is not an OpenAI API key. Native desktop execution can use the app directly; describing the entire remote relay as having no external APIs would be inaccurate.

Sources: `src/common.mjs`, `src/worker.mjs`, `src/credentials.mjs`, `src/relay.mjs`, `../pti-mcp/src/http-app.ts`.

## Execution, permissions and ownership

| Control | Current effect | Origin / disposition |
|---|---|---|
| Concurrent bridge tasks | `maxConcurrentTasks: null`; no bridge task-count ceiling | Earlier 1/3 limits are inactive. Legacy compatibility code applies only to older workers. |
| Subagent count | `maxSubagentsPerTask: null`; no bridge count ceiling | Earlier 2-child limit inactive. No invented replacement native cap. |
| Task duration | `maxTaskMinutes: null`; no total bridge execution deadline | Earlier 30-minute default inactive. Individual network/protocol timeouts below still exist. |
| Nesting | No bridge-imposed nesting ceiling | Native Codex/account constraints still apply. |
| Strategy `single` | Disables subagents for that task | Explicit strategy, not a global limit. `auto` and `team` use native subagents. |
| Model and reasoning | Exact configured model/effort required for parent and descendants; a real mismatch stops the task | Owner-selected policy. A newer-model recommendation alone no longer stops work. No fallback to another provider. |
| Inspect/edit modes | Inspect is read-only; edit is Full Access; both use approval `never` | Current authorization boundary. A continuation cannot change its project or broaden inspect to edit. A new task record can reuse the same module chat. |
| Project catalog | Only configured, existing physical F-drive project keys are accepted | Bridge routing allowlist plus owner F-drive rule. Now 9 entries including Taleweald. Hosted heartbeat schema still permits at most 30 entries. |
| Repository concurrency | An edit locks the whole physical Git checkout against other bridge readers/writers; independent reads can coexist | Bridge-added conservative coordination, coarser than file-level locking. Different module names do not bypass it. Parent subagents can divide files inside one task. |
| Native chat writer | One active writer per chat; unfinished turns and desktop-held writers cannot be taken over | Native Codex ownership plus bridge checks. A completed turn can still be loaded by the desktop. Use its owning app; do not delete locks. |
| Module identity | One active parent per physical project/module; distinct related outcomes reuse it | Owner reuse requirement. No automatic age/turn/token-based rotation. Missing/archived/incompatible automatic selections can rotate; explicit selections do not silently change. |
| Request identity | A request/work key cannot be reused for different inputs or source identity | Duplicate-execution protection, not a work limit. |
| Recursive relay calls | Workers cannot submit back into their own relay | Bridge policy prevents recursive jobs. Native subagents remain available. |
| Maintenance | New admissions pause while existing jobs drain and the seven-file release is verified | Integrity/ownership safeguard. Finite maintenance deadline does not limit model work. Failure rolls back or retains a recovery fence. |
| Interactive requests | Worker handles command/file approvals and user-input questions; other native interactive request types are rejected | Wrapper capability gap, not a Codex prohibition. Normal edit work uses approval `never`. Genuine decisions must still come from the owner. |
| Account and local listener | Owner-only relay; one relay process for this installation | Authentication and duplicate-listener protection. Not a limit on independent task count or ChatGPT connections. |

Sources: `src/limits.mjs`, `src/harness-policy.mjs`, `src/model-policy.mjs`, `src/execution-policy.mjs`, `src/workspace-locks.mjs`, `src/chat-routing.mjs`, `src/worker.mjs`, `../pti-mcp/src/local-codex-admission.ts`, `../pti-mcp/src/local-codex-affinity.ts`.

## Connection, timeout and recovery behavior

| Limit | Exact behavior | Practical consequence |
|---|---|---|
| Heartbeat freshness | Hosted worker is offline after 60 seconds without a fresh heartbeat | New work is rejected rather than silently queued while the PC is unavailable. |
| Unclaimed request | Expires after 120 seconds | Limits dispatch waiting, not execution duration. |
| Active lease | 90 seconds, renewed while connected | Lost generation/lease cannot keep reporting as current. |
| Connection-loss interruption | Local relay requests cancellation after more than 45 seconds without a successful relay request | This is a bridge-added operational restriction, not a Codex limit. Protects unattended work when coordination/control is lost; can interrupt otherwise healthy local work during an outage. Retained explicitly in this audit. |
| Network request | Relay HTTP 20 seconds; Firebase token refresh 15 seconds | Request failure/retry does not itself impose a total task-duration ceiling. |
| Retry delay | Exponential 1 second up to 30 seconds | Transport recovery, not extra model inference. |
| Health cadence | Normally 30 seconds; quiet connected idle state 40 seconds | Uses listeners for dispatch, not periodic empty job queries. |
| Native protocol response | Worker RPC 60 seconds; history RPC 20 seconds | Can fail startup/history if the app-server does not respond; not a model-turn duration cap. |
| Result wait | Hosted `get_task`: 0–50 seconds, default 20; internal local endpoint: 0–20, default 0 | One wait call returns; the underlying task continues. |
| Local startup view | Queued worker older than 60 seconds with no live PID is reported interrupted | Diagnoses failure to launch. |
| Local file operations | Atomic write retries up to about 1 second; workspace admission tickets wait about 1 second | Bounded contention recovery, not a user-visible task budget. |

Sources: `src/relay.mjs`, `src/credentials.mjs`, `src/worker.mjs`, `src/codex-history.mjs`, `src/common.mjs`, `src/workspace-locks.mjs`, `../pti-mcp/src/local-codex.ts`.

## Message, history and reporting limits

These are wrapper transport/storage bounds. They do not reduce the underlying native chat's context window or delete its transcript.

| Surface | Current bound |
|---|---|
| Submitted prompt / continuation | 24,000 characters |
| Task title / default title | 100 characters / first 80 characters if no title is supplied; plugin requires short module titles |
| Request and work keys / module key | Request/work key 8–128 characters; module key 1–128 in its permitted identifier alphabet |
| Rotation handoff / history query / cursor | 4,000 / 200 / 4,000 characters |
| Final or agent message | 48,000 characters; excess is truncated by worker collection |
| Collected recent agent messages | Last 30 locally; last 10 sent in each relay snapshot |
| Error text | 2,000 characters |
| Recent task discovery | Hosted storage reads the latest 100 tasks before filtering; tool returns at most 30 matches and a 1,000-character final preview. Durable module catalog is separate and not limited to this recent window. |
| Native thread listing / reading | List at most 20 per page; read at most 10 turns per hosted call; pagination supported |
| History message export | 4,000 characters per message; 16,000 total text budget; tool outputs and attachments omitted; truncation signaled. Serialized history result at most 24,000 characters. Use app-native history when richer detail is needed. |
| Local run summaries / owner outcomes | Last 50 run summaries per local task and last 50 explicit owner outcome records in hosted summary arrays; native transcript retained |
| Usage review | 1–90 day window; reads up to 5,000 most recently modified local task directories; remote IDs fetched in batches of 100 without a total requested-ID cap |
| Usage attribution | Latest reported response counters, not complete generation/account billing. Missing child/legacy metadata remains unknown. |
| HTTP request bodies | Connector 256 KiB; worker 768 KiB; MCP SDK protocol validation includes a 100-message batch bound |
| Project metadata | Up to 30 projects; path 2,048 characters; name 100; project key 64 |
| Catalog enumeration | Up to 20 model-list pages of 100 entries to find the exact selected model |

Sources: `src/server.mjs`, `src/worker.mjs`, `src/codex-history.mjs`, `src/telemetry.mjs`, `src/review-usage.mjs`, `../pti-mcp/src/local-codex.ts`, `../pti-mcp/src/http-app.ts`.

## Browser and desktop boundaries

The bridge launches an official standalone Codex app-server. The desktop app supplies its own tools and authorization to app-owned continuations. These are execution contexts, not different permanent kinds of chat: the same native chat successfully ran in both this audit. The supported app continuation tool was used; no browser identity, pipe, consent record or credential was copied.

Missing environment metadata no longer instructs the worker to skip an available official browser tool. Actual tool denials, URL checks and account permissions remain binding. Hosted `requires_handoff` telemetry describes the relay's own session capability; it must not be treated as a denial for every desktop chat. The relay itself still has no automatic app-owned-session launcher; the current desktop app's supported continuation tool supplies that route.

Windows native screenshot capture separately returned a capture timeout on this machine. Official Chrome screenshots and interactions worked. The repair avoids that failing native capture path for browser work; it does not claim the native Windows capture engine itself was fixed. Gameplay, audio capture/perception and physical-mobile interaction were not verified by this browser-navigation check.

## Optional features outside the default browser path

| Component | Restrictions retained in its optional implementation |
|---|---|
| Interactive QA broker | Recordkeeping only; no session launcher. One foreground reservation, 90-second lease, default 24-hour request expiry. Explicit idle release, operator attestations, and exact run identity. HTTPS or loopback HTTP without credentials/query/fragment; up to 30 objectives, observations and artifacts; up to 50 listed requests. These are not prerequisites for ordinary official Chrome control. |
| PTI Owner Chrome | Disabled. If explicitly restored: only `http://localhost:4173` and `https://taleweald.firebaseapp.com`; exact task/PID/generation/tab/site owner consent; foreground-only; 5/15/30-minute owner grants; no arbitrary JavaScript, cookies, browser/OS shortcuts or audio capture. MCP command wait 31 seconds; Native Messaging frame maximum 8,000,000 bytes; coordinates 0–10,000; text 1,000 characters; objectives 1,500; up to 5 touch points; viewport 240–2560 by 240–1600. None apply to the successful official Chrome route. |
| Legacy local plugin | Disabled in global config; outdated polling/capability guidance is inactive. Current published plugin is 0.4.13. |

Sources: `../pti-mcp/src/local-codex-interactive.ts`, `chrome/mcp.mjs`, `chrome/runtime.mjs`, `chrome/native-host.mjs`, global Codex config.

## Chat organization and remaining practical limits

The durable module catalog now exposes existing exact module keys/current native parents instead of relying on the recent task window. Prior work renamed 45 chats and arranged 50 in five project sidebar sections; two actual project-membership moves were verified. Other requested project moves were refused by the app because their source project could not be safely determined. Sidebar grouping is not the same as project membership; no app database was edited to manufacture it.

Some already-loaded historical chats can still retain the old developer instructions until refreshed through their normal owner/runtime. The verified same-chat continuation was refreshed correctly. New bridge turns receive the installed policy; a writer-held historical chat must not be force-taken-over merely to update its history. No claim is made that every dormant historical chat was individually exercised.

Retained rules above are now visible and attributable. The bridge adds no active task/subagent/nesting/duration ceiling, no additional model API, no mandatory PTI Chrome grant, and no blanket prohibition against a bridge-origin chat running through the desktop app. Native Codex usage/context/capability limits remain platform-managed; this audit does not invent or promise their numeric limits.


## Hosted-report correction after the mobile chat discrepancy

The existing ChatGPT chat `Resume T03 production leadership` read hosted 0.4.7 flags and the bridge-only generation result, then reported direct Chrome was not activated. The flags were fixed relay values, not an observation of that chat or the PC's app-owned browser. Its Co-Director native chat still had an older 0.4.8-era turn, separate from the verified browser-repair chat.

Hosted 0.4.8 labels capability scope at both report and capability level, explicitly marks the caller session unobserved, removes mandatory manual-consent/QA wording, and labels task results as bridge-generation-only. Plugin 0.4.13 instructs callers to inspect actual tool inventory and latest native history before drawing conclusions. Existing false authorization flags remain truthful for the relay; no authorization is fabricated.

Deployment run `42458671130` completed successfully for commit `eea1952`. Live `bridge_status` returned host 0.4.8, worker 0.4.11 online, the explicit relay scope and caller-session unknown values. Live `get_task` returned the new bridge-generation scope and native-history notice. The same relay history tool available to the mobile chat retrieved the later successful desktop turn without creating a chat or model run.

The successful earlier browser verification was initiated by the desktop app. This does not prove that an ordinary mobile plugin chat exposes `send_message_to_thread` or can initiate that same route. Publishing a plugin does not add a missing app-native activation API. Automatic mobile-origin activation remains unverified/unimplemented by this relay; current desktop control is verified. No extra model API, new native chat, game change or simulated browser result is introduced by this correction.
