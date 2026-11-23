param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$Revision)
$ErrorActionPreference='Stop'
$repo = (& git -C $PSScriptRoot rev-parse --show-toplevel).Trim()
$prefix='tools/local-codex/approved-tab/'
if (!$repo.StartsWith('F:/',[StringComparison]::OrdinalIgnoreCase) -and !$repo.StartsWith('F:\',[StringComparison]::OrdinalIgnoreCase)) {throw 'Use the owning F: source checkout.'}
& git -C $repo merge-base --is-ancestor $Revision refs/remotes/origin/main
if($LASTEXITCODE -ne 0){throw 'Release revision must be on published main.'}
$files=@(& git -C $repo ls-tree -r --name-only $Revision -- $prefix)
if($LASTEXITCODE -ne 0 -or $files.Count -eq 0){throw 'Release sources are missing.'}
foreach($file in $files){
  $expected=(& git -C $repo rev-parse ("${Revision}:"+$file)).Trim()
  $actual=(& git -C $repo hash-object ("--path="+$file) -- $file).Trim()
  if($LASTEXITCODE -ne 0 -or $expected -ne $actual){throw "Dirty release input $file"}
}
$bridge='H:\LocalCodexBridge'
$root=Join-Path $bridge 'approved-tab'
$buildParent='H:\Workspace\Builds\PTI\local-codex'
$buildPath=Join-Path $buildParent ('approved-tab-'+[guid]::NewGuid().ToString('N'))
$release=Join-Path $root ('releases\0.2.0-'+$Revision.Substring(0,10))
$extension=Join-Path $release 'extension'
foreach($dir in @($bridge,$buildParent,$root,$release)){
  if((Test-Path -LiteralPath $dir) -and ((Get-Item -LiteralPath $dir).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw "Unexpected redirected path $dir"}
}
$ptr=Get-Content -LiteralPath (Join-Path $bridge 'active.json') -Raw | ConvertFrom-Json
$node=$ptr.nodePath
$env:TEMP='H:\Workspace\Temp'; $env:TMP=$env:TEMP
New-Item -ItemType Directory -Path $buildPath | Out-Null
Push-Location -LiteralPath $PSScriptRoot
try {
  & $node (Join-Path $PSScriptRoot 'build.mjs') $buildPath
  if($LASTEXITCODE -ne 0){throw 'Native Messaging/MCP build failed.'}
} finally {Pop-Location}
$hostName='com.pti.local_codex.tab_share'
$regPath='Software\Google\Chrome\NativeMessagingHosts\'+$hostName
$nativeManifest=Join-Path $root 'native-host.json'
foreach($view in @([Microsoft.Win32.RegistryView]::Registry32,[Microsoft.Win32.RegistryView]::Registry64)){
  $base=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,$view)
  try{$existing=$base.OpenSubKey($regPath);if($existing){try{if($existing.GetValue('') -ne $nativeManifest){throw 'A different installation owns this native-host registration.'}}finally{$existing.Dispose()}}}finally{$base.Dispose()}
}
New-Item -ItemType Directory -Path $root -Force | Out-Null
$owner=[Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=[Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($owner);$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @($owner,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
}
[IO.Directory]::SetAccessControl($root,$acl)
New-Item -ItemType Directory -Path (Join-Path $root 'requests') -Force | Out-Null
$utf8=[Text.UTF8Encoding]::new($false)
$staged=Join-Path $root ('staging-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $staged 'extension') -Force | Out-Null
foreach($name in @('mcp.mjs','native-host.mjs')){Copy-Item -LiteralPath (Join-Path $buildPath $name) -Destination $staged}
foreach($name in @('manifest.json','popup.html','popup.css','popup.js')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('extension\'+$name)) -Destination (Join-Path $staged 'extension')}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'scope.mjs') -Destination (Join-Path $staged 'extension')
Copy-Item -LiteralPath (Join-Path (Join-Path $bridge $ptr.release) 'THIRD-PARTY-NOTICES.txt') -Destination $staged
[IO.File]::WriteAllText((Join-Path $staged 'node-path.txt'),$node,$utf8)
& "$env:SystemRoot\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:winexe ('/out:'+(Join-Path $staged 'native-host.exe')) (Join-Path $PSScriptRoot 'NativeHost.cs')
if($LASTEXITCODE -ne 0){throw 'Windowless Chrome Native Messaging launcher build failed.'}
New-Item -ItemType Directory -Path (Split-Path $release -Parent) -Force | Out-Null
if(Test-Path -LiteralPath $release){
  foreach($file in @(Get-ChildItem -LiteralPath $staged -File -Recurse)){
    $name=$file.FullName.Substring($staged.Length+1)
    if($name -eq 'native-host.exe'){continue}
    if((Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath (Join-Path $release $name)).Hash){throw "Installed release differs at $name"}
  }
}else{[IO.Directory]::Move($staged,$release)}
function SaveJson($file,$value){[IO.File]::WriteAllText($file,($value | ConvertTo-Json -Depth 10),$utf8)}
$manifest=Get-Content -Raw -LiteralPath (Join-Path $extension 'manifest.json') | ConvertFrom-Json
$digest=[Security.Cryptography.SHA256]::Create().ComputeHash([Convert]::FromBase64String($manifest.key))
$id=-join ($digest[0..15] | ForEach-Object {[char](97+($_ -shr 4));[char](97+($_ -band 15))})
SaveJson $nativeManifest @{name=$hostName;description='PTI Owner Chrome tab sharing';path=(Join-Path $release 'native-host.exe');type='stdio';allowed_origins=@("chrome-extension://$id/")}
foreach($view in @([Microsoft.Win32.RegistryView]::Registry32,[Microsoft.Win32.RegistryView]::Registry64)){
  $base=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,$view)
  try{$key=$base.CreateSubKey($regPath);try{$key.SetValue('',$nativeManifest,[Microsoft.Win32.RegistryValueKind]::String);if($key.GetValue('') -ne $nativeManifest){throw 'Registration readback failed.'}}finally{$key.Dispose()}}finally{$base.Dispose()}
}
& $node (Join-Path $PSScriptRoot 'configure.mjs') $release $Revision
if($LASTEXITCODE -ne 0){throw 'Worker configuration failed.'}
[pscustomobject]@{revision=$Revision;extensionDirectory=$extension;extensionId=$id;browserApproval='pending until the owner shares the real tab'} | ConvertTo-Json
