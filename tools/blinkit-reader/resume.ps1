$ErrorActionPreference='Stop'
$flag=Join-Path $PSScriptRoot 'data\stop.request'
if(Test-Path -LiteralPath $flag){Remove-Item -LiteralPath $flag}
Start-ScheduledTask -TaskName 'PTI Blinkit Reader'
Write-Output 'Blinkit reader resumed. Check status.ps1; readiness is not import acceptance.'
