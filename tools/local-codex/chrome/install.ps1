param()
$ErrorActionPreference='Stop'
$source=$PSScriptRoot
$root='F:\Workspace\Support\LocalCodexBridge\chrome'
if (([IO.Path]::GetFullPath($source)) -notlike 'F:\*') { throw 'Provider source must be on F:.' }
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$owner=$identity.User
$version='0.1.1'
$release=Join-Path $root ('releases\'+$version)
foreach($name in @('native-host.mjs','mcp.mjs')){if(-not(Test-Path -LiteralPath (Join-Path $source ('dist\'+$name)))){throw 'Build the provider before installation.'}}
if (Test-Path -LiteralPath (Join-Path $root 'ipc\native.lock')) {
  $lock=Get-Content -LiteralPath (Join-Path $root 'ipc\native.lock') -Raw | ConvertFrom-Json
  if(Get-Process -Id $lock.pid -ErrorAction SilentlyContinue){throw 'Release the connected Chrome provider before installing. Existing sessions are preserved.'}
}
if(Test-Path -LiteralPath $release){throw 'Immutable provider release already exists. Inspect its receipt; do not overwrite a loaded extension.'}
$manifest=Get-Content -LiteralPath (Join-Path $source 'extension\manifest.json') -Raw | ConvertFrom-Json
$digest=[Security.Cryptography.SHA256]::Create().ComputeHash([Convert]::FromBase64String($manifest.key))
$extensionId=-join ($digest[0..15] | ForEach-Object { [char](97+($_ -shr 4)); [char](97+($_ -band 15)) })
$registryPath='Software\Google\Chrome\NativeMessagingHosts\com.pti.local_codex.chrome'
$nativeManifest=Join-Path $root 'native-host.json'
foreach($view in @([Microsoft.Win32.RegistryView]::Registry32,[Microsoft.Win32.RegistryView]::Registry64)){
  $base=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,$view)
  $existing=$base.OpenSubKey($registryPath)
  if($existing){try{if($existing.GetValue('') -ne $nativeManifest){throw 'Existing native host registration belongs to another installation.'}}finally{$existing.Dispose()}}
  $base.Dispose()
}
New-Item -ItemType Directory -Path $root -Force | Out-Null
if((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Provider root cannot be a junction/symlink.'}
$acl=[Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($owner);$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @($owner,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
}
[IO.Directory]::SetAccessControl($root,$acl)
foreach($relative in @('ipc','ipc\commands','ipc\responses','ipc\requests','releases',('releases\'+$version),('releases\'+$version+'\extension'))){New-Item -ItemType Directory -Path (Join-Path $root $relative) -Force | Out-Null}
foreach($name in @('native-host.mjs','mcp.mjs')){Copy-Item -LiteralPath (Join-Path $source ('dist\'+$name)) -Destination (Join-Path $release $name)}
foreach($name in @('manifest.json','policy.js','background.js','popup.html','popup.js','popup.css')){Copy-Item -LiteralPath (Join-Path $source ('extension\'+$name)) -Destination (Join-Path $release ('extension\'+$name))}
$node=(Get-Content -LiteralPath 'F:\Workspace\Support\LocalCodexBridge\active.json' -Raw | ConvertFrom-Json).nodePath
[IO.File]::WriteAllText((Join-Path $release 'node-path.txt'),$node,[Text.UTF8Encoding]::new($false))
& 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe' /nologo /target:winexe ('/out:'+(Join-Path $release 'native-host.exe')) (Join-Path $source 'NativeHost.cs')
if($LASTEXITCODE -ne 0){throw 'Native host shim build failed.'}
function Write-Json($file,$value){[IO.File]::WriteAllText($file,($value | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))}
Write-Json (Join-Path $root 'native-config.json') @{schemaVersion=1;extensionId=$extensionId;ownerSid=$owner.Value}
Write-Json $nativeManifest @{name='com.pti.local_codex.chrome';description='Owner-approved PTI Chrome task provider';path=(Join-Path $release 'native-host.exe');type='stdio';allowed_origins=@('chrome-extension://'+$extensionId+'/')}
$hashes=@(Get-ChildItem -LiteralPath $release -File -Recurse | ForEach-Object {@{file=$_.FullName.Substring($release.Length+1);sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower();bytes=$_.Length}})
Write-Json (Join-Path $release 'integrity.json') @{version=$version;files=$hashes}
Write-Json (Join-Path $root 'active.json') @{schemaVersion=1;version=$version;release=$release;extensionId=$extensionId;ownerSid=$owner.Value;mcp=(Join-Path $release 'mcp.mjs')}
foreach($view in @([Microsoft.Win32.RegistryView]::Registry32,[Microsoft.Win32.RegistryView]::Registry64)){
  $base=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,$view);$key=$base.CreateSubKey($registryPath)
  $key.SetValue('',$nativeManifest,[Microsoft.Win32.RegistryValueKind]::String);$key.Dispose();$base.Dispose()
}
$receipt=@{installedAt=(Get-Date).ToUniversalTime().ToString('o');version=$version;nativeHostRegistered=$true;extensionLoaded=$false;chromeObserved=$false;extensionId=$extensionId;extensionDirectory=(Join-Path $release 'extension');ownerSid=$owner.Value;acl='current owner + SYSTEM only';registryScope='HKCU only';files=$hashes;nextStep='In the intended Chrome profile: chrome://extensions > Developer mode > Load unpacked > select extensionDirectory. Then approve the exact pending task from the toolbar popup on the intended site.'}
Write-Json (Join-Path $root 'install-receipt.json') $receipt
[pscustomobject]$receipt | Select-Object version,nativeHostRegistered,extensionLoaded,extensionId,extensionDirectory,nextStep | ConvertTo-Json
