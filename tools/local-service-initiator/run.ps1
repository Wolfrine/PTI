$ErrorActionPreference = 'Stop'
$installRoot = $PSScriptRoot
$active = Get-Content -LiteralPath (Join-Path $installRoot 'active.json') -Raw | ConvertFrom-Json
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $installRoot ([string]$active.release)))
if (-not $releaseRoot.StartsWith(([IO.Path]::GetFullPath((Join-Path $installRoot 'releases')) + '\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid release path.' }
$mutex = [Threading.Mutex]::new($false, ('Local\PTI-Local-Service-Initiator-' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value))
$owned = $false
try {
    try { $owned = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned = $true }
    if (-not $owned) { exit 0 }
    & ([string]$active.nodePath) (Join-Path $releaseRoot 'src\main.mjs') (Join-Path $installRoot 'settings.json')
    $result = $LASTEXITCODE
} finally { if ($owned) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
exit $result
