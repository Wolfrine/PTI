$ErrorActionPreference = 'Stop'
$installRoot = Join-Path $env:LOCALAPPDATA 'PTI\codex-usage-monitor'
& (Join-Path $installRoot 'run.ps1') -Command setup
exit $LASTEXITCODE
