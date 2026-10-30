param([switch]$NoStart, [string]$NativeAuthConfig)
$ErrorActionPreference = 'Stop'
$taskName = 'PTI Velum Studio Worker'
$recoveryTaskName = 'PTI Velum Studio Recovery'
$runtime = Join-Path $PSScriptRoot '.runtime'
if ((Get-Item -LiteralPath $PSScriptRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Worker source cannot be a junction.' }
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
$account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls $runtime /inheritance:r /grant:r ($account + ':(OI)(CI)F') 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect worker state.' }
$node = (Get-Command node.exe -ErrorAction Stop).Source
$nativeConfig = Join-Path $runtime 'native-auth.json'
if (!$NativeAuthConfig) { $NativeAuthConfig = $nativeConfig }
& $node --input-type=module -e 'const {nativeAuthKey}=await import(process.argv[1]); nativeAuthKey(process.argv[2]);' ([Uri](Join-Path $PSScriptRoot 'session.mjs')).AbsoluteUri $NativeAuthConfig
if ($LASTEXITCODE -ne 0) { throw 'Verified dedicated native Firebase auth configuration is required. Browser keys are not a fallback.' }
if ([IO.Path]::GetFullPath($NativeAuthConfig) -ne [IO.Path]::GetFullPath($nativeConfig)) { Copy-Item -LiteralPath $NativeAuthConfig -Destination $nativeConfig -Force }
$hostPath = Join-Path $runtime 'VelumWorkerHost.exe'
$compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'Installed Windows .NET compiler is required.' }
$sourceHash = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'VelumWorkerHost.cs')).Hash
$previousTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $hostPath) {
    if (!$previousTask -or !$previousTask.Description.Contains('host-source-sha256=' + $sourceHash)) {
        throw 'Host source changed or registration is missing; review only Velum before replacing its launcher.'
    }
} else {
    & $compiler /nologo /target:winexe ('/out:' + $hostPath) (Join-Path $PSScriptRoot 'VelumWorkerHost.cs')
    if ($LASTEXITCODE -ne 0) { throw 'Could not build windowless host.' }
}
$action = New-ScheduledTaskAction -Execute $hostPath -Argument ('"' + $node + '" "' + (Join-Path $PSScriptRoot 'worker.mjs') + '"') -WorkingDirectory $PSScriptRoot
$triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $account),(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description ('Dedicated owner-approved Velum device; outbound Firebase queue; no inference while idle; logon and one-minute recovery. host-source-sha256=' + $sourceHash) -Force | Out-Null
$recoveryScript = Join-Path $PSScriptRoot 'recovery.ps1'
if (!(Test-Path -LiteralPath $recoveryScript) -or !(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'recovery.mjs'))) { throw 'Velum recovery helper is missing.' }
$scriptHost = Join-Path $env:SystemRoot 'System32\wscript.exe'
$recoveryLauncher = Join-Path $PSScriptRoot 'run-recovery.vbs'
if (!(Test-Path -LiteralPath $scriptHost) -or !(Test-Path -LiteralPath $recoveryLauncher)) { throw 'Windowless recovery launcher is missing.' }
$recoveryAction = New-ScheduledTaskAction -Execute $scriptHost -Argument ('//B //NoLogo "' + $recoveryLauncher + '" "' + $node + '"') -WorkingDirectory $PSScriptRoot
$recoverySettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Seconds 45) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $recoveryTaskName -Action $recoveryAction -Trigger $triggers -Settings $recoverySettings -Principal $principal -Description 'Fixed-purpose owner-approved Velum start request: checks private Firestore and starts only the installed Velum worker task. No arbitrary commands.' -Force | Out-Null
if (!$NoStart) { Start-ScheduledTask -TaskName $taskName }
Write-Output 'Velum auto-start and remote recovery helper installed for this Windows user. They run while signed in, including locked. A sleeping or powered-off PC cannot be started remotely; no pre-logon service is installed.'
