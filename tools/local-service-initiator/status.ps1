$ErrorActionPreference = 'Stop'
$installRoot = 'F:\Workspace\Support\PTI\local-service-initiator'
$task = Get-ScheduledTask -TaskName 'PTI Local Service Initiator' -ErrorAction SilentlyContinue
$info = if ($task) { Get-ScheduledTaskInfo -TaskName $task.TaskName }
$statusPath = Join-Path $installRoot 'data\status.json'
$onePiecePath = Join-Path $installRoot 'data\one-piece-status.json'
[PSCustomObject]@{taskState=$task.State;lastRunTime=$info.LastRunTime;lastTaskResult=$info.LastTaskResult;status=$(if(Test-Path -LiteralPath $statusPath){Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json});onePiece=$(if(Test-Path -LiteralPath $onePiecePath){Get-Content -LiteralPath $onePiecePath -Raw | ConvertFrom-Json})} | ConvertTo-Json -Depth 5
