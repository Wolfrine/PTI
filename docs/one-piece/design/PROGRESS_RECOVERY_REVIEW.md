# Progress recovery review — 6 November 2026

Lane: mechanical UI repair. Central guidance snapshot: `7bbc11087318cbf52b024d9a8bb633ef047f032f`, Visual Design Director plus the repository's five entry paths. Preserve the current Library/Watch direction. No new direction selection or visual scores are asserted.

A saved event from episode 50 must not indefinitely block episode 51. The Library/Watch notice now offers Retry save or an episode-specific saved-place review. The chooser names the device and verified PC positions, preserves intentional rewinds, omits an unknown PC position and has Keep for later. A separate storage failure warns the viewer to keep the page open.

Parent owns notice/dialog/layout implementation and QA; `/root/cast_code_rca` owns recovery behavior. `/root/native_history` independently reviewed UI semantics and `/root/cast_review` reviewed data/authority behavior. The returned reviews and production-method tests passed. Responsive source uses wrapping actions and at least 44px controls; this is not a rendered geometry verdict.

Current visual verdict: **unverified**. Browser access was unavailable; native Computer Use stopped because the browser URL could not be verified for policy enforcement. No desktop/mobile captures or aesthetic acceptance occurred. Historical acceptance records retain their earlier candidate and scope; they do not endorse this changed candidate.

Development-only `progress-pending`, `progress-offline`, `progress-retrying`, `progress-review` and `progress-conflict` fixtures accept `episode=50`; all accounts, queues and positions in those fixtures are synthetic. They are not production-recovery evidence. The production-method tests and real PC/cloud observations are recorded in [the incident report](../PROGRESS_RECOVERY_2026-11-06.md).

Remaining gate: inspect the deployed Library recovery notice and saved-place chooser at desktop and mobile widths, then confirm the real owner's 50 → 51 transition and retained resume position. Keep active TV playback untouched during that acceptance check.
