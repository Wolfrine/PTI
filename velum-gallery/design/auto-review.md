# Velum Auto Review

Auto Review lives in Velum Studio. The owner selects one unshared image from the exact Private/References folder, supplies the editing seed as text, and confirms permission and non-intimate scope. Studio sends that text verbatim. The existing worker records its numeric sampling seed separately. Qwen-Image 2.1 Turbo is the default for a private evaluation run. A different model must be advertised by the approved, recently seen PC and explicitly approved as a new configuration revision.

## Run and review

- One run is active at a time. The run, Studio job, and admission counter are created together. Input readiness and promotion commit together after the bounded reference chunks are present. The existing runner, model checks, device revocation, resource guards, and H-drive output paths apply. An interrupted upload can resume against the same input hash or be closed.
- When the owner has Auto Review open, a verified completed PNG is sent directly to the unshared Private/Review staging folder. The browser uses the existing Drive upload grant and reserves one file ID before upload. If Google denies folder access, the owner can grant the exact folder through the existing Picker connection. Closing, hiding, or locking the session stops browser-side transfer. The completed PC original can be resumed later.
- The comparison shows the staged edit and the exact normalized reference supplied to the model. Holding peeks at the reference, and tapping or keyboard activation toggles the comparison. Acceptance records the owner's intent before moving the same PNG directly into the existing Private folder. The browser verifies the parent and hash before recording acceptance. The existing gallery Sync discovers the accepted image for Drift and Browse. The staging folder and its contents fall outside that discovery.
- Rejection keeps the PNG in staging and records what the owner observed. The selected reason produces a local suggestion for what to change in a later seed. The owner can edit, save, and approve that learning, then optionally copy the approved wording into an editable seed. Approval revisions preserve history. Learning and model revisions do not change earlier runs.

## Release and usage

Deploy the exact main revision to the existing Velum Hosting target and publish only the reviewed Velum block through the existing shared-rules release lane. Keep activation absent until the production usage baseline and an approved run limit are recorded. The owner-administered `autoReviewControl/activation` document takes integer fields `until` (UTC epoch milliseconds for new admissions) and `maxRuns` (cumulative admissions, including closed runs). Setting `until` to zero stops admissions and queue promotions. Existing queued or running jobs drain within the Studio job lifetime, and their review receipts can be reconciled after the admission window.

There is no new cloud service, scheduler, browser listener, model service, or paid inference call. The app reuses Studio's visible-session status stream. Each admitted run can add up to 2 MiB of reference bytes and 7.2 MB of PNG data before base64 transport and Firestore overhead, one Drive PNG of up to 7.2 MB, plus existing worker progress writes and on-demand review reads. A one-run pilot would need its storage, transfer, and write headroom checked against the live project and Drive quota. The admission cap limits jobs. Reviewing, retrying a transfer, and retaining results consume usage separately.

## Design and verification

The dialog extends the existing Studio visual direction. The image and hold gesture lead the review, with the decision and owner seed adjacent on desktop and stacked on mobile. The key checks are immediate comparison without layout jumps, legible controls at phone width, and clear distinctions between working, staged, resolving acceptance, accepted, and rejected. Configuration and history use disclosures. Central release 0.2.3 guided the bounded Studio extension.

The independent source review checked the Drive boundary, private reference lineage, rules, and recovery. Rendered desktop and mobile review, authenticated Drive upload and move, and a real Qwen Turbo result remain open until the official browser and approved production activation are available.
