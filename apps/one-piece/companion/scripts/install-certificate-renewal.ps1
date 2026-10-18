param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
try {
 $root='H:\PTI-OnePiece\runtime\private'
 $config=Get-Content -LiteralPath (Join-Path $root 'config.json') -Raw|ConvertFrom-Json
 if($config.tls.mode -ne 'public-certificate' -or $config.tls.hostname -ne 'pti-onepiece-home.duckdns.org'){throw 'public-tls-required'}
 if([IO.Path]::GetFullPath($config.nodeExecutable) -ne 'H:\PTI-OnePiece\tools\node\node.exe'){throw 'pinned-node-required'}
 $release=[IO.Path]::GetFullPath($config.repositoryRoot)
 if($release -notmatch '^H:\\PTI-OnePiece\\releases\\[a-f0-9]{40}$'){throw 'active-release-required'}
 $entry=Join-Path $release 'apps\one-piece\companion\scripts\renew-public-certificate.mjs'
 if(-not (Test-Path -LiteralPath $entry -PathType Leaf)){throw 'renewal-script-missing'}
 $taskName='PTI-OnePiece-CertificateRenewal'
 # The wrapper resolves the protected CURRENT config on each run; future releases do not leave a stale script path.
 $wrapper=Join-Path $root 'renew-public-certificate.ps1'
 $body=@'
$ErrorActionPreference='Stop'
try {
 $configuration=Get-Content -LiteralPath 'H:\PTI-OnePiece\runtime\private\config.json' -Raw|ConvertFrom-Json
 $release=[IO.Path]::GetFullPath($configuration.repositoryRoot)
 if($configuration.tls.mode -ne 'public-certificate' -or $configuration.tls.hostname -ne 'pti-onepiece-home.duckdns.org' -or $release -notmatch '^H:\\PTI-OnePiece\\releases\\[a-f0-9]{40}$' -or [IO.Path]::GetFullPath($configuration.nodeExecutable) -ne 'H:\PTI-OnePiece\tools\node\node.exe'){throw 'configuration'}
 $entry=Join-Path $release 'apps\one-piece\companion\scripts\renew-public-certificate.mjs'
 if(-not (Test-Path -LiteralPath $entry -PathType Leaf)){throw 'script'}
 & $configuration.nodeExecutable $entry
 exit $LASTEXITCODE
}catch{[Console]::Error.Write('public-certificate-renewal-failed');exit 1}
'@
 if($CheckOnly){[ordered]@{checked=$true;taskName=$taskName;scriptPresent=$true;dailyLocalTime='04:00';windowsPasswordStored=$false}|ConvertTo-Json -Compress;exit 0}
 if((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'private-directory'}
 [IO.File]::WriteAllText($wrapper,$body,[Text.UTF8Encoding]::new($false))
 $powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
 $arguments='-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -File "'+$wrapper+'"'
 $action=New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $root
 $trigger=New-ScheduledTaskTrigger -Daily -At '04:00'
 $principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
 $settings=New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
 $task=New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Renew the private home One Piece endpoint certificate when due; never starts a stopped companion.'
 Register-ScheduledTask -TaskName $taskName -InputObject $task -Force|Out-Null
 $installed=Get-ScheduledTask -TaskName $taskName
 if(-not $installed.Settings.Hidden -or -not $installed.Settings.StartWhenAvailable -or $installed.Principal.LogonType -ne 'Interactive'){throw 'task-verification'}
 [ordered]@{installed=$true;taskName=$taskName;scope='CurrentUser';dailyLocalTime='04:00';windowsPasswordStored=$false;preLoginSupported=$false}|ConvertTo-Json -Compress
}catch{[Console]::Error.Write('public-certificate-task-install-failed');exit 1}
