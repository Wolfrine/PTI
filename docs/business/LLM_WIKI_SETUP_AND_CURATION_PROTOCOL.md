# LLM Wiki Setup and Curation Protocol

## Purpose

This protocol defines how project-wise LLM wikis should be created, maintained, and curated.

The goal is to create a business/product knowledge graph for each serious project. The wiki should help humans think clearly, help LLMs debate with context, and help build/review agents understand what should be developed and why.

This is not a technical implementation document. It is a knowledge-structure and curation protocol.

## Core principle

The wiki is the project thinking substrate.

Normal brainstorming should happen around the wiki so useful thoughts, user problems, feature ideas, competitor examples, assumptions, debates, and decisions become persistent linked knowledge.

The wiki should behave like a compact Wikipedia-style knowledge graph, not like a random folder of notes.

## Recommended folder structure

Each project should have a local structure similar to this:

```txt
project-root/
  wiki/
    Home.md
    Intent.md
    Problems/
    Features/
    Users/
    Market/
    Competitors/
    Decisions/
    OpenQuestions/
    Concepts/
  raw/
    2026-05-31-chatgpt-summary.md
    2026-06-01-codex-output-summary.md
  skills/
    wiki-curator/
      SKILL.md
  codex/
    WIKI_SETUP_RULES.md
```

The exact folder names can evolve, but the separation must remain:

- `wiki/` contains refined, linked business/product knowledge.
- `raw/` contains append-only source material from chats, discussions, agent outputs, and summaries.
- `skills/wiki-curator/` contains the reusable rules for transforming raw notes into wiki updates.
- `codex/` or root-level instructions contain project-local setup guidance.

## Wiki content scope

The wiki should contain business and product knowledge only.

Allowed content:

- original intent
- user problems
- business requirements
- product logic
- user journeys
- real-life pain points
- feature ideas
- possible solution paths
- competitor patterns
- market examples
- assumptions
- constraints
- debates
- decisions and rationale
- open questions
- future possibilities
- lessons from reviews
- implementation-independent learnings from agent outputs

Excluded content:

- code structure
- API details
- database schema
- deployment internals
- build pipeline details
- test implementation details
- framework-specific architecture
- commit-level implementation logs
- low-level technical task lists

Simple rule:

- Wiki = why, what, product/business logic, user problems, market context, decisions.
- Technical docs = how, code, architecture, APIs, database, deployment, testing.

## Raw folder protocol

The `raw/` folder is the source-material layer.

### Raw input source rule

Raw notes do not need to come only from Codex.

Any useful human or LLM discussion can produce raw notes, including ChatGPT, Claude, Gemini, Codex, direct user notes, review sessions, and product discussions.

The raw layer is the capture layer. The wiki-curator skill is the refinement layer.

The intended flow is:
Any LLM / human discussion -> raw note -> Codex wiki-curator skill -> existing wiki pages updated, merged, and inline-linked.

Codex should not be treated as the only source of project knowledge. Its stronger role is to apply the wiki-curator skill, preserve structure, update existing pages first, create new pages only for durable concepts, and maintain Wikipedia-style inline links.

It should store summaries and extracts from:

- ChatGPT discussions
- Codex outputs
- Claude or Gemini discussions
- user notes
- review sessions
- competitive research notes
- product observations
- CEO dashboard review outcomes

Raw notes should be append-only by default. Do not over-clean them.

A raw note should usually contain:

```md
# Raw Note - YYYY-MM-DD - Short Topic

## Source

ChatGPT discussion / Codex output / user note / review session.

## Context

Why this discussion happened.

## Key points

- Point 1
- Point 2
- Point 3

## Decisions, if any

- Decision 1

## Open questions

- Question 1

## Suggested wiki integration

- Existing page to update
- New page only if required
```

The raw note should not be treated as the final wiki. It is source material for the wiki-curator skill.

## Wiki page creation rules

The wiki-curator must prefer updating existing pages before creating new pages.

Create a new page only when the concept is durable and likely to recur.

Good reasons to create a page:

- a recurring user problem
- a stable product concept
- a major feature area
- a competitor pattern worth referencing later
- a business decision requiring rationale
- a persistent open question
- a reusable market or user insight

Bad reasons to create a page:

- one temporary thought
- one small task
- one agent output
- one phrasing variation of an existing concept
- a duplicate of an existing page
- a technical implementation detail

Before creating a page, the curator should ask:

1. Does an existing page already cover this?
2. Can this be merged into an existing page as a section?
3. Is this concept important enough to be linked from multiple future pages?
4. Is this business/product knowledge rather than technical implementation?

## Wikipedia-style linking rules

Links should be embedded naturally inside sentences.

Bad pattern:

```md
Related links:
- [[User Problems]]
- [[Feature Ideas]]
- [[Competitor Analysis]]
```

Better pattern:

```md
Users face [[thought capture friction]] when tools force [[manual categorization]] before the thought has become clear.
```

Core rule:

Do not dump links at the top or bottom of ordinary pages. Use inline links on meaningful words or phrases.

Allowed exceptions:

- `Home.md`
- index pages
- navigation pages
- deliberate map pages

Even on those pages, links should be grouped by meaning, not dumped randomly.

## Link quality rules

A good wiki link should point to a durable concept.

Good link targets:

- `[[original intent]]`
- `[[thought capture friction]]`
- `[[manual categorization]]`
- `[[CEO dashboard]]`
- `[[agent review workflow]]`
- `[[competitor pattern]]`
- `[[open questions]]`

Weak link targets:

- `[[this]]`
- `[[thing]]`
- `[[update]]`
- `[[random idea from today]]`
- `[[task 3]]`

Links should improve traversal. If clicking the link would not help future reasoning, do not link it.

## Page structure

A normal wiki page should be concise and structured.

Suggested page template:

```md
# Page Title

## Summary

Short explanation of the concept.

## Why it matters

How this affects the project, users, business, or product direction.

## Current understanding

What is currently believed or observed.

## Related problems or features

Use inline links in sentences instead of a raw dump.

## Decisions

Only decisions relevant to this concept.

## Open questions

Questions that still need exploration.

## Source notes

References to raw notes that contributed to this page.
```

Do not force every page to include every section. Keep pages useful and readable.

## Home page protocol

`Home.md` is the project map.

It should answer:

- What is this project?
- What is the original intent?
- What are the main problem areas?
- What are the main feature areas?
- What decisions matter most?
- What open questions remain?

`Home.md` should link to the highest-value pages only.

It should not become a dumping ground for every page.

## Raw-to-wiki workflow

When new raw material is added:

1. Read the raw note fully.
2. Identify the durable concepts.
3. Search existing wiki pages for matching concepts.
4. Update existing pages first.
5. Create new pages only when required.
6. Add inline links inside natural sentences.
7. Add source references back to the raw note.
8. Update `Home.md` only if the project map materially changes.
9. Record what changed in a short curation log or commit message.

The wiki-curator should never convert every bullet from raw into separate pages.

## Curation skill contract

The `wiki-curator` skill should follow these rules:

1. Treat raw notes as source material, not final output.
2. Preserve the original intent and uncertainty.
3. Prefer merging into existing pages over creating new pages.
4. Use inline Wikipedia-style links.
5. Avoid top/bottom related-link dumps except on index pages.
6. Keep technical implementation details out of the wiki.
7. Preserve debates, tradeoffs, and competing hypotheses where useful.
8. Mark decisions clearly and separately from observations.
9. Keep source references to raw notes.
10. Avoid creating many small low-value pages.
11. Maintain the project map lightly.
12. Do not overwrite human direction with agent assumptions.

## Anti-patterns to avoid

### Anti-pattern 1: Link dumping

Wrong:

```md
Related:
- [[Users]]
- [[Problems]]
- [[Features]]
```

Correct:

```md
The main [[user problem]] is that people lose valuable thoughts before they can convert them into [[structured product ideas]].
```

### Anti-pattern 2: Too many pages

Wrong:

```txt
2026-05-31-idea-1.md
2026-05-31-idea-2.md
2026-05-31-idea-3.md
```

Correct:

```txt
raw/2026-05-31-chatgpt-summary.md
wiki/Concepts/Thought Capture Friction.md
wiki/Features/Radial Emotion Input.md
```

### Anti-pattern 3: Mixing technical implementation into wiki

Wrong:

```md
The dashboard should use Angular Material components and Firestore collection X.
```

Correct:

```md
The dashboard should help the user compare competing agent outputs before choosing what moves forward.
```

### Anti-pattern 4: Rewriting uncertainty as certainty

Wrong:

```md
Users definitely need gamification.
```

Correct:

```md
One hypothesis is that [[lightweight progress feedback]] may help users return to the product, but this needs validation.
```

## Central rules vs project rules

There should be two layers of governance.

Central rules:

- universal wiki philosophy
- folder conventions
- linking rules
- raw-to-wiki workflow
- curation skill behaviour
- anti-patterns

Project rules:

- project-specific intent
- project-specific user problems
- project-specific scope boundaries
- project-specific terminology
- project-specific decisions

Recommended locations:

```txt
central-codex-or-root/
  WIKI_GLOBAL_RULES.md
  skills/wiki-curator/SKILL.md

project-root/
  wiki/
  raw/
  codex/WIKI_PROJECT_RULES.md
```

PTI docs can act as a backup/cloud-common reference for the protocol.

## Role split

ChatGPT:

- discussion
- reflection
- context extraction
- raw summaries
- synthesis from broader user context

Codex:

- creates project folders
- creates base wiki structure
- applies repo-local rules
- runs wiki-curator skill
- updates wiki files from raw notes

Wiki-curator skill:

- converts raw notes into linked wiki updates
- maintains page quality
- prevents doc explosion
- enforces inline linking

CEO dashboard / coordination layer:

- shows which projects have wiki setup
- shows which raw notes are not yet curated
- shows which projects have missing intent/problem/decision pages
- shows agent outputs requiring review
- tracks what learnings need to go back into the wiki

Human user:

- sets direction
- resolves judgment calls
- approves major decisions
- corrects wrong framing
- decides what moves forward

## Minimum viable wiki setup

For a new project, start with this minimum:

```txt
wiki/
  Home.md
  Intent.md
  Problems.md
  Features.md
  Decisions.md
  OpenQuestions.md
raw/
  README.md
skills/wiki-curator/
  SKILL.md
```

Do not overbuild the wiki structure before the project has enough material.

The structure should grow from real thinking, not from empty folders.

## Quality checklist

A wiki update is good if:

- it uses existing pages where possible
- it creates few but meaningful new pages
- it has inline links inside natural sentences
- it separates observations, interpretations, decisions, and open questions
- it avoids technical implementation details
- it points back to raw source notes
- it improves future human discussion
- it improves future agent understanding

A wiki update is weak if:

- it creates many tiny pages
- it adds link lists at the bottom of every page
- it duplicates existing content
- it converts guesses into facts
- it mixes code/architecture into business wiki pages
- it loses the original thought or context
- it makes the wiki harder to navigate

## Final operating loop

The intended loop is:

```txt
Discussion -> raw note -> wiki curation -> linked knowledge graph -> better next discussion -> better requirement packet -> better agent output -> review lessons -> wiki update
```

The compounding value comes from keeping this loop alive.

The wiki is not only a storage layer. It is the project cognition layer.
