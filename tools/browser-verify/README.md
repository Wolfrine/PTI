# Browser verification for owner-operated apps

Use this local, one-shot command for a route and an optional harmless click or tap. It uses the Microsoft Playwright library with its pinned Chromium build. Each viewport gets a fresh browser context. The browser runs headless with its sandbox enabled and closes when the command finishes. The command runs directly from a PTI checkout, including from a fresh native `codex exec` invocation. [Playwright browser installation](https://playwright.dev/docs/browsers) · [Context isolation](https://playwright.dev/docs/browser-contexts)

## Install or update the local runtime

Use Node.js 20 or newer and run this from the PTI checkout in PowerShell. The npm installation and browser download both write to H:. Re-run after a change to the pinned lockfile.

```powershell
$runtime = 'H:\Workspace\Runtimes\PTI\browser-verify'
$env:TEMP = 'H:\Workspace\Temp\PTI\browser-verify'
$env:TMP = $env:TEMP
$env:npm_config_cache = 'H:\Workspace\Caches\PTI\browser-verify-npm'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $runtime 'chromium'
New-Item -ItemType Directory -Force -Path $runtime,$env:TEMP,$env:npm_config_cache | Out-Null
Copy-Item -Path 'tools\browser-verify\package.json','tools\browser-verify\package-lock.json' -Destination $runtime
Push-Location $runtime
try {
    npm.cmd ci --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Playwright dependency install failed.' }
    node .\node_modules\playwright\cli.js install chromium --no-shell
    if ($LASTEXITCODE -ne 0) { throw 'Chromium install failed.' }
} finally {
    Pop-Location
}
```

## Run from a native Codex task or PowerShell

Pick the exact owner-authorized route for the task. Start local development with the project's normal launcher on an explicit `127.0.0.1` port of 1024 or higher. Use `--ready` for a visible app-ready marker and `--after` for a visible result of a click. Each locator must resolve to one element. Example commands from the PTI root follow.

```powershell
node tools/browser-verify/verify.mjs --app pti --url https://pti-app-2ab59.web.app/home
node tools/browser-verify/verify.mjs --app gtop --url https://gtop-app.web.app/ --click '.motion-control' --after '.motion-control[aria-pressed=true]'
node tools/browser-verify/verify.mjs --app local --url http://127.0.0.1:43183/ --ready '#swordsman' --click '#swordsman' --after 'body:has(#welcome[hidden]) #zone' --webgl
```

| `--app` | Approved starting origins |
| --- | --- |
| `pti` | `https://pti-app-2ab59.web.app` |
| `taleweald` | `https://taleweald.firebaseapp.com`, `https://taleweald.web.app` |
| `gtop` | `https://gtop-app.web.app` |
| `local` | `http://127.0.0.1:<explicit-port>` for the app under review |

Desktop is 1440×900 and mobile is 390×844 with touch emulation. `--view desktop` or `--view mobile` selects one. The default runs both. `--webgl` clears a separate canvas and reads a pixel from WebGL and WebGL2. The receipt records the renderer, the pixel, and the app's canvas sizes. A working probe establishes browser capability. Inspect the app screenshot and its renderer evidence before claiming the app used WebGL.

The command prints the path to `receipt.json` in a new directory under `H:\Workspace\Reports\PTI\browser-verify`. It records the initial HTTP status, final route, viewport and overflow, denied request counts, page exception count, before/after PNG paths and their SHA-256 hashes. Inspect the PNGs and confirm the observed change. A capture can contain a broken layout, missing dependency, or signed-out screen. A nonzero exit identifies an incomplete run. Screenshots can contain app data, so retain them locally unless sharing is explicitly authorized.

If a Windows native shell returns without a receipt, treat the run as incomplete. For a shell process failure, use `Start-Process` with `-Wait`, `-PassThru`, `-WindowStyle Hidden`, the PTI working directory, and stdout and stderr paths on H:. Read the child exit code and the emitted receipt. A site or policy denial ends the denied action.

## Scope and permissions

- Use trusted owner app pages and an action whose effect is known in advance. Good actions include opening an in-page panel, using the public sample quiz, and selecting a character in a local, disposable game. Use a live login, production edit, transaction, or account action only through its own separately authorized workflow.
- The selected origin admits GET and HEAD only. The hosted profiles also admit narrowly scoped Google Fonts and static Firebase SDK files. The verifier blocks HTTP redirects before fetching their destinations, including same-origin redirects. Use a known canonical URL when the server issues a redirect. Same-origin client-side navigation can render normally. Firebase reserved endpoints, secondary pages, frame navigations, WebSockets, service workers, and downloads are restricted. The request guard is scoped to Playwright page traffic and intended for trusted applications. It is not an OS network sandbox.
- Keep account credentials, personal browser profiles, authenticated state and private URLs out of the invocation. The command accepts no profile or storage state and launches no browser server. An existing Desktop tool denial still governs the denied target or action. This tool is for independently authorized app QA.
- For the Google Developer Program benefit investigation, use the published benefits rules. For an already authorized Cloud Billing project, use `gcloud billing projects describe PROJECT_ID` or Cloud Billing `projects.getBillingInfo` to check billing linkage. Use the existing approved Cloud Billing export for applied credits if available. These reads leave account eligibility, unclaimed credits, and redemption unverified. [Benefits FAQ](https://developers.google.com/profile/help/benefits) · [Cloud Billing API](https://docs.cloud.google.com/billing/docs/reference/rest/v1/projects/getBillingInfo) · [Billing export data](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/standard-usage)
