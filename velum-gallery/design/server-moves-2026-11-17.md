# Backend-only Drive management

The owner approved full `https://www.googleapis.com/auth/drive` on 17 November 2026 after the private live diagnostic confirmed `appNotAuthorizedToFile` for parent changes. This record supersedes the browser metadata-only Move path described in earlier release notes. Source, deployment, consent and actual Move/Undo evidence remain separate.

## Credential boundary

Gallery reads, thumbnails, internal references and Studio uploads retain the existing PTI OAuth client and its three narrow Drive scopes. `/api/drive/session` refreshes only those scopes and checks Google's exact audience, linked subject, expiry and an explicit scope allowlist before returning a token. Full Drive or any other unapproved scope fails closed. Firebase and GIS browser requests disable inclusion of previously granted scopes.

Full management uses a confidential OAuth client in the separate `velum-drive-server` Google API project. A different client in the PTI project would still share Google's project-wide combined authorization with old browser tabs. The management client has only the exact existing callback `https://pti-app-2ab59-velum.web.app/api/drive/callback` and no JavaScript origins. Its secret belongs only in PTI Secret Manager as `VELUM_DRIVE_MANAGEMENT_CLIENT_SECRET`. Its public client ID, `542835526747-lj8t3hl7590of1m2l8btojf0ciitkkcc.apps.googleusercontent.com`, is fixed in server source, like the existing read client ID. The source rejects the browser client's numeric project prefix. No secret is stored in source, Hosting, browser storage or logs.

The independent encrypted `managementConnection` document, purpose-bound callback attempt and revocation queue prevent a failed management consent or revoke from invalidating the read connection. Global Disconnect invalidates both grants before revocation. The existing dedicated runtime service account and encryption key remain in use. Only a resource-specific accessor binding for the new secret is needed at activation; no broad project secret role is appropriate.

## Fixed-folder operations

`POST /api/drive/move` accepts exactly `{id, from, to, at}`. The server verifies the owner Firebase ID token and linked Google subject, opposite exact Private/References IDs, file ownership, image MIME, non-trash state, single expected parent, both owned folders and their capabilities. It rereads before the bodyless parent PATCH, supplies an HTTP ETag condition when Google provides one, and confirms the same ID and destination from a fresh read.

A deterministic receipt includes the owner, Google subject and exact request tuple. A per-file Firestore lease serializes Move and Undo. A pending receipt blocks a different tuple. A matching explicit retry reconciles first; a previously confirmed tuple cannot write again after Undo. Queued or rejected actions cannot claim an unrelated external move as their own success.

`POST /api/drive/move-status` never performs a Drive write. It retains an active lease, reconciles an expired pending receipt at the destination, or permits an explicit retry at the exact source. The browser settles server-managed receipts through this endpoint before offering Undo. Stable owner-scoped local receipts retain the original tuple through reload and consent. The original Move/Undo intent resumes after the normal callback and existing PIN unlock; lock and account changes cancel browser work.

## Activation and practical gate

The owner confirmed the Google policy agreement, client creation and secure secret storage on 18 November 2026. The separate Google project is `velum-drive-server` / `542835526747`, with Drive API enabled. The web client is registered with the fixed callback and no JavaScript origins. Secret version 1 is enabled; its resource-specific accessor binding contains only `velum-drive-runtime@pti-app-2ab59.iam.gserviceaccount.com`. No full owner grant is implied by this setup.

Health checks the installed management configuration in server memory and reports only availability and the public client ID. Its optional management probe starts alongside the mandatory narrow configuration check, has a two-second budget, and handles late failure. Management secret availability cannot add a sequential ten-second dependency to gallery startup.

Google's external production branding requires actual homepage, privacy and terms links. `about.html` supplies a public description of the private app and its implemented data handling; the collection sign-in screen links to it. It contains no account IDs, private media, credentials, analytics or sign-in code. The Google branding URLs use that page and its privacy/terms anchors. [Google's branding requirements](https://support.google.com/cloud/answer/15549049?hl=en) and [Testing token expiration](https://developers.google.com/identity/protocols/oauth2) explain why this setup is necessary for persistent authorization. Publishing mode and actual owner consent must be verified separately from source readiness.

After setup, verify the exact runtime identity, resource-specific secret IAM, private Firestore rules and public health. Then the owner must complete Google's initial full-scope consent from the ordinary mobile Move action. Actual Move followed by Undo must confirm the same file ID and exact original parent using authorized disposable owned media. Build success and narrow-token source guards do not establish this live result. The permanent PIN and source/reference images are not reset or modified.

No new test cases, fixtures or harnesses were created. The activation delta receives TypeScript compilation, Home contract, whitespace and independent source review. The public information page receives actual desktop/mobile browser inspection. Existing source checks from the proxy release do not establish authenticated Move/Undo.
