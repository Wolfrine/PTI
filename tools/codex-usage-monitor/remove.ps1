$ErrorActionPreference = 'Stop'
$installRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'PTI\codex-usage-monitor'))
$expectedRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'PTI\codex-usage-monitor'))
if ($installRoot -ne $expectedRoot -or -not $installRoot.StartsWith(([IO.Path]::GetFullPath($env:LOCALAPPDATA) + '\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected removal target.' }
$task = Get-ScheduledTask -TaskName 'PTI Codex Usage Monitor' -ErrorAction SilentlyContinue
if ($task) { Stop-ScheduledTask -TaskName $task.TaskName; Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false }
if (Test-Path -LiteralPath $installRoot) {
  if ((Get-Item -LiteralPath $installRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing to remove a junction.' }
  Remove-Item -LiteralPath $installRoot -Recurse -Force
}
Write-Output 'Removed the monitor task, installed runtime and encrypted local credential. Retained PTI readings will become stale.'
