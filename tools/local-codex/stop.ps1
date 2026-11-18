param([string]$InstallRoot)
$ErrorActionPreference = 'Stop'
$legacyRoot = [IO.Path]::GetFullPath('F:\Workspace\Support\LocalCodexBridge').TrimEnd('\')
$hRoot = [IO.Path]::GetFullPath('H:\LocalCodexBridge').TrimEnd('\')
$installRoot = if ($InstallRoot) { [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\') } elseif ($PSScriptRoot -in @($legacyRoot,$hRoot)) { $PSScriptRoot } else { $legacyRoot }
if ($installRoot -notin @($legacyRoot,$hRoot)) { throw 'Use the approved F: or H: Local Codex bridge root.' }
if ((Get-Item -LiteralPath $installRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Bridge root cannot be a junction or symlink.' }
$stateFile = Join-Path $installRoot 'data\relay-state.json'
if (Test-Path -LiteralPath $stateFile) {
  $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
  if (@($state.active | Where-Object { $null -ne $_ }).Count -gt 0) { throw 'Wait for all active Local Codex jobs to finish before stopping or upgrading. Do not cancel unrelated owner work.' }
}
$scheduled = Get-ScheduledTask -TaskName 'PTI Local Codex Relay' -ErrorAction SilentlyContinue
if ($scheduled) {
  if (@($scheduled.Actions).Count -ne 1 -or $scheduled.Actions[0].WorkingDirectory -ne $installRoot -or $scheduled.Actions[0].Arguments -notlike ('*' + (Join-Path $installRoot 'run-hidden.vbs') + '*')) {
    throw 'Scheduled relay action does not belong to this installation; preserve the other root.'
  }
  Stop-ScheduledTask -TaskName 'PTI Local Codex Relay'
}
# Task Scheduler can stop WScript without its Node descendants. Verify the exact
# owned relay before terminating its process tree; never match every Node process.
$lockFile = Join-Path $installRoot 'data\relay.lock'
if (Test-Path -LiteralPath $lockFile) {
  $relayPid = [int](Get-Content -LiteralPath $lockFile -Raw | ConvertFrom-Json).pid
  $relayProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $relayPid)
  if ($relayProcess) {
    $active = Get-Content -LiteralPath (Join-Path $installRoot 'active.json') -Raw | ConvertFrom-Json
    if ($relayProcess.ExecutablePath -ne [string]$active.nodePath -or $relayProcess.CommandLine -notlike ('*' + $installRoot + '\releases\*') -or $relayProcess.CommandLine -notmatch 'relay\.mjs"?$') { throw 'Relay PID no longer belongs to this installation.' }
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = Join-Path $env:SystemRoot 'System32\taskkill.exe'
    $startInfo.Arguments = '/PID ' + $relayPid + ' /T /F'
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $stopProcess = [Diagnostics.Process]::Start($startInfo)
    $null = $stopProcess.StandardOutput.ReadToEnd()
    $null = $stopProcess.StandardError.ReadToEnd()
    $stopProcess.WaitForExit()
    if ($stopProcess.ExitCode -ne 0 -and (Get-Process -Id $relayPid -ErrorAction SilentlyContinue)) { throw 'Relay process could not be stopped.' }
  }
}
Write-Output 'Local Codex relay stopped.'
