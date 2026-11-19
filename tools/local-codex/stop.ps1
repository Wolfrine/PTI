param([string]$InstallRoot = 'H:\LocalCodexBridge')
$ErrorActionPreference = 'Stop'
$installRoot = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
if ($installRoot -notin @('H:\LocalCodexBridge','F:\Workspace\Support\LocalCodexBridge')) { throw 'Use an approved Local Codex runtime root.' }
if ((Get-Item -LiteralPath $installRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Runtime root must not be redirected.' }
$statusFile = Join-Path $installRoot 'data\status.json'
$legacyPidFile = Join-Path $installRoot 'data\relay.lock'
$relayPid = if (Test-Path -LiteralPath $statusFile) { [int](Get-Content -LiteralPath $statusFile -Raw | ConvertFrom-Json).pid } else { 0 }
if (-not $relayPid -and (Test-Path -LiteralPath $legacyPidFile)) { $relayPid = [int](Get-Content -LiteralPath $legacyPidFile -Raw | ConvertFrom-Json).pid }
if ($relayPid) {
  $relayProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $relayPid)
  if ($relayProcess) {
    $active = Get-Content -LiteralPath (Join-Path $installRoot 'active.json') -Raw | ConvertFrom-Json
    if ($relayProcess.ExecutablePath -ne [string]$active.nodePath -or $relayProcess.CommandLine -notlike ('*' + $installRoot + '\releases\*') -or $relayProcess.CommandLine -notmatch 'relay\.mjs"?$') { throw 'Observed PID is not this installation relay.' }
    # Terminate only the transport process. Never terminate its tree: native
    # workers and the previous supervisor may still own authorized active work.
    Stop-Process -Id $relayPid -ErrorAction Stop
  }
}
Write-Output 'Relay transport stopped; detached native work was not cancelled.'
