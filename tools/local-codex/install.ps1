param([switch]$NoSchedule,[string]$InstallRoot = 'H:\LocalCodexBridge')
$ErrorActionPreference = 'Stop'
$installRoot = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
if ($installRoot -ne 'H:\LocalCodexBridge') { throw 'New releases use H:\LocalCodexBridge. The F: installation is retained only for existing work.' }
if ((Test-Path -LiteralPath $installRoot) -and ((Get-Item -LiteralPath $installRoot).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Install root must not be redirected.' }
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$payloadFiles = @('server.mjs','worker.mjs','relay.mjs','setup.mjs','pair-existing.mjs','review-usage.mjs','THIRD-PARTY-NOTICES.txt')
$payloadRoot = Join-Path $PSScriptRoot 'dist'
$resolvedPayload = (Get-Item -LiteralPath $payloadRoot).Target
if ($resolvedPayload -is [array]) { $resolvedPayload = $resolvedPayload[0] }
if (-not $resolvedPayload -or -not ([IO.Path]::GetFullPath([string]$resolvedPayload)).StartsWith('H:\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Build payload must resolve to its verified H: output directory.' }
$payloadHashes = @{}
foreach ($file in $payloadFiles) { $payloadHashes[$file] = (Get-FileHash -LiteralPath (Join-Path $payloadRoot $file) -Algorithm SHA256).Hash }
$protectModule = Join-Path $PSScriptRoot '..\codex-usage-monitor\src\dpapi.mjs'
& $nodePath --input-type=module -e "const {pathToFileURL}=await import('node:url'); const {WindowsProtection}=await import(pathToFileURL(process.argv[1])); await new WindowsProtection().secureDirectory(process.argv[2]);" $protectModule $installRoot
if ($LASTEXITCODE -ne 0) { throw 'Cannot secure the private runtime directory.' }
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json).version
$sourceSha = (& git -C $PSScriptRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify release source revision.' }
$releaseName = $version + '-' + [DateTime]::UtcNow.ToString('yyyyMMddHHmmss')
$release = Join-Path $installRoot ('releases\' + $releaseName)
New-Item -ItemType Directory -Path $release -ErrorAction Stop | Out-Null
foreach ($file in $payloadFiles) {
  $destination = Join-Path $release $file
  Copy-Item -LiteralPath (Join-Path $payloadRoot $file) -Destination $destination -ErrorAction Stop
  if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $payloadHashes[$file]) { throw ('Installed payload hash mismatch: ' + $file) }
}
if (-not (Test-Path -LiteralPath (Join-Path $installRoot 'config.json'))) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'config.example.json') -Destination (Join-Path $installRoot 'config.json') }
foreach ($file in @('run.ps1','run-hidden.vbs','stop.ps1')) {
  $source = Join-Path $PSScriptRoot $file
  $destination = Join-Path $installRoot $file
  Copy-Item -LiteralPath $source -Destination $destination -Force
  if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash) { throw ('Installed launcher hash mismatch: ' + $file) }
}
# Existing native workers retain their installed executable. This pointer change
# neither interrupts them nor replays their requests. Config and credentials stay.
$active = @{version=$version;release=('releases\' + $releaseName);nodePath=$nodePath;sourceSha=$sourceSha;payloadSHA256=$payloadHashes;installedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText((Join-Path $installRoot 'active.json'),$active)
if ($NoSchedule) { Write-Output ('Verified seven-file release installed: ' + $version + ' source ' + $sourceSha + '; scheduled launcher unchanged.'); exit 0 }
$taskName = 'PTI Local Codex Relay'
$scheduled = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $scheduled) { throw 'No existing relay task is available. Release is staged; creating a scheduler task requires separate owner authorization.' }
$action = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\wscript.exe') -Argument ('//B //NoLogo "' + (Join-Path $installRoot 'run-hidden.vbs') + '"') -WorkingDirectory $installRoot
Set-ScheduledTask -TaskName $taskName -Action $action | Out-Null
Write-Output 'Verified release installed and existing task action retargeted. Triggers, principal, settings and active native work were preserved. Verify the next actual scheduled invocation and hosted heartbeat.'
