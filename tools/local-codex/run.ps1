param([ValidateSet('relay','setup')][string]$Command = 'relay',[string]$InstallRoot)
$ErrorActionPreference = 'Stop'
$legacyRoot = [IO.Path]::GetFullPath('F:\Workspace\Support\LocalCodexBridge').TrimEnd('\')
$hRoot = [IO.Path]::GetFullPath('H:\LocalCodexBridge').TrimEnd('\')
$installRoot = if ($InstallRoot) { [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\') } elseif ($PSScriptRoot -in @($legacyRoot,$hRoot)) { $PSScriptRoot } else { $hRoot }
if ($installRoot -notin @($legacyRoot,$hRoot)) { throw 'Use the approved H: root or retained F: compatibility installation.' }
if ((Get-Item -LiteralPath $installRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Bridge root cannot be a junction or symlink.' }
$active = Get-Content -LiteralPath (Join-Path $installRoot 'active.json') -Raw | ConvertFrom-Json
$release = [IO.Path]::GetFullPath((Join-Path $installRoot ([string]$active.release)))
if (-not $release.StartsWith(($installRoot + '\releases\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid installed release.' }
$env:LOCAL_CODEX_BRIDGE_HOME = $installRoot
if ($active.sourceSha) { $env:LOCAL_CODEX_SOURCE_SHA = [string]$active.sourceSha }
& ([string]$active.nodePath) (Join-Path $release ($Command + '.mjs'))
exit $LASTEXITCODE
