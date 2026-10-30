param([switch]$NoStart)
$ErrorActionPreference = 'Stop'
$taskName = 'PTI Velum Studio Worker'
$runtime = Join-Path $PSScriptRoot '.runtime'
if ((Get-Item -LiteralPath $PSScriptRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Worker source cannot be a junction.' }
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
$account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls $runtime /inheritance:r /grant:r ($account + ':(OI)(CI)F') 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect worker state.' }
$node = (Get-Command node.exe -ErrorAction Stop).Source
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
if (!$NoStart) { Start-ScheduledTask -TaskName $taskName }
Write-Output 'Velum auto-start installed for this Windows user. It runs while signed in, including locked; pre-logon startup requires an administrator service setup. Approve this PC only from Velum Studio.'
