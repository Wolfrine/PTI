$ErrorActionPreference = 'Stop'
$installRoot = if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'active.json') -PathType Leaf) { $PSScriptRoot } else { 'H:\Workspace\Runtimes\PTI\codex-usage-monitor' }
& (Join-Path $installRoot 'run.ps1') -Command setup
exit $LASTEXITCODE
