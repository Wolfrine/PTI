# Backend-only Drive management

The owner approved full `https://www.googleapis.com/auth/drive` on 17 November 2026 after the private live diagnostic confirmed `appNotAuthorizedToFile` for parent changes. This record supersedes the browser metadata-only Move path described in earlier release notes. Source, deployment, consent and actual Move/Undo evidence remain separate.

## Credential boundary

Gallery reads, thumbnails, internal references and Studio uploads retain the existing PTI OAuth client and its three narrow Drive scopes. `/api/drive/session` refreshes only those scopes and checks Google's exact audience, linked subject, expiry and an explicit scope allowlist before returning a token. Full Drive or any other unapproved scope fails closed. Firebase and GIS browser requests disable inclusion of previously granted scopes.

Full management requires a confidential OAuth client in the separate `velum-drive-server` Google API project. A different client in the PTI project would still share Google's project-wide combined authorization with old browser tabs. The management client has only the exact existing callback `https://pti-app-2ab59-velum.web.app/api/drive/callback` and no JavaScript origins. Its secret belongs only in PTI Secret Manager as `VELUM_DRIVE_MANAGEMENT_CLIENT_SECRET`; the public client ID is the function environment value `VELUM_DRIVE_MANAGEMENT_CLIENT_ID`. The source rejects IDs from the browser client's numeric project prefix. No credential is stored in source, Hosting, browser storage or logs.

The independent encrypted `managementConnection` document, purpose-bound callback attempt and revocation queue prevent a failed management consent or revoke from invalidating the read connection. Global Disconnect invalidates both grants before revocation. The existing dedicated runtime service account and encryption key remain in use. Only a resource-specific accessor binding for the new secret is needed at activation; no broad project secret role is appropriate.

## Fixed-folder operations

`POST /api/drive/move` accepts exactly `{id, from, to, at}`. The server verifies the owner Firebase ID token and linked Google subject, opposite exact Private/References IDs, file ownership, image MIME, non-trash state, single expected parent, both owned folders and their capabilities. It rereads before the bodyless parent PATCH, supplies an HTTP ETag condition when Google provides one, and confirms the same ID and destination from a fresh read.

A deterministic receipt includes the owner, Google subject and exact request tuple. A per-file Firestore lease serializes Move and Undo. A pending receipt blocks a different tuple. A matching explicit retry reconciles first; a previously confirmed tuple cannot write again after Undo. Queued or rejected actions cannot claim an unrelated external move as their own success.

`POST /api/drive/move-status` never performs a Drive write. It retains an active lease, reconciles an expired pending receipt at the destination, or permits an explicit retry at the exact source. The browser settles server-managed receipts through this endpoint before offering Undo. Stable owner-scoped local receipts retain the original tuple through reload and consent. The original Move/Undo intent resumes after the normal callback and existing PIN unlock; lock and account changes cancel browser work.

## Activation and practical gate

The isolated Google project and Drive API are prepared. OAuth branding/client creation is awaiting the action-time confirmation required by the official browser tool for Google's User Data Policy agreement and new credential setup. No client secret or full owner grant exists yet. Until a valid separate client ID and secret are installed, health reports `managementConfigured:false` and management requests return `drive/management-setup-required`; the existing gallery connection remains available.

After setup, verify the exact runtime identity, resource-specific secret IAM, private Firestore rules and public health. Then the owner must complete Google's initial full-scope consent from the ordinary mobile Move action. Actual Move followed by Undo must confirm the same file ID and exact original parent using authorized disposable owned media. Build success and narrow-token source guards do not establish this live result. The permanent PIN and source/reference images are not reset or modified.

No new test cases, fixtures or harnesses were created. Existing focused checks, TypeScript compilation, module syntax, Home contract and independent source review are used alongside actual browser observation.
