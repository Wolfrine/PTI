param([switch]$NoStart)
$ErrorActionPreference='Stop'
$root='F:\Workspace\Support\PTI\blinkit-reader'
if((Test-Path -LiteralPath $root) -and ((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Runtime must be a physical F directory.'}
$node='F:\Workspace\Support\tools\node-24\node.exe';$npm='F:\Workspace\Support\tools\node-24\npm.cmd';$chrome='C:\Program Files\Google\Chrome\Application\chrome.exe'
foreach($path in @($node,$npm,$chrome)){if(!(Test-Path -LiteralPath $path)){throw 'Required installed Node/Chrome runtime is unavailable.'}}
if(Test-Path -LiteralPath (Join-Path $root 'active.json')){& (Join-Path $root 'stop.ps1')}
New-Item -ItemType Directory -Path (Join-Path $root 'data') -Force | Out-Null
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $root /inheritance:r /grant:r ($sid+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Private runtime ACL was not applied.'}
$revision=(& git -C $PSScriptRoot rev-parse --short HEAD).Trim();$name='1.0.0-'+$revision;$release=Join-Path $root ('releases\'+$name)
New-Item -ItemType Directory -Path $release -Force | Out-Null
Push-Location $PSScriptRoot
try{& $node scripts/build.mjs;if($LASTEXITCODE -ne 0){throw 'Canonical bundle failed.'}}finally{Pop-Location}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'src') -Destination $release -Recurse -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'package.json'),(Join-Path $PSScriptRoot 'package-lock.json') -Destination $release -Force
Push-Location $release
try{& $npm ci --ignore-scripts --omit=dev --no-audit --no-fund;if($LASTEXITCODE -ne 0){throw 'Reader dependencies failed.'}}finally{Pop-Location}
foreach($file in @('run.ps1','run-hidden.vbs','setup.ps1','status.ps1','stop.ps1','resume.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $root $file) -Force}
$active=@{version='1.0.0';release=('releases\'+$name);nodePath=$node;chromePath=$chrome;installedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $root 'active.json'),$active)
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$action=New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\wscript.exe') -Argument ('//B //NoLogo "'+(Join-Path $root 'run-hidden.vbs')+'"') -WorkingDirectory $root
$triggers=@((New-ScheduledTaskTrigger -AtLogOn -User $user),(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)))
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'PTI Blinkit Reader' -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Owner-authorized first-party Blinkit payment-event reader. No mail access, inference, source scraping or purchases.' -Force | Out-Null
$flag=Join-Path $root 'data\stop.request';if(Test-Path -LiteralPath $flag){Remove-Item -LiteralPath $flag}
if(!$NoStart){Start-ScheduledTask -TaskName 'PTI Blinkit Reader'}
Write-Output 'Installed windowless PTI Blinkit Reader. Auth/readback acceptance remains separate; use status.ps1.'
