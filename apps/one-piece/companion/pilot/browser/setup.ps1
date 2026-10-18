$ErrorActionPreference = 'Stop'
$pilotRuntime = 'H:/PTI-OnePiece/pilot/browser-native'
New-Item -ItemType Directory -Path $pilotRuntime -Force | Out-Null
Copy-Item -LiteralPath "$PSScriptRoot/package.json" -Destination "$pilotRuntime/package.json"
Copy-Item -LiteralPath "$PSScriptRoot/package-lock.json" -Destination "$pilotRuntime/package-lock.json"
& npm.cmd ci --prefix $pilotRuntime --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {throw 'Pilot dependency installation failed'}
New-Item -ItemType Directory -Path "$pilotRuntime/bundle" -Force | Out-Null
& "$pilotRuntime/node_modules/.bin/esbuild.cmd" "$pilotRuntime/node_modules/jassub/dist/jassub.js" --bundle --format=esm --platform=browser "--outfile=$pilotRuntime/bundle/jassub.js"
if ($LASTEXITCODE -ne 0) {throw 'JASSUB main bundle failed'}
& "$pilotRuntime/node_modules/.bin/esbuild.cmd" "$pilotRuntime/node_modules/jassub/dist/worker/worker.js" --bundle --format=esm --platform=browser "--outfile=$pilotRuntime/bundle/jassub-worker.js"
if ($LASTEXITCODE -ne 0) {throw 'JASSUB worker bundle failed'}
& python -m pip install --disable-pip-version-check --target "$pilotRuntime/python" python-vlc==3.0.21203
if ($LASTEXITCODE -ne 0) {throw 'python-vlc installation failed'}
Write-Output 'Pilot dependencies ready. This script does not install a service or deploy PTI.'
