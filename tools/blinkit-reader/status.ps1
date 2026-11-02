$ErrorActionPreference='Stop'
$status=Join-Path $PSScriptRoot 'data\status.json'
if(Test-Path -LiteralPath $status){Get-Content -LiteralPath $status -Raw}else{Write-Output 'Reader has not published local readiness yet.'}
Get-ScheduledTask -TaskName 'PTI Blinkit Reader' -ErrorAction SilentlyContinue | Select-Object TaskName,State
Get-ScheduledTaskInfo -TaskName 'PTI Blinkit Reader' -ErrorAction SilentlyContinue | Select-Object LastRunTime,LastTaskResult,NextRunTime
