param([string]$ConfigPath='H:\PTI-OnePiece\runtime\private\config.json')
$ErrorActionPreference='Stop'
try {
    $configFile=[IO.Path]::GetFullPath($ConfigPath)
    if($configFile -ne 'H:\PTI-OnePiece\runtime\private\config.json'){throw 'configuration-path'}
    $config=Get-Content -LiteralPath $configFile -Raw|ConvertFrom-Json
    $supervisor=Join-Path $config.repositoryRoot 'apps\one-piece\companion\src\runtime\supervisor.mjs'
    if(-not (Test-Path -LiteralPath $supervisor -PathType Leaf)){throw 'supervisor-missing'}
    $lock=Join-Path $config.privateRoot 'supervisor.lock'
    if(Test-Path -LiteralPath $lock){
      $identity=Get-Content -LiteralPath $lock -Raw|ConvertFrom-Json
      $existing=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$identity.pid)
      if($existing){
        if([IO.Path]::GetFullPath($existing.ExecutablePath) -eq [IO.Path]::GetFullPath($config.nodeExecutable) -and $existing.CommandLine.IndexOf($supervisor,[StringComparison]::OrdinalIgnoreCase) -ge 0){[Console]::Out.Write('{"alreadyRunning":true}');exit 0}
        throw 'unverified-lock-owner'
      }
    }
    $arguments='"'+$supervisor+'" --config "'+$configFile+'"'
    $child=Start-Process -FilePath $config.nodeExecutable -ArgumentList $arguments -WorkingDirectory $config.repositoryRoot -WindowStyle Hidden -PassThru
    [ordered]@{started=$true;supervisorPid=$child.Id;configuration=$configFile}|ConvertTo-Json -Compress
}catch{[Console]::Error.Write('runtime-start-failed');exit 1}
