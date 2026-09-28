# SEFPO Lab

**Implementation: v0.1 · 2026-09-28**

A small PTI-hosted PWA for testing whether structured, persistent empirical knowledge is more useful to humans and agents than document-first memory.

## Principle

The canonical unit is a compact **Subject → Event → Factors → Process → Output** record. Firestore is the source of truth. Markdown is never canonical.

The application is the human inspection/review layer. External agents operate through PTI MCP. No LLM API is embedded in the PWA.

## Firestore namespace

All user data stays under the signed-in PTI user:

- `users/{uid}/sefpoData/workspace`
- `.../units/{unitId}` — canonical SEFPO units
- `.../entities/{entityId}` — reusable concepts
- `.../edges/{edgeId}` — explicit graph relationships
- `.../evidence/{evidenceId}` — source/provenance records
- `.../context/{unitId}` — denormalized agent context packets
- `.../changes/{changeId}` — append-only incremental change feed
- `.../revisions/{revisionId}` — revision proposals/history
- `.../inbox/{itemId}` — raw observations waiting for structuring
- `.../agentRuns/{runId}` — agent activity metadata

### Retrieval rule

Canonical storage optimizes correctness. Context packets optimize agent consumption. The change feed prevents agents from rereading the whole knowledge base.

## Status

V1 supports Google sign-in, creation, local search, inspection, inbox capture, validation/dispute states, context packets, evidence references and an incremental change feed.

Hosting target: `sefpo`  
Site: `pti-app-2ab59-sefpo`
