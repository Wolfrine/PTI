$ErrorActionPreference = 'Stop'
$taskName = 'PTI Local Infrastructure Observer'
$runtime = 'H:\Workspace\Runtimes\PTI\local-infrastructure'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$launcher = Join-Path $runtime 'run-hidden.vbs'
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$arguments = '//B //Nologo "{0}" "{1}"' -f $launcher, $node
$existing = Get-ScheduledTask -TaskPath '\' -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.State -eq 'Running') { throw 'Observer is running. Let this invocation finish before updating its files.' }
  if ($existing.Actions.Count -ne 1 -or $existing.Actions[0].Execute -ne $wscript -or
      $existing.Actions[0].Arguments -notlike "*`"$launcher`"*") { throw 'The scheduled task name is already in use by a different launcher.' }
}
if ((Get-PSDrive H).Free -lt 400MB) { throw 'H: has insufficient space for the observer runtime.' }
$env:TEMP = 'H:\Workspace\Temp'
$env:TMP = $env:TEMP
$env:NPM_CONFIG_CACHE = 'H:\Workspace\Caches\npm'
$env:GOOGLE_CLOUD_QUOTA_PROJECT = 'worldline-intel'
New-Item -ItemType Directory -Path $runtime,$env:TEMP,$env:NPM_CONFIG_CACHE -Force | Out-Null
$files = 'observer.mjs','probe.ps1','run-hidden.vbs','package.json','package-lock.json'
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $runtime $file) }
& $npm ci --prefix $runtime --omit=dev --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE) { throw 'Observer dependencies could not be installed.' }
& $node (Join-Path $runtime 'observer.mjs') preflight
if ($LASTEXITCODE) { throw 'Live Firestore privacy preflight failed.' }

$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $wscript -Argument $arguments -WorkingDirectory $runtime
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 1) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden
Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Action $action -Principal $principal -Trigger $trigger `
  -Settings $settings -Description 'Publishes one owner-private PTI workstation and worker observation every five minutes while signed in.' -Force |
  Select-Object TaskName,State
