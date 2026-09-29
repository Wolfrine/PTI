# PTI shared MCP

One server for PTI, Luminary, Personal / Daily Intelligence and SEFPO, using the existing `pti-app-2ab59` default Firestore database. `pti_apps_list` discovers apps; `pti_app_context` returns their canonical paths. Add future apps in `src/apps.ts`.

**Velum exception:** its media is in Google Drive and its votes/view history are browser-local. Discovery reports this accurately; this server cannot access those stores until a Drive/sync adapter is implemented.

## Local agents

`npm ci && npm run build` in this directory. The existing `.codex/config.toml` starts `dist/index.js` over STDIO. Supply Application Default Credentials for PTI. `PTI_MCP_ACTOR` and `PTI_MCP_TASK_REF` label audit records. Local credentials retain their existing project access; authentication records remain blocked.

## ChatGPT plugin

The HTTP service uses the same OAuth/Cloud Run architecture as GTOP's working hosted connector (GTOP PR #47), with account ownership enforced for every hosted tool. Google sign-in uses the existing PTI Firebase Auth project. Only `PTI_MCP_ALLOWED_EMAILS` can connect. PKCE, one-use codes, rotating refresh tokens, replay detection, revocation and persistent grants protect the connection.

Intended endpoint: `https://pti-firestore-mcp-185802494856.asia-south1.run.app/mcp`.

Deployment: `.github/workflows/pti-hosted-mcp.yml` builds/tests, checks existing billing, isolates the OAuth namespace, deploys and verifies HTTPS discovery. It never enables billing or creates a Firestore database. Cloud Run needs active project billing and the existing deployment identity needs Cloud Run/Artifact Registry permissions. A green build alone does not mean the plugin is connected.

After successful deployment: ChatGPT → Plugins → + → name **PTI Apps**, description **Access PTI, Luminary, Personal and SEFPO through one private account-scoped connection**, endpoint above, OAuth. Sign in with the approved PTI Google account. Verify `pti_apps_list`, an owned document read, and a temporary create/update/delete before marking connected. Use Refresh after tool metadata changes.

## Tools and boundaries

- Discovery: `pti_health`, `pti_apps_list`, `pti_app_context`.
- Generic Firestore: list collections, get, bounded query, create, update, batch, delete. Hosted paths must belong to the connected UID. Update tokens prevent stale writes; deletes require exact path confirmation.
- SEFPO: compact search/context/change retrieval, draft creation, status transitions, links and inbox capture.
- Daily Intelligence: `personal_context` reads preferences, explicit feedback and opted-in thread titles; `personal_publish` validates five items and checks pause, topic selection, generation and preference version transactionally. Existing scheduled agents should use these tools; no new schedule is created.
- Authentication keys and OAuth storage cannot be read or changed by data tools. Audit records are server-managed.

Verify locally: `npm run build && npm test`; also `node --test ../../personal-harness/core.test.mjs`.

## Current deployment blocker (29 September 2026)

Live billing and Cloud Run deployment permissions passed. The existing Firebase identity can read the existing image repository but lacks image-upload permission. An owner can grant **Artifact Registry Writer only on that repository**:

```bash
gcloud artifacts repositories add-iam-policy-binding firebaseapphosting-images \
  --project=pti-app-2ab59 --location=asia-east1 \
  --member=serviceAccount:firebase-adminsdk-fbsvc@pti-app-2ab59.iam.gserviceaccount.com \
  --role=roles/artifactregistry.writer
```

Then rerun the failed `PTI shared MCP` deployment job. No new key, database, billing change or project-wide administrator role is required. Until deployment and OAuth linking succeed, do not claim the ChatGPT plugin is installed.
