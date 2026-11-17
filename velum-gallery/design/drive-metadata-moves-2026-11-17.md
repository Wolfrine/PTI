# Unified Drive connection and fixed-folder moves

The owner approved Drive metadata permission on 17 November 2026 after the inspect-only review of release `0a861e16`. This is a bounded interaction and authentication repair within Velum's rose-black, dark-only identity. The primary job is moving an existing image between Private and References while retaining its ID and offering durable Undo.

## Permission and lifecycle

Connect requests `drive.readonly`, `drive.metadata` and `drive.file` in one user-initiated Firebase Google popup. File scope supports the existing explicit Studio Save upload. Google tokeninfo verifies the exact OAuth audience, linked Google subject, owner Firebase UID, granted scopes and remaining expiry. Gallery reads, internal Studio references and metadata management share that grant. Expired access renews on a user action. Startup restores and verifies bounded cached access without opening a popup.

The shared token expires within Google's remaining lifetime and a 50-minute maximum. Restoring preserves its original cache expiry. Explicit lock, Quick Exit and sign-out clear token caches and cancel work. Ordinary page closure cancels pending transfers while retaining the bounded cache. Firebase browserLocalPersistence remains enabled.

Management is constrained by application checks to Private `1AedezVcOlOB-cdv00j1HQ7Sy-EZntHgA` and References `1yDt_5NSv8fDYhZvOdsihdJwKQJuTzx66`. Google grants metadata authority across Drive. Every move checks actual image MIME, ownership, non-trash state, exact original parent, both folders' ownership/type/capabilities, then rereads the file before PATCH. The response must confirm the same ID and exact destination parent. Undo applies the same checks to the recorded destination before restoring the source.

Google Picker is absent from Move, Undo and the internal Private/References browser. Save retains its upload-folder grant check. Owner-scoped local move receipts are written before PATCH and reconciled after interrupted acknowledgements. Confirmed PATCH success and Undo are independent of gallery reconciliation.

## Interaction and review

Browse retains its independent image-open target, adds a visible source label and a 44px move overlay with the full destination name. Drift retains direct details access. The steady-state source path requires one move tap and one Undo tap. The preceding release could require at least five actions when source and destination Picker grants were missing, plus OAuth and navigation. These counts describe source paths.

Parent integration and a separate native reviewer inspected auth, move guards, lifecycle races and recovery. The source review passed after correcting page-close cache deletion, failed Undo recovery and retention of the previous confirmed Undo during a failed replacement move. The official production Chrome session is PIN-gated. The signed-in gallery, real consent, rendered move overlay, Move and Undo require practical verification. Source checks and existing transport checks cannot establish those outcomes.

## Google Cloud configuration

The owner account saved exactly the three Drive scopes plus Google identity scopes in PTI-app Data Access through official Chrome. Google marks readonly and metadata as restricted and unverified. Verification Center says branding must be verified and published before a verification request can be prepared. Other OAuth clients, publishing settings, Firestore rules and services were preserved. No verification submission or user consent result is claimed.

## Existing checks

The relevant test-only assets and their wildcard CI consumers were inspected. Legacy auth fixtures encode the superseded readonly-only and per-file Picker contracts. Their wildcard CI consumer remains in the existing workflow. The focused existing interaction, release/cache and upload-integrity checks passed, covering 21 distinct checks. Twelve legacy OAuth cases were skipped by the upload test-name filter. Module syntax, module import, diff whitespace and Home contract checks passed. Authenticated product verification remains open.

The owner-selected delivery uses a stamped exact-commit artifact and the existing `firebase-owner.cmd` CLI, scoped to `hosting:velum`. Main's inspected branch metadata reports no required status contexts. A skip-CI commit message keeps this release within that Hosting-only lane while preserving the broader workflow definition.
