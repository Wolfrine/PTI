# Companion idle resource use

## Verified software defect

The coordinator previously called full cache maintenance every second regardless of demand. Each call recursively enumerated and statted the accounting roots (and separately the managed engine roots), then rewrote `cache.json` even when nothing changed. An isolated, filesystem-free counter fixture reproduced ten usage scans and ten manifest writes during ten ticks with zero sessions or jobs. This establishes redundant work; it does not attribute a measured CPU percentage to that work.

## Default policy

- The existing one-second timer retains cheap expired-session and transition-context cleanup.
- Full automatic cache checks continue each timer tick while downloads, prepared renditions, subtitle warming, storage reservations, or dynamic engine budgets are active.
- Retained viewing sessions without those producers trigger at most one automatic full cache sweep per 60 seconds. Prepared MP4 playback, including paused viewing, retains its session and current/next resources.
- With zero sessions and zero producers/reservations, the timer skips full disk accounting completely.
- Explicit `maintain()` calls remain immediate. Foreground source/preparation admission and storage checks still use current full accounting before work begins.
- Capacity checks write the manifest only after eviction changes metadata, including partial eviction followed by a quota denial.

The HTTP listener, engine, authentication, and Cast receiver polling remain available. Opening the app on a phone follows the normal authenticated playback path; there is no separate wake command. This change quiets repeated work rather than unloading every process: cached metadata and retained process memory remain resident. It does not place Windows into sleep.

## Fixture verification

Cache, coordinator, prepared-media and prepared-review suites passed **40/40 checks**. Added regressions cover sixty deterministic idle timer callbacks with no full sweep, paused progress with one sweep per minute, each producer/reservation restoring frequent checks, expiry cleanup during quiet periods, an explicit check arriving during automatic cleanup, active disk-pressure cancellation, zero no-op manifest writes, fresh disk checks before the first post-idle download, and persisted partial eviction while active media stays pinned.

These checks use synthetic media, temporary directories and an injected clock. They do not establish actual CPU reduction, physical-phone wake, TV playback, or Cast acceptance. No live runtime restart or TV interaction was performed in this implementation lane. Runtime measurements and release evidence are to be appended after installation.

The complete Windows companion suite passed 245/245 checks, the complete frontend suite passed 85/85, and the complete PTI and dedicated One Piece artifacts built successfully with existing Angular warnings. A separate reviewer inspected the frozen change and independently passed the same 40 scoped checks with no blocker. The frontend release bytes remain unchanged; this repair has no UI, Cast, authentication or source-format change.
