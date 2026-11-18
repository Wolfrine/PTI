$ErrorActionPreference = 'Stop'
$installRoot = [IO.Path]::GetFullPath('H:\Workspace\Runtimes\PTI\codex-usage-monitor')
$expectedRoot = [IO.Path]::GetFullPath('H:\Workspace\Runtimes\PTI\codex-usage-monitor')
if ($installRoot -ne $expectedRoot -or -not $installRoot.StartsWith('H:\Workspace\Runtimes\PTI\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected removal target.' }
$task = Get-ScheduledTask -TaskName 'PTI Codex Usage Monitor' -ErrorAction SilentlyContinue
if ($task -and (@($task.Actions).Count -ne 1 -or $task.Actions[0].WorkingDirectory -ne $installRoot -or $task.Actions[0].Arguments -ne ('//B //NoLogo "' + (Join-Path $installRoot 'run-hidden.vbs') + '"'))) { throw 'Task points at another installation; nothing removed.' }
if ($task) { Stop-ScheduledTask -TaskName $task.TaskName; Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false }
if (Test-Path -LiteralPath $installRoot) {
  if ((Get-Item -LiteralPath $installRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing to remove a junction.' }
  $ancestor = Split-Path -Parent $installRoot
  while ($ancestor) {
    if ((Get-Item -LiteralPath $ancestor).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing removal through a junction ancestor.' }
    $ancestor = Split-Path -Parent $ancestor
  }
  Remove-Item -LiteralPath $installRoot -Recurse -Force
}
$legacyRoot = Join-Path $env:LOCALAPPDATA 'PTI\codex-usage-monitor'
$legacy = Get-Item -LiteralPath $legacyRoot -Force -ErrorAction SilentlyContinue
if ($legacy -and $legacy.LinkType -eq 'Junction' -and [IO.Path]::GetFullPath([string]$legacy.Target) -eq $installRoot) { [IO.Directory]::Delete($legacyRoot) }
Write-Output 'Removed the monitor task, installed runtime and encrypted local credential. Retained PTI readings will become stale.'
