# Project Operating Model Note

This note defines the intended operating structure for major projects in this ecosystem.

The model has three connected parts:

1. CEO dashboard plus internal freelance Codex agents.
2. Project-wise LLM wiki / business knowledge graph.
3. Task-level input framing through IAC + ADS + ODD.

## 1. CEO Dashboard plus Internal Freelance Codex Agents

The CEO dashboard should act as the control plane for ecosystem execution.

It should not only show project status. It should also show what autonomous Codex agents are building, where they are building it, how each output is reviewed, and which output is selected for merge.

The freelance agents in this model are not external human freelancers. They are internal Codex agent workstreams that behave like independent competing builders.

For a selected requirement, multiple Codex agents can work in parallel, usually up to five agents per work item.

Each agent receives the same requirement packet but may approach it with a different bias, such as:

- safer implementation
- stronger UI/UX
- feature completeness
- minimal clean version
- experimental / wildcard direction

Each agent must work in an isolated branch, sandbox, or preview channel. Agents should not directly modify production or normal dev surfaces.

The intended flow is:

1. Requirement is selected from the project backlog, project wiki, CEO dashboard, or active discussion.
2. A structured work packet is created.
3. Multiple Codex agents independently build solutions.
4. Each agent deploys or exposes its work on a separate preview channel.
5. Reviewer agents evaluate outputs for requirement match, UI/UX quality, security, maintainability, and regression risk.
6. CEO dashboard lists all submissions, preview links, scores, review notes, and merge readiness.
7. Human review selects the best output or identifies parts worth combining.
8. Selected work is merged through the normal repo lane only after approval.
9. Lessons are captured back into the project wiki and future agent instructions.

The dashboard should eventually track:

- active requirements
- assigned Codex agents
- branch / PR / preview channel per agent
- build and test status
- UI/UX score
- security score
- requirement-match score
- reviewer notes
- selected winner
- merge status
- what worked
- what failed
- reusable lessons for future agents

The core purpose is to convert unused Codex / Pro capacity into parallel product exploration and execution, while keeping final merge authority controlled.

The rule is:

- Random or automated requirement discovery is allowed.
- Random implementation access is not allowed.

Every agent must receive a sealed work packet with repo, branch, allowed scope, forbidden scope, output expectation, and review criteria.

## 2. Project-wise LLM Wiki / Business Knowledge Graph

Every major project should maintain a standalone business/product wiki.

The wiki should capture the non-technical thinking that future humans and agents need before building.

It should include:

- original intent
- user problems
- business requirements
- product logic
- feature ideas
- competitor or market examples
- assumptions
- decisions
- open questions
- user journeys
- pain points
- possible solution paths
- discussion notes
- future task ideas

The wiki should exclude implementation details such as:

- code structure
- APIs
- database schema
- deployment internals
- test internals
- build pipeline details
- low-level architecture decisions

Use this split:

- Project wiki: why, what, product logic, users, business context, decisions, assumptions, open questions.
- Technical docs: how, code, architecture, APIs, database, deployment, testing.

Brainstorming should happen around the wiki so useful thoughts become linked notes instead of getting lost in chats.

The wiki should behave like a small Wikipedia-style knowledge graph, with links between intent, problems, features, examples, decisions, and future tasks.

For detailed wiki setup, raw-note handling, Wikipedia-style linking rules, and curator-skill behaviour, see `LLM_WIKI_SETUP_AND_CURATION_PROTOCOL.md`.

The project wiki becomes the context base used by humans, ChatGPT, Codex, Claude, Gemini, or any other build/review agent.

Before a Codex agent builds, it should be able to understand the project wiki context relevant to the requirement.

After an agent competition finishes, the wiki should be updated with:

- winning approach
- rejected approaches
- useful ideas from non-winning outputs
- implementation-independent product lessons
- user-facing decisions
- future follow-up questions

## 3. IAC + ADS + ODD

Every meaningful task given to an LLM, Codex agent, or review agent should be framed using three input factors.

### IAC: Impact Area Context

IAC defines where the work is meant to create impact.

It should identify the affected product, user, workflow, business area, or dashboard surface.

Examples:

- PTI CEO dashboard agent-review section
- GTOP student quiz attempt flow
- Orynth study tracking dashboard
- Aesthetic India approval UI
- Growth Tutorials admin workflow

IAC prevents the agent from solving the wrong problem or optimizing the wrong surface.

### ADS: Autonomous Discovery Scope

ADS defines what the agent is allowed or expected to inspect, infer, discover, or compare on its own.

It should clarify the boundaries of exploration.

Examples:

- inspect existing dashboard components before proposing UI changes
- review current project wiki pages before creating a requirement packet
- compare existing feature flow with user pain points
- explore only frontend components, not Firebase config or auth
- identify possible UI improvements but do not alter production data logic

ADS prevents both under-exploration and unsafe overreach.

### ODD: Output Delivery Direction

ODD defines what final output is expected and where it should land.

It should define the output shape, quality bar, and delivery path.

Examples:

- create a mock dashboard section only, no real automation
- open a draft PR with isolated changes
- deploy to an agent-specific preview channel
- produce reviewer notes and score table
- update the project wiki with business-side learnings only

ODD prevents near-miss outputs by making the final delivery expectation explicit.

## Combined Usage

The strongest operating pattern is:

1. Project wiki provides persistent project context.
2. IAC defines the exact impact area for the current task.
3. ADS defines what the agent may discover and how far it may go.
4. ODD defines the final output shape and delivery path.
5. CEO dashboard tracks the execution state.
6. Multiple internal Codex agents build isolated alternatives.
7. Reviewer agents score the outputs.
8. Human selection decides what moves forward.
9. Project wiki captures reusable product and business learnings.

This creates a loop:

Project wiki -> requirement packet -> Codex agent competition -> preview outputs -> review and selection -> merge decision -> lessons back into wiki.

The goal is to move from manual prompting and repeated first-cut refinement toward a self-improving execution system.

The human role should shift from manually driving every build step to setting direction, reviewing finalists, making judgment calls, and improving the system over time.
