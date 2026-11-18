param([ValidateSet('relay','setup')][string]$Command = 'relay',[string]$InstallRoot)
$ErrorActionPreference = 'Stop'
$legacyRoot = [IO.Path]::GetFullPath('F:\Workspace\Support\LocalCodexBridge').TrimEnd('\')
$hRoot = [IO.Path]::GetFullPath('H:\LocalCodexBridge').TrimEnd('\')
$installRoot = if ($InstallRoot) { [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\') } elseif ($PSScriptRoot -in @($legacyRoot,$hRoot)) { $PSScriptRoot } else { $legacyRoot }
if ($installRoot -notin @($legacyRoot,$hRoot)) { throw 'Use the approved F: or H: Local Codex bridge root.' }
if ((Get-Item -LiteralPath $installRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Bridge root cannot be a junction or symlink.' }
$active = Get-Content -LiteralPath (Join-Path $installRoot 'active.json') -Raw | ConvertFrom-Json
$release = [IO.Path]::GetFullPath((Join-Path $installRoot ([string]$active.release)))
if (-not $release.StartsWith(($installRoot + '\releases\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid installed release.' }
$env:LOCAL_CODEX_BRIDGE_HOME = $installRoot
& ([string]$active.nodePath) (Join-Path $release ($Command + '.mjs'))
exit $LASTEXITCODE
