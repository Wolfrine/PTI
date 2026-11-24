# Local infrastructure v1

The authenticated `/new-local-infrastructure` page follows the owner-selected 21 November ImageGen direction and the existing PTI Resource Pulse. Home links to the page from its PC & workers strip. GT Papers and One Piece drilldowns link to their Home cards.

## Design

Use ivory `#faf7f2`, paper `#fffdfa`, thin `#e5dfd6` rules, ink `#302923`, terracotta `#a34b42`, and sage for verified availability. Georgia headlines and compact sans-serif labels establish the hierarchy. The desktop overview puts CPU, RAM, GPU, VRAM, fixed drives and up to nine preview worker rows on the left, with System and Activity snapshot on the right. At 760 px and below, the cards stack. Workers exposes the full inventory, and Activity provides timestamped readings for the same last-hour series.

Visual acceptance requires a signed-in comparison at 1440 × 900, 390 × 844 and 320 × 568, including the Home link, worker filters and disclosures, and a narrow view without horizontal overflow. Chart gaps, latest-reading age, and unavailable values must remain legible. Central design guidance was read at `df6b59d7f6637922ca7c1cf3eff6a8d67849e45a`.

## Data and operation

- `PTI Local Infrastructure Observer` is a single interactive-user Windows scheduled task. Every five minutes it runs a windowless, one-minute-bounded observation. It uses Windows CPU and memory counters, volume capacity, system uptime and physical adapter counter deltas, plus NVIDIA GPU 0 via `nvidia-smi`. CPU temperature remains unavailable without a reliable CPU sensor. The page qualifies cached or overdue data and reports awake only at a successful observation.
- The observer uses known Windows task and process identities and existing safe status fields. Readiness requires a current health report or heartbeat. GT Checking has a separate process and a transition-based status file. Taleweald Image3D and UltraTex share one worker. Taleweald’s heartbeat lives in its own cloud service, so this local observer reports process evidence. Android Auto readiness likewise stays unknown in this collector. Runtime components appear under their parent when applicable. Job counts remain unavailable unless a worker directly reports them.
- The fixed PTI document is `users/{ownerUid}/resourceUsage/local-infrastructure`. Existing Firestore rules restrict client reads to the owner and deny client writes. The installed observer uses the existing local user ADC through the Google SDK. It sends bounded metrics, fixed worker IDs and statuses, and at most 13 samples from the prior hour. Each successful cycle uses one Firestore read and one conditional write.
- The Windows probe requests ready fixed volumes with a drive letter and accessible capacity counters. It sends uppercase drive letters and used and total bytes. Earlier snapshots containing F and H still decode. Both views flag usage at 90% and 95%. On drives of at least 32 GiB, under 10 GiB free is also a warning and under 2 GiB is critical. Home shows the highest-severity drive, then the fullest if several share that severity.
- On the owner's Home, the PC & workers strip and GT Papers card share one authenticated listener on the existing Local Infrastructure document. Other accounts keep a single read of their own document. The observer uses the native Papers process and its fresh heartbeat receipts. The card expires its reading locally after 12 minutes and labels cached readings as out of date. The Windows observer publishes every five minutes.
- Run `tools/local-infrastructure/install.ps1` from the PTI checkout with process-only PowerShell execution policy if required. It installs the observer to `H:\Workspace\Runtimes\PTI\local-infrastructure` and checks active Firestore privacy before registration. `node observer.mjs readback` from the installed directory reads the private document. The installed `last-run.json` records the scheduler publication receipt. Disable the observer through its own task to pause sampling.

## PC & workers verification

The first scheduled run with dynamic discovery published at 13:54:20 UTC on 21 November 2026. Its owner ADC readback matched the scheduler receipt and included eight fixed drives (C: through J:), 11 workers and 13 history samples. F: reported 97.6% used with 2.36 GiB free. The signed-out document request returned HTTP 403. The compact decoded snapshot measured 3,459 bytes. Firebase’s sizing calculation estimates 4,272 bytes of document storage. The five-minute schedule and per-cycle operation count stayed the same.

The sanitized Angular previews showed the fixed-drive grid at 1440 × 900, 390 × 844 and 320 × 568. Independent critique identified the need for a stronger Home Critical label and a complete view of the 320 px strip. The corrected preview shows the full strip at 320 px with terracotta severity text and compact labels. Capture and readback evidence live in `H:\Workspace\Reports\PTI\pc-worker-summary`. Signed-in visual verification remains open because the official browser access host was unavailable.

## Original release verification

On 21 November the windowless observer completed with Task Scheduler result `0`. Its 12:59:20 UTC observation matched the authenticated Firestore readback with 11 workers and four real history samples. A signed-out read of the published document returned HTTP 403. The installed runtime files matched the repository source hashes. Evidence is in `H:\Workspace\Reports\PTI\local-infrastructure\observer-verification.json`.

The production Angular build passed on the isolated release candidate based on remote main at `060c2ae`. The component stylesheet reached 7.02 kB, above the warning threshold and below the 8 kB error threshold. Build output is in `H:\Workspace\Builds\PTI\local-infrastructure\release-production`.

The first render exposed a white gutter from the global page padding and loose worker rows. The release removes the gutter on this route, tightens metric and worker spacing, and restores the intended small labels. The lead and an independent reviewer inspected the re-rendered production Angular component at 1440 × 900, 390 × 844 and 320 × 568, plus expanded worker details and the Activity tab. Document and page widths matched all viewport widths. The preview uses sanitized local data. Screenshots, viewport measurements and hashes are in `H:\Workspace\Reports\PTI\local-infrastructure\release-visual`.

The official browser returned `The browser access host is unavailable`. The private ImageGen reference image and signed-in browser acceptance remain open. The rendered preview was compared to the owner’s written reference.
