$ErrorActionPreference='Stop'
try {
  $config=Get-Content -LiteralPath 'H:\PTI-OnePiece\runtime\private\config.json' -Raw|ConvertFrom-Json
  if([IO.Path]::GetFullPath($config.nodeExecutable) -ne 'H:\PTI-OnePiece\tools\node\node.exe'){throw 'pinned-node-required'}
  $launcher='H:\PTI-OnePiece\runtime\launch-current.mjs'
  if(-not(Test-Path -LiteralPath $launcher -PathType Leaf)){throw 'launcher-missing'}
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
  $action=New-ScheduledTaskAction -Execute $config.nodeExecutable -Argument ('"'+$launcher+'"') -WorkingDirectory $config.runtimeRoot
  $initiatorSettings='F:\Workspace\Support\PTI\local-service-initiator\settings.json'
  if(Test-Path -LiteralPath $initiatorSettings -PathType Leaf){
   $initiator=Get-Content -LiteralPath $initiatorSettings -Raw|ConvertFrom-Json
   if($initiator.onePieceEnabled -eq $true){
    $helper=[IO.Path]::GetFullPath([string]$initiator.helperExecutable)
    if($helper -notmatch '^F:\\Workspace\\Support\\PTI\\local-service-initiator\\releases\\[0-9]+\.[0-9]+\.[0-9]+-[a-f0-9]{7,40}\\native\\PTI\.LocalServiceHost\.exe$' -or !(Test-Path -LiteralPath $helper -PathType Leaf)){throw 'initiator-identity'}
    $action=New-ScheduledTaskAction -Execute $helper -Argument ('"'+$initiatorSettings+'" one-piece') -WorkingDirectory 'F:\Workspace\Support\PTI\local-service-initiator'
   }
  }
  $trigger=New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
  $principal=New-ScheduledTaskPrincipal -UserId $identity.User.Value -LogonType Interactive -RunLevel Limited
  $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  $task=New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'PTI One Piece current-user logon companion. No stored Windows password; private CurrentUser DPAPI.'
  Register-ScheduledTask -TaskName 'PTI-OnePiece-Companion' -TaskPath '\' -InputObject $task -Force|Out-Null
  $actual=Get-ScheduledTask -TaskName 'PTI-OnePiece-Companion' -TaskPath '\'
  if($actual.Actions.Execute -ne $action.Execute -or $actual.Actions.Arguments -ne $action.Arguments -or $actual.Settings.RestartCount -ne 999 -or $actual.Settings.RestartInterval -ne 'PT1M' -or [string]$actual.Principal.LogonType -notin @('Interactive','InteractiveToken') -or [string]$actual.Principal.RunLevel -ne 'Limited'){throw 'task-verification'}
  $runKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
  $prior=Get-ItemPropertyValue -LiteralPath $runKey -Name 'PTIOnePieceCompanion' -ErrorAction SilentlyContinue
  if($prior -and $prior.Contains('PTI-OnePiece\runtime\launch-current.mjs')){Remove-ItemProperty -LiteralPath $runKey -Name 'PTIOnePieceCompanion'}
  $proof=[ordered]@{recordedAt=[DateTime]::UtcNow.ToString('o');installed=$true;taskName='PTI-OnePiece-Companion';principal=[string]$actual.Principal.UserId;logonType=[string]$actual.Principal.LogonType;runLevel=[string]$actual.Principal.RunLevel;restartCount=$actual.Settings.RestartCount;restartInterval=$actual.Settings.RestartInterval;state=[string]$actual.State;startupMode='current-user-interactive-logon';windowsPasswordStored=$false;preLoginSupported=$false;restartExecutionVerified=$false;rebootVerified=$false}
  $proof|ConvertTo-Json -Depth 5|Set-Content -LiteralPath 'H:\PTI-OnePiece\runtime\private\startup-task-proof.json' -Encoding UTF8
  $proof|ConvertTo-Json -Compress
}catch{
  [ordered]@{recordedAt=[DateTime]::UtcNow.ToString('o');installed=$false;reason='registration-denied-or-unavailable';windowsPasswordStored=$false}|ConvertTo-Json|Set-Content -LiteralPath 'H:\PTI-OnePiece\runtime\private\startup-task-attempt.json' -Encoding UTF8
  [Console]::Error.Write('runtime-startup-task-unavailable');exit 2
}
