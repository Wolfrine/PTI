param([string]$ConfigPath='H:\PTI-OnePiece\runtime\private\config.json')
$ErrorActionPreference='Stop'

# Dot sourcing defines this command for isolated tests without changing the runtime.
function Stop-OnePieceRuntime {
 param($Config,$State,[scriptblock]$WriteStopRequest={param($File)[IO.File]::WriteAllText($File,'stop')},[scriptblock]$ReadInitiatorSettings={Get-Content -LiteralPath 'F:\Workspace\Support\PTI\local-service-initiator\settings.json' -Raw|ConvertFrom-Json})
 $launcher=Join-Path $Config.runtimeRoot 'launch-current.mjs'
 $supervisor=Join-Path $Config.repositoryRoot 'apps\one-piece\companion\src\runtime\supervisor.mjs'
 if([IO.Path]::GetFullPath($Config.nodeExecutable) -ne 'H:\PTI-OnePiece\tools\node\node.exe' -or [IO.Path]::GetFullPath($launcher) -ne 'H:\PTI-OnePiece\runtime\launch-current.mjs'){throw 'runtime-identity'}
 $tasks=@(Get-ScheduledTask -TaskPath '\' -ErrorAction Stop|Where-Object {$_.TaskName -eq 'PTI-OnePiece-Companion'})
 if($tasks.Count -gt 1){throw 'task-identity'}
 $task=if($tasks.Count){$tasks[0]}else{$null}
 if($task){
  $actions=@($task.Actions)
  if($actions.Count -ne 1){throw 'task-identity'}
  $legacy=[IO.Path]::GetFullPath($actions[0].Execute) -eq [IO.Path]::GetFullPath($Config.nodeExecutable) -and $actions[0].Arguments -eq ('"'+$launcher+'"') -and [IO.Path]::GetFullPath($actions[0].WorkingDirectory) -eq [IO.Path]::GetFullPath($Config.runtimeRoot)
  $native=$false
  if(!$legacy){
   try{
    $initiator=& $ReadInitiatorSettings
    $helper=[IO.Path]::GetFullPath([string]$initiator.helperExecutable)
    $native=$initiator.onePieceEnabled -eq $true -and $helper -match '^F:\\Workspace\\Support\\PTI\\local-service-initiator\\releases\\[0-9]+\.[0-9]+\.[0-9]+-[a-f0-9]{7,40}\\native\\PTI\.LocalServiceHost\.exe$' -and [IO.Path]::GetFullPath($actions[0].Execute) -eq $helper -and $actions[0].Arguments -ceq '"F:\Workspace\Support\PTI\local-service-initiator\settings.json" one-piece' -and [IO.Path]::GetFullPath($actions[0].WorkingDirectory) -eq 'F:\Workspace\Support\PTI\local-service-initiator'
   }catch{$native=$false}
  }
  if(!$legacy -and !$native){throw 'task-identity'}
 }
 $existing=if($State -and [int]$State.supervisorPid -gt 0){Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$State.supervisorPid)}else{$null}
 if($existing){
  $normalizedCommand=$existing.CommandLine.Replace('/','\')
  if([IO.Path]::GetFullPath($existing.ExecutablePath) -ne [IO.Path]::GetFullPath($Config.nodeExecutable) -or $normalizedCommand.IndexOf($supervisor.Replace('/','\'),[StringComparison]::OrdinalIgnoreCase) -lt 0 -or $normalizedCommand.IndexOf($ConfigPath.Replace('/','\'),[StringComparison]::OrdinalIgnoreCase) -lt 0){throw 'supervisor-identity'}
  & $WriteStopRequest (Join-Path $Config.privateRoot 'stop.request')
  for($attempt=0;$attempt -lt 200;$attempt++){
   if(-not (Get-Process -Id $State.supervisorPid -ErrorAction SilentlyContinue)){break}
   Start-Sleep -Milliseconds 200
  }
  if(Get-Process -Id $State.supervisorPid -ErrorAction SilentlyContinue){throw 'stop-unconfirmed'}
 }
 # The supervisor may be absent during the stable launcher's backoff. Stopping the
 # exact verified task prevents that launcher from restarting during activation.
 # No PID is force-killed; graceful supervisor shutdown was attempted first.
 if($task){
  $task=Get-ScheduledTask -TaskName 'PTI-OnePiece-Companion' -TaskPath '\'
  if([string]$task.State -eq 'Running'){Stop-ScheduledTask -TaskName 'PTI-OnePiece-Companion' -TaskPath '\'}
  for($attempt=0;$attempt -lt 50;$attempt++){
   $task=Get-ScheduledTask -TaskName 'PTI-OnePiece-Companion' -TaskPath '\'
   if([string]$task.State -ne 'Running'){break}
   Start-Sleep -Milliseconds 100
  }
  if([string]$task.State -in @('Running','Queued')){throw 'launcher-task-still-active'}
 }
 $all=@(Get-CimInstance Win32_Process)
 $recorded=@();if($State){$recorded+=([int]$State.supervisorPid);foreach($entry in $State.processes.PSObject.Properties){if([int]$entry.Value.pid -gt 0){$recorded+=([int]$entry.Value.pid)}}}
 foreach($process in $all){
  if([int]$process.ProcessId -in $recorded){throw 'runtime-process-still-active'}
  $command=([string]$process.CommandLine).Replace('/','\')
  if($command.IndexOf($launcher.Replace('/','\'),[StringComparison]::OrdinalIgnoreCase) -ge 0 -or $command.IndexOf($supervisor.Replace('/','\'),[StringComparison]::OrdinalIgnoreCase) -ge 0){throw 'launcher-or-supervisor-still-active'}
 }
 $ports=@(Get-NetTCPConnection -State Listen -ErrorAction Stop|Where-Object {($_.LocalAddress -in @('127.0.0.1','0.0.0.0','::') -and $_.LocalPort -in @(18097,18098)) -or ($_.LocalAddress -in @('192.168.68.105','0.0.0.0','::') -and $_.LocalPort -in @(8443,18099))})
 if($ports.Count){throw 'runtime-port-still-active'}
 return [ordered]@{stopped=$true;launcherAbsent=$true;supervisorAbsent=$true;recordedChildrenAbsent=$true;portsClosed=$true;taskState=if($task){[string]$task.State}else{'Absent'}}
}

if($MyInvocation.InvocationName -ne '.'){
 try {
  if([IO.Path]::GetFullPath($ConfigPath) -ne 'H:\PTI-OnePiece\runtime\private\config.json'){throw 'configuration-path'}
  $config=Get-Content -LiteralPath $ConfigPath -Raw|ConvertFrom-Json
  $state=if(Test-Path -LiteralPath $config.statePath){Get-Content -LiteralPath $config.statePath -Raw|ConvertFrom-Json}else{$null}
  $proof=Stop-OnePieceRuntime -Config $config -State $state
  $proof.recordedAt=[DateTime]::UtcNow.ToString('o')
  $hasher=[Security.Cryptography.SHA256]::Create()
  try{$proof.configSha256=([BitConverter]::ToString($hasher.ComputeHash([IO.File]::ReadAllBytes($ConfigPath)))).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose()}
  $proof|ConvertTo-Json -Compress|Set-Content -LiteralPath (Join-Path $config.privateRoot 'stop-proof.json') -Encoding UTF8
  $proof|ConvertTo-Json -Compress
 }catch{[Console]::Error.Write('runtime-stop-unconfirmed');exit 1}
}
