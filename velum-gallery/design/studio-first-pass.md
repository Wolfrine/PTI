# Studio first functional pass

Scope: extend the existing Velum gallery with an Operate screen for explicit owner-authenticated local generation and feedback. Preserve the rose-black material, Georgia typography, phone-first canvas, existing gallery interactions, Quick Exit, PIN and read-only Drive scope. The owner accepts generated images; no agent aesthetic correction or prompt transformation is part of this feature. Image editing is deferred.

Central snapshot: `Wolfrine/Central` main `4f225957ac4dbd0bb7af804e7ec51357f69b8577`, current Visual Design Director plus designer/critic guides. Lane: bounded extension of the existing direction. Parent handled implementation scope and functional QA; separate Studio designer and independent Studio critic inspected rendered evidence. No direction reset or rebranding was requested.

Critical dimensions declared before review: prompt/task clarity; consistency with existing typography/materials; mobile navigation/control fit; truthful availability/queue/result presentation. The eye path is model → verbatim prompt → seed/consent → Generate → genuine result → owner feedback. Timing is a design hypothesis, not a measured perception claim.

## Render and review record

Five substantive state reviews used actual desktop 1440×900, mobile 390×844 and reduced-height 390×500 Chrome renders. Local fixtures are explicitly labelled; they do not authenticate or generate on Firebase. Result imagery is a genuine prior local Z-Image output, served only on loopback from H, with fixture metadata labelled. No private image or screenshot is committed or hosted. CUA captured screenshots in the task session; it did not expose a filesystem screenshot-export API, so no invented screenshot paths are listed.

1. Offline/empty: four models, installed versus online distinction, empty result without invented art. Retained established material and heading direction.
2. Long prompt/settings: kept original whitespace, numeric seed limits and full mobile scroll. Mobile fields use 16px type to avoid focus zoom.
3. Active queue: real-step presentation and explicit waiting text; no synthetic generated preview. Parent inspected desktop and mobile renders.
4. Failure: independent critic requested a clearer direct heading; changed to “Generation stopped.” Raw prompt remains available.
5. Result/feedback and reduced-height viewport: critic found scrolled content behind the appbar. Inset the Studio scroll viewport below it and rerendered. Genuine image is contained; original prompt/settings and owner feedback remain scrollable. Parent personally inspected the corrected mobile/desktop candidate.

Independent critic scores after corrections: prompt clarity 8.5, gallery consistency 8.4, mobile fit 8.3, truthful status/results 8.5. Parent agrees all four meet the bounded-extension threshold (8+): controls fit, hierarchy stays clear, status is explicit and no placeholder art is passed off as output. These are agent judgments of the UI, never judgments of the owner's image taste. A real physical phone keyboard was not observed.

Separate functional QA uses an ignored local fixture importing the actual app, Stats, interaction and PIN bootstrap with Firebase/Drive mocks. Its 14 assertions cover four-view transitions, timer clear/resume, Quick Exit, wrong/correct PIN return, PNG integrity, sign-out cleanup and Studio entry without Drive permission. This proves frontend integration only. The empty Browse baseline used actual index/CSS and no private Drive media.

Current visual verdict: **agent-reviewed UI candidate; owner acceptance pending**. Production auth and end-to-end generation require the separate live checks below; fixtures never establish those claims.

## Verification and remaining acceptance

Velum contracts, worker/session/transport tests, shared rules emulator isolation tests, PTI tests/build and Home-contract checks are required before delivery. The existing Velum CI stamps its HTML/PWA identity and verifies exact production assets. Private Studio rules must deploy before Velum Hosting. Existing sibling namespaces and monitor credentials remain unchanged.

Runtime results, commit/deployment identity and the real end-to-end status are reported in the task's final delivery. A separate interactive PC owner sign-in is required before the outbound worker can accept real Studio work. One engine smoke run can validate the disposable inference path without proving the phone/Firebase round trip. Final image acceptance and feedback belong to the owner.

Verified 30 October 2026: 63 Velum contracts, four worker/session/loopback tests, eight combined Studio/existing usage privacy emulator tests, 100 PTI frontend tests, production build, Home-contract and source syntax checks passed. The old PATH Node 20.13.1 showed a pre-existing before-hook failure in the unchanged usage rules tests; the installed F-drive Node 24.22.1 runtime passed all eight without modifying the monitor. CI retains its existing supported Node setup.

Actual engine smoke: FLUX.2 Klein, seed 30102026, 768×1024, four Euler steps, 143.06 seconds, 843842-byte PNG. Independently saved-byte SHA-256: `2a8a09245b69d624512c89e1b131d0c299c13b07d891b51e0955c562f853f208`. Private artifact: `H:\AI-ImageGen\portrait-pilot\velum-studio\smoke-8e537c8e-477b-431a-87f2-2cc93c45e201\image.png`. No Firebase/gallery publication. Own inference processes exited; post-run GPU memory was 1000 MiB at 42 C, available RAM approximately 12.4 GiB. The earlier interrupted attempt had no output and is not counted as success. This establishes this engine path, not live Studio end-to-end generation or image-quality acceptance.

Live release follow-up: fresh HTML from commit `2af9d165` could still load older unversioned entry scripts from the browser HTTP cache, leaving Studio before the runtime-injected Stats tab. Release stamping now versions local script/style URLs, bootstrap carries that version into the app import, and Velum Hosting requires revalidation. Offline shell lookup ignores release query strings and fails missing executable assets instead of returning HTML. All 66 Velum tests and the 14-check actual-runtime fixture passed after this correction; mobile rendering retained four tabs in Drift/Browse/Stats/Studio order. No further inference or private credential access was needed.
