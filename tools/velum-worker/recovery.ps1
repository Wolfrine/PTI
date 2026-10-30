param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference = 'Stop'
try {
    $worker = Get-ScheduledTask -TaskName 'PTI Velum Studio Worker' -ErrorAction SilentlyContinue
    if (!$worker -or $worker.State -eq 'Running' -or $worker.State -eq 'Disabled') { exit 0 }
    if (!(Test-Path -LiteralPath $NodePath) -or [IO.Path]::GetFileName($NodePath) -ne 'node.exe') { exit 1 }
    & $NodePath (Join-Path $PSScriptRoot 'recovery.mjs')
    exit $LASTEXITCODE
} catch { exit 1 }
