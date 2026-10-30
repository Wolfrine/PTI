$ErrorActionPreference = 'Stop'
if (!(Get-ScheduledTask -TaskName 'PTI Velum Studio Worker' -ErrorAction SilentlyContinue)) {
    & (Join-Path $PSScriptRoot 'install.ps1')
} else {
    Start-ScheduledTask -TaskName 'PTI Velum Studio Worker'
    Write-Output 'Velum worker requested. Existing device authentication is restored automatically; approval and revocation are remote in Velum Studio.'
}
