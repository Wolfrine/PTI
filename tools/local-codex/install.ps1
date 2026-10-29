param([switch]$NoSchedule)
$ErrorActionPreference = 'Stop'
$installRoot = [IO.Path]::GetFullPath('F:\Workspace\Support\LocalCodexBridge')
if ((Test-Path -LiteralPath $installRoot) -and ((Get-Item -LiteralPath $installRoot).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Install root must not be a junction.' }
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
if (Test-Path -LiteralPath (Join-Path $installRoot 'active.json')) { & (Join-Path $PSScriptRoot 'stop.ps1') }
$protectModule = Join-Path $PSScriptRoot '..\codex-usage-monitor\src\dpapi.mjs'
& $nodePath --input-type=module -e "const {pathToFileURL}=await import('node:url'); const {WindowsProtection}=await import(pathToFileURL(process.argv[1])); await new WindowsProtection().secureDirectory(process.argv[2]);" $protectModule $installRoot
if ($LASTEXITCODE -ne 0) { throw 'Cannot secure private worker directory.' }
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json).version
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddHHmmss')
$releaseName = $version + '-' + $stamp
$release = Join-Path $installRoot ('releases\' + $releaseName)
New-Item -ItemType Directory -Path $release -Force | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot 'dist\*') -Destination $release -Force
if (-not (Test-Path -LiteralPath (Join-Path $installRoot 'config.json'))) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'config.example.json') -Destination (Join-Path $installRoot 'config.json') }
foreach ($file in @('run.ps1','run-hidden.vbs','stop.ps1')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $installRoot -Force }
$active = @{version=$version; release=('releases\' + $releaseName); nodePath=$nodePath; installedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $installRoot 'active.json'), $active)
if ($NoSchedule) { Write-Output 'Worker installed; schedule unchanged.'; exit 0 }
if (-not (Test-Path -LiteralPath (Join-Path $installRoot 'data\credential.json'))) { throw 'Pair the worker with run.ps1 -Command setup before scheduling.' }
$taskName = 'PTI Local Codex Relay'
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\wscript.exe') -Argument ('//B //NoLogo "' + (Join-Path $installRoot 'run-hidden.vbs') + '"') -WorkingDirectory $installRoot
$triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $currentUser),(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Private outbound Local Codex job relay using the signed-in Windows user and ChatGPT subscription.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output 'PTI Local Codex Relay scheduled with a windowless launcher.'
