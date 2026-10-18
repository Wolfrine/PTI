$ErrorActionPreference='Stop'
try {
  $key='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
  $value=Get-ItemPropertyValue -LiteralPath $key -Name 'PTIOnePieceCompanion' -ErrorAction SilentlyContinue
  if($value -and ($value.Contains('one-piece\companion\scripts\start-runtime.ps1') -or $value.Contains('PTI-OnePiece\runtime\launch-current.mjs'))){Remove-ItemProperty -LiteralPath $key -Name 'PTIOnePieceCompanion';[Console]::Out.Write('{"removed":true,"scope":"CurrentUser-logon"}')}
  elseif(-not $value){[Console]::Out.Write('{"alreadyAbsent":true}')}
  else{throw 'startup-identity'}
}catch{[Console]::Error.Write('runtime-startup-removal-failed');exit 1}
