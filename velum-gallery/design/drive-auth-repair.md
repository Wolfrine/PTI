# Drive and Studio authentication correction

Scope: mechanical auth-state repair following Studio 2.0; existing visual direction,
Private folder root, readonly Drift listing, explicit saves, upload reservation,
receipt verification, PIN and Quick Exit are retained. Central snapshot:
`fa6fdd1a246b31b7b71a55a9ca5748b70d0dfb4f`, mechanical UI repair lane.
This does not renew the Studio visual-direction verdict or claim owner acceptance.

## Behavior

- A Firebase-signed-in owner with no fresh Drift read token enters Studio. An
  expired server-side token during startup also falls back to Studio. Late Drift
  sync failures cannot cover an open Studio with the global connection gate.
- Explicit Drift/Browse entry can request its existing `drive.readonly` grant.
  Reconnection resumes the requested gallery view. Fresh read tokens are reused.
- Only explicit Save or Drive reference selection requests `drive.file`. Both
  OAuth providers preserve incremental grants and omit forced `prompt:consent`.
- Studio verifies a candidate token with Google's tokeninfo endpoint using POST
  (no bearer token in the URL), checking scope, client, linked Google user and
  remaining lifetime. Existing combined grants can be reused after reload;
  a separate write-only token remains in memory, so a reload may require a new
  token popup without forced consent. No extra write token is persisted.
- Save checks the exact existing folder's `isAppAuthorized`, folder MIME,
  non-trashed state and `canAddChildren` with the verified file-scoped token.
  Picker is required if that app grant is missing, including when readonly
  metadata reports the user can add children. No broader write scope is requested.
  Google documents this distinction in [Drive error handling](https://developers.google.com/workspace/drive/api/guides/handle-errors)
  and the [file resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).
- Denial, cancellation, invalid scopes, wrong folder and expired access never
  become a saved receipt. Epoch checks prevent late OAuth/tokeninfo/folder
  responses from reopening Picker or restoring write access after Quick Exit.

## Local verification

- Node regression suite covers first grant, repeat save, reload, partial/denied
  consent, wrong scope/client/user, actual token expiry, HTTP 401, network failure,
  Picker cancellation/wrong folder, owner Studio entry, late sync failure and lock
  races. All 121 combined Velum and worker tests passed.
- PTI: 100 ChromeHeadless tests passed; production build passed. Existing style
  size-budget and unresolved absolute stylesheet warnings remain. Home contract
  and module syntax checks passed.
- Actual app/bootstrap/Studio/interaction/PIN code rendered in headless Chrome at
  1440x900 and 390x844 on loopback. Firebase, Drive and PC metadata were synthetic
  and empty; all external browser requests were blocked. Twelve checks passed:
  expired-token Studio entry without OAuth, no horizontal overflow, scoped gallery
  reconnect and Studio return, Quick Exit clearing prompt, wrong/correct PIN,
  reload and sign-out. No page errors or external requests occurred.
- Personally inspected stable desktop/mobile Studio and mobile reconnect renders:
  no blocking auth warning over Studio; prompt, disabled Generate and PC setup
  remain readable; reconnect offers the existing Studio action. Local evidence:
  `.velum-qa/auth-evidence/` (ignored screenshots and JSON). The first captures
  contained CSS transition frames; stable captures disabled animations.

## Acceptance limits

No private media was opened, no PC Google sign-in occurred and no inference was
run. Tests use fake OAuth, Picker and metadata responses; they do not establish
the owner's real phone consent, folder grant or completed upload. The known cloud
IAM 403 for archive indexes and public API-key inspection remains a separate
blocker; this correction changes no IAM, credentials or prerequisite checks and
does not attempt to bypass that restriction. Deployment and exact live release
evidence are reported separately with the delivery commit and workflow run.
