param([string]$ConfigPath='H:\PTI-OnePiece\runtime\private\config.json')
$ErrorActionPreference='Stop'
try {
    if([IO.Path]::GetFullPath($ConfigPath) -ne 'H:\PTI-OnePiece\runtime\private\config.json'){throw 'configuration-path'}
    $config=Get-Content -LiteralPath $ConfigPath -Raw|ConvertFrom-Json
    $launcher=Join-Path $config.runtimeRoot 'launch-current.mjs'
    if(-not (Test-Path -LiteralPath $launcher -PathType Leaf)){throw 'launcher-missing'}
    if([IO.Path]::GetFullPath($config.nodeExecutable) -ne 'H:\PTI-OnePiece\tools\node\node.exe'){throw 'pinned-node-required'}
    $command='"'+$config.nodeExecutable+'" "'+$launcher+'"'
    $key='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    New-ItemProperty -LiteralPath $key -Name 'PTIOnePieceCompanion' -Value $command -PropertyType String -Force|Out-Null
    $actual=Get-ItemPropertyValue -LiteralPath $key -Name 'PTIOnePieceCompanion'
    if($actual -ne $command){throw 'startup-verification'}
    [ordered]@{installed=$true;scope='CurrentUser';mode='logon';windowsPasswordStored=$false;preLoginSupported=$false;rebootVerified=$false}|ConvertTo-Json -Compress
}catch{[Console]::Error.Write('runtime-startup-install-failed');exit 1}
