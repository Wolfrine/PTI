# Local infrastructure v1

The authenticated `/new-local-infrastructure` page follows the owner-selected 21 November ImageGen direction and the existing PTI Resource Pulse. Home adds a text link alongside Explore usage. GT Papers and One Piece drilldowns link to their existing Home controls.

## Design

Use ivory `#faf7f2`, paper `#fffdfa`, thin `#e5dfd6` rules, ink `#302923`, terracotta `#a34b42`, and sage for verified availability. Georgia headlines and compact sans-serif labels establish the hierarchy. The desktop overview puts the six workstation readings and up to nine preview worker rows on the left, with System and Activity snapshot on the right. At 760 px and below, the cards stack. Workers exposes the full inventory, and Activity provides timestamped readings for the same last-hour series.

Visual acceptance requires a signed-in comparison at 1440 × 900, 390 × 844 and 320 × 568, including the Home link, worker filters and disclosures, and a narrow view without horizontal overflow. Chart gaps, latest-reading age, and unavailable values must remain legible. Central design guidance was read at `df6b59d7f6637922ca7c1cf3eff6a8d67849e45a`.

## Data and operation

- `PTI Local Infrastructure Observer` is a single interactive-user Windows scheduled task. Every five minutes it runs a windowless, one-minute-bounded observation. It uses Windows CPU and memory counters, volume capacity, system uptime and physical adapter counter deltas, plus NVIDIA GPU 0 via `nvidia-smi`. CPU temperature remains unavailable without a reliable CPU sensor. The page qualifies cached or overdue data and reports awake only at a successful observation.
- The observer uses known Windows task and process identities and existing safe status fields. Readiness requires a current health report or heartbeat. GT Checking has a separate process and a transition-based status file. Taleweald Image3D and UltraTex share one worker. Taleweald’s heartbeat lives in its own cloud service, so this local observer reports process evidence. Android Auto readiness likewise stays unknown in this collector. Runtime components appear under their parent when applicable. Job counts remain unavailable unless a worker directly reports them.
- The fixed PTI document is `users/{ownerUid}/resourceUsage/local-infrastructure`. Existing Firestore rules restrict client reads to the owner and deny client writes. The installed observer uses the existing local user ADC through the Google SDK. It sends bounded metrics, fixed worker IDs and statuses, and at most 13 samples from the prior hour. Each successful cycle uses one Firestore read and one conditional write. Home loads no data for this feature until the route is opened.
- Run `tools/local-infrastructure/install.ps1` from the PTI checkout with process-only PowerShell execution policy if required. It installs the observer to `H:\Workspace\Runtimes\PTI\local-infrastructure` and checks active Firestore privacy before registration. `node observer.mjs readback` from the installed directory reads the private document. The installed `last-run.json` records the scheduler publication receipt. Disable the observer through its own task to pause sampling.

## Verification

On 21 November the windowless observer completed with Task Scheduler result `0`. Its 12:59:20 UTC observation matched the authenticated Firestore readback with 11 workers and four real history samples. A signed-out read of the published document returned HTTP 403. The installed runtime files matched the repository source hashes. Evidence is in `H:\Workspace\Reports\PTI\local-infrastructure\observer-verification.json`.

The production Angular build passed on the isolated release candidate based on remote main at `060c2ae`. The component stylesheet reached 7.02 kB, above the warning threshold and below the 8 kB error threshold. Build output is in `H:\Workspace\Builds\PTI\local-infrastructure\release-production`.

The first render exposed a white gutter from the global page padding and loose worker rows. The release removes the gutter on this route, tightens metric and worker spacing, and restores the intended small labels. The lead and an independent reviewer inspected the re-rendered production Angular component at 1440 × 900, 390 × 844 and 320 × 568, plus expanded worker details and the Activity tab. Document and page widths matched all viewport widths. The preview uses sanitized local data. Screenshots, viewport measurements and hashes are in `H:\Workspace\Reports\PTI\local-infrastructure\release-visual`.

The official browser returned `The browser access host is unavailable`. The private ImageGen reference image and signed-in browser acceptance remain open. The rendered preview was compared to the owner’s written reference.
