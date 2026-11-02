$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'stop.ps1')
$active=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'active.json') -Raw | ConvertFrom-Json
Write-Output 'In the dedicated Chrome window, complete any normal human verification and Blinkit phone/OTP sign-in directly in the site. Sign in to Morsel with the approved Google account. Never paste codes into chat. Close this dedicated browser window when finished; the reader resumes automatically.'
$browserArguments=@('--user-data-dir="'+(Join-Path $PSScriptRoot 'browser-profile')+'"','--enable-features=WebMCP','--new-window','https://blinkit.com/','https://pti-app-2ab59-morsel.web.app/')
Start-Process -FilePath $active.chromePath -ArgumentList $browserArguments -WindowStyle Normal -Wait
& (Join-Path $PSScriptRoot 'resume.ps1')
