$ErrorActionPreference = 'Stop'
$installRoot = 'F:\Workspace\Support\PTI\codex-usage-monitor'
& (Join-Path $installRoot 'run.ps1') -Command setup
exit $LASTEXITCODE
