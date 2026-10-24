$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName 'PTI Codex Usage Monitor' -ErrorAction SilentlyContinue
if ($task) { $info = Get-ScheduledTaskInfo -TaskName $task.TaskName; @{ taskName=$task.TaskName; state=[string]$task.State; lastRunTime=[string]$info.LastRunTime; lastTaskResult=$info.LastTaskResult; nextRunTime=[string]$info.NextRunTime } | ConvertTo-Json }
else { Write-Output 'Windows task is not installed.' }
$installRoot = Join-Path $env:LOCALAPPDATA 'PTI\codex-usage-monitor'
if (Test-Path -LiteralPath (Join-Path $installRoot 'active.json')) { & (Join-Path $installRoot 'run.ps1') -Command status }
