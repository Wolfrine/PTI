# Botanical release — 15 October 2026

Live: [invitation](https://mahima-mayank.web.app/) · [family workspace](https://mahima-mayank.web.app/family/).

[PR #38](https://github.com/Wolfrine/PTI/pull/38) merged as `a0f74b66ca49f729fdd1cf621ef1ec49d6985de3`. [PR verification](https://github.com/Wolfrine/PTI/actions/runs/38728022755) and [main verification/release](https://github.com/Wolfrine/PTI/actions/runs/38728388645) succeeded. Main job `116399778811` records the actual results; deployment configuration alone is not the evidence.

- Ten model tests, nine wedding rules tests, existing Venture rules regressions, production build/audit, actual Auth/Firestore emulator integration and twelve browser tasks passed in the release workflow.
- Ten isolated live client authorization checks passed. Temporary synthetic accounts/workspace were cleaned up by the existing verifier.
- Only the wedding Hosting target was deployed in the existing PTI project. All nineteen hosted assets matched the workflow's tested build. Private source and design paths returned 404.
- Activation reported `seeded: false`; existing workspace data was not reseeded.
- Parent independently ran the live browser check and personally viewed invitation and signed-out family screenshots at 1440/390. Both routes fit; no page/CSP console errors or public Firebase traffic were observed.
- A before/after read-only comparison of all five wedding collections, including document metadata, was exactly equal: events 10→10; decisions 7→7; guests, attendance and arrangements 0→0. No contents of private records are copied into this report.

The new scene is original imagined artwork; it is not a booked venue or couple portrait. Public facts are names and planned 18–20 January 2027. Event timings, venues, contact and countdown remain unpublished. Retained family QA images contain document-derived menu proposals plus explicitly synthetic people/logistics, not real guest records.

Independent visual review and parent checkpoint passed for the declared final candidate; family aesthetic approval remains pending. Human Google popup login is not claimed. The original PTI Angular build passed locally, while its eight existing missing-provider Karma failures remain unrelated and unchanged. Two existing SEFPO workflow definitions also fail independently of this wedding release. Optional GitHub evidence uploads remain non-blocking when account artifact quota is exhausted; the release log retains activation evidence.

This follow-up changes release documentation only; the deployed build is unchanged.
