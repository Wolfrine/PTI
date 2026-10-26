param([string]$BuildDirectory='F:\Workspace\Support\PTI\native-launcher-build',[string]$Output='F:\Workspace\Support\PTI\native-launcher-build\probe.json')
$ErrorActionPreference='Stop'
$helper=Join-Path ([IO.Path]::GetFullPath($BuildDirectory)) 'PTI.LocalServiceHost.exe'
$probeOutput=[IO.Path]::GetFullPath($Output)
if (!$probeOutput.StartsWith('F:\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Probe output must be on F.' }
# WinExe starts without a console; it launches only its fixed companion with CREATE_NO_WINDOW.
$child=Start-Process -FilePath $helper -ArgumentList @('--probe',('"'+$probeOutput+'"')) -WindowStyle Hidden -PassThru -Wait
if ($child.ExitCode -ne 0) { throw 'Native no-console probe failed.' }
$result=Get-Content -LiteralPath $probeOutput -Raw | ConvertFrom-Json
if (!$result.passed -or $result.childConsoleWindow -ne 0 -or $result.inputDesktopBefore -ne $result.inputDesktopAfter) { throw 'Native no-console probe did not pass.' }
$result | ConvertTo-Json
