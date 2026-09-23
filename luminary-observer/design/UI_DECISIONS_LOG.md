# Luminary UI Decisions Log

## 2026-09-23 — Reject Living Instrument v1 as final art direction

Decision:
- Keep current runtime/product behavior available.
- Reject the v1 visual language as the basis for continued aesthetic polishing.
- Preserve EXPERIENCE_SYSTEM.md only for useful product/interaction constraints; its visual tokens/Figma direction are no longer authoritative.
- Require Central design intelligence and local design memory for future UI work.
- Require real-reference research, multiple art-direction candidates, representative prototypes and independent visual review before another full redesign.

Reason:
The implementation is coherent but too close to generic AI-generated dark/glow/orbit/network aesthetics and lacks a sufficiently product-specific visual metaphor.

## 2026-09-23 — Select Trace Register for representative implementation

Decision:
- Select Trace Register over Aperture / Cut and Palimpsest / Residue.
- Use time as the persistent geometry of Entry, Observe and Patterns.
- Mark becomes a trace / interruption, not a glowing orb.
- Patterns use temporal evidence tracks, not node networks.
- A pattern tick may appear only when it can be tied to a real supporting observation date.
- If source observation references are unavailable, show that limitation instead of inventing positions.
- Use a warm light field, graphite structure and one restrained trace signal.
- Use desktop width for temporal relationships; orient the same register vertically on phone capture.
- Keep application AI external; no design change alters that boundary.

Reason:
This direction maps to the actual longitudinal data model, supports epistemic separation, works without decorative metaphors, and survives the logo-swap test more effectively than v1.

## 2026-09-23 — Prototype gate result

Evidence:
- Entry, Observe and Patterns rendered at 1440 x 900 and 390 x 844.
- Central Visual Critic run against the render.
- Figma authoring was blocked by the connected Starter-plan MCP rate limit; browser-rendered HTML/CSS was used as the approved fallback artifact.

Decision:
- Pass Trace Register into a limited three-surface runtime implementation.
- Do not yet propagate a full redesign to Stream, Moment or Account.
- Re-run visual review on the actual branch implementation before expansion.


## 2026-09-23 — Runtime visual gate passed

Decision:
- Trace Register passes the second, runtime-level visual critic.
- Entry, Observe and Patterns are accepted as the visual-system proof surfaces.
- Preserve the evidence contract: a temporal mark is drawn only from recorded observation time or explicitly linked source evidence.
- Preserve the semantic use of the red trace: present / observed event only, never score, risk, confidence or importance.
- Permit the next implementation pass to adapt Stream and Moment detail to the same grammar.
- Do not mechanically copy the Entry headline scale, mono labels or register line onto every surface.

Verification:
- Real app.js browser flow with Firebase mocks passed sign-in, Mark, text capture, Stream, Patterns/source-date resolution and sign-out.
- Static JS / DOM contract passed.
- Production PTI build passed.
- Root Angular unit tests remain baseline-failing because Auth / Firestore providers are absent from those test harnesses; no Luminary code path is implicated by those failures.
