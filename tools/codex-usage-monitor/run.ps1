param([ValidateSet('run','status','setup','probe')][string]$Command = 'run')
$ErrorActionPreference = 'Stop'
$installRoot = if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'active.json') -PathType Leaf) { $PSScriptRoot } else { 'F:\Workspace\Support\PTI\codex-usage-monitor' }
$active = Get-Content -LiteralPath (Join-Path $installRoot 'active.json') -Raw | ConvertFrom-Json
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $installRoot ([string]$active.release)))
if (-not $releaseRoot.StartsWith(([IO.Path]::GetFullPath((Join-Path $installRoot 'releases')) + '\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid installed release path.' }
$nodePath = [string]$active.nodePath
if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) { throw 'Node.js is missing. Run install.ps1 again.' }
$identitySid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutex = [Threading.Mutex]::new($false, ('Local\PTI-Codex-Usage-' + $identitySid))
$owned = $false
try {
  try { $owned = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned = $true }
  if (-not $owned) { Write-Output '{"outcome":"already-running"}'; exit 0 }
  & $nodePath (Join-Path $releaseRoot 'src\cli.mjs') $Command --root (Join-Path $installRoot 'data')
  $resultCode = $LASTEXITCODE
} finally { if ($owned) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
exit $resultCode
