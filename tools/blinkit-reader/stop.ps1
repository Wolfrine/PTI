$ErrorActionPreference='Stop'
$root=$PSScriptRoot
[IO.File]::WriteAllText((Join-Path $root 'data\stop.request'),'stop')
$deadline=(Get-Date).AddSeconds(45)
while((Test-Path -LiteralPath (Join-Path $root 'data\worker.lock')) -and (Get-Date) -lt $deadline){Start-Sleep -Seconds 1}
if(Test-Path -LiteralPath (Join-Path $root 'data\worker.lock')){throw 'Reader has not stopped gracefully. No process was killed.'}
Write-Output 'Blinkit reader stopped gracefully; other services untouched.'
