$ErrorActionPreference = 'Stop'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$launcher = Join-Path $PSScriptRoot 'run-worker.vbs'
# Windowless from creation; no task, persistent credential, or existing service changes.
Start-Process -FilePath 'wscript.exe' -ArgumentList @('//B','//NoLogo',('"' + $launcher + '"'),('"' + $node + '"')) -WindowStyle Hidden
Write-Output 'Velum worker starting. Open its local pairing page from tools/velum-worker/.runtime/pairing-url.txt and sign in to PTI. The link expires in ten minutes.'
