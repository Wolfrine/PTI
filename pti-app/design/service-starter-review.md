# GT Papers assistant status and start control

Date: 2026-10-26. Verdict: **functionally verified; visual acceptance open**.

This is a bounded addition to the accepted warm-light `/home` direction: a quiet owner-only strip below Codex usage shows the GT Papers assistant's actual connection and offers Start when the gateway permits it. The launcher remains the primary page job. No new artwork or design direction is introduced.

The gateway, rather than the model or browser, determines availability and permission. A live worker with its model unloaded is available; an accepted start is shown as starting until a fresh worker heartbeat arrives. A missing starter heartbeat is labelled “Start unavailable”, without claiming the PC is powered off. Unknown network responses require a status refresh before another start.

Designer: `starter_ui`; independent critic: `starter_critic`; QA/release authority: parent. Central bundled release 0.1.0 at `ba1235fe7b220842778414f3f70fca38e7df4c53`, director and designer guide loaded. Scope is functional state handling within the current direction; no renewed aesthetic acceptance is claimed.

Pass conditions: status never substitutes model residency or start acceptance for worker readiness; existing Home hierarchy remains intact; controls fit at desktop/mobile widths and have usable keyboard order. The last condition has DOM/geometry evidence, not a pixel verdict.

Development preview: `ng serve --configuration usage-preview --host 127.0.0.1 --port 4329`, then `/?state=fresh&host=offline`. Other `host` values: `ready`, `idle`, `starting`, `failed`, `starter-offline`, `loading`, `error`, `hidden`. This is a separate synthetic entry with no Firebase/auth/model calls; it is excluded from production. The synthetic Start action deliberately transitions through starting before an idle-ready state.

Verification: 37/37 Karma tests and production Angular build pass. Tests cover owner-only API requests, unknown states, visibility pause, abort on sign-out, duplicate-start suppression, uncertain responses and idle readiness. Production bundles omit the preview entry markers. The existing login style-budget and root stylesheet-inlining warnings remain.

Independent DOM/action checks at 1440, 390 and 320 widths found no horizontal overflow. Designer checks confirmed mobile 44px actions, Start-to-Refresh keyboard order, and offline → starting → available behavior. The critic requested the precise starter-unavailable label; it was corrected. These fixtures prove client behavior only, not production authentication, Windows startup or Firebase delivery.

**Pixel-review blocker:** CUA's IAB `Page.captureScreenshot` timed out in both designer and parent sessions, including after the parent enabled visibility. The separate critic also could not inspect pixels. No screenshots, visual scores or visual pass are asserted. Desktop/mobile screenshot review of the released UI remains required when capture is available.
