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


## 2026-09-24 — Extend Trace Register to Stream and Moment

Decision:
- Stream receives a timestamp-derived overview register plus the existing raw chronology.
- The overview is navigational, not analytical: selecting a tick seeks the source record.
- Raw records are grouped by recorded local date; no inferred category, score or semantic cluster is introduced.
- Moment receives a 24-hour local-day register using the captured timestamp and timezone offset.
- Same-day neighboring marks are contextual reference points only.
- The immediately previous and next loaded raw observations are shown as factual temporal context.
- Temporal proximity is explicitly not treated as a relationship or causal claim.
- Desktop Moment remains contextual over Stream; mobile Moment is a full-screen detail state.
- Existing moment-review exposure logging is preserved unchanged.

Verification:
- Static JavaScript / DOM contract passed.
- Real app.js mocked-browser flow passed on desktop and mobile.
- Verified Stream register tick count and source seeking.
- Verified Moment selected trace, same-day trace count, before/after raw context and raw_observation_reviewed exposure write.
- Verified Patterns still renders only source-linked temporal positions.

Reason:
This extends the selected visual language using existing raw timestamp data instead of adding decorative or interpretive UI.


## 2026-09-24 — Reject Trace Register as primary art direction

Decision:
- Do not continue propagating Trace Register as the identity of Luminary.
- Preserve only useful implementation lessons:
  - evidence-bound geometry;
  - no synthetic temporal positions;
  - mobile/desktop may use different compositions;
  - raw observation and derived interpretation remain separated.
- Remove the assumption that temporal geometry itself should make Luminary recognizable.
- The next direction must prioritize immediate affordance, emotional clarity and plain-language meaning before distinctiveness.
- No new design is to be merged/deployed to production until the owner sees representative visual evidence first.

Reason:
Production review showed that the design was original but not intuitive or emotionally legible.


## 2026-09-24 — Make UI versions selectable inside one PWA

Decision:
- Luminary remains one PWA, one auth flow and one Firestore data model.
- Presentation layers are versioned independently from the application/data runtime.
- Profile exposes **Experience version**.
- `intuitive-capture-v3` is the latest/default when no local preference exists.
- `trace-register-v2.1` remains selectable for direct comparison.
- The user's chosen version persists locally on that device.
- Switching UI version reloads presentation only; it never copies, migrates or forks observations.
- Captures and telemetry continue recording the active `uiVersion` for later comparison.
- Both experience templates/styles are included in the service-worker shell so switching remains compatible with installed-PWA use.

Reason:
The owner wants to evaluate evolving Luminary experiences in the actual PWA rather than through separate preview deployments, while retaining immediate access to prior versions.
