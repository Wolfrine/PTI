param([ValidateSet('relay','setup')][string]$Command = 'relay')
$ErrorActionPreference = 'Stop'
$installRoot = 'F:\Workspace\Support\LocalCodexBridge'
$active = Get-Content -LiteralPath (Join-Path $installRoot 'active.json') -Raw | ConvertFrom-Json
$release = [IO.Path]::GetFullPath((Join-Path $installRoot ([string]$active.release)))
if (-not $release.StartsWith(($installRoot + '\releases\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid installed release.' }
$env:LOCAL_CODEX_BRIDGE_HOME = $installRoot
& ([string]$active.nodePath) (Join-Path $release ($Command + '.mjs'))
exit $LASTEXITCODE
