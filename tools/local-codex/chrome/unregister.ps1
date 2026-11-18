param([string]$BridgeRoot = 'F:\Workspace\Support\LocalCodexBridge')
$ErrorActionPreference='Stop'
$BridgeRoot=[IO.Path]::GetFullPath($BridgeRoot).TrimEnd('\')
if($BridgeRoot -notin @('F:\Workspace\Support\LocalCodexBridge','H:\LocalCodexBridge')){throw 'Use the approved F: or H: Local Codex bridge root.'}
$root=Join-Path $BridgeRoot 'chrome'
if(Test-Path -LiteralPath (Join-Path $root 'ipc\native.lock')){
  $lock=Get-Content -LiteralPath (Join-Path $root 'ipc\native.lock') -Raw | ConvertFrom-Json
  if(Get-Process -Id $lock.pid -ErrorAction SilentlyContinue){throw 'Release the extension and wait for its native connection to close. No process is killed.'}
}
$expected=Join-Path $root 'native-host.json'
foreach($view in @([Microsoft.Win32.RegistryView]::Registry32,[Microsoft.Win32.RegistryView]::Registry64)){
  $base=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,$view)
  $path='Software\Google\Chrome\NativeMessagingHosts\com.pti.local_codex.chrome'
  $key=$base.OpenSubKey($path)
  if($key){try{if($key.GetValue('') -ne $expected){throw 'Registration points elsewhere; preserve it.'}}finally{$key.Dispose()};$base.DeleteSubKey($path)}
  $base.Dispose()
}
$pointer=Join-Path $root 'active.json'
if(Test-Path -LiteralPath $pointer){Move-Item -LiteralPath $pointer -Destination (Join-Path $root ('disabled-'+(Get-Date -Format yyyyMMddHHmmss)+'.json')) -ErrorAction Stop}
Write-Output 'Only this provider registration/pointer was disabled. Extension files, evidence and bridge configuration/history were preserved. Remove the extension through Chrome if desired.'
