param([Parameter(Mandatory=$true)][string]$Manifest,[Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ManifestSHA256)
$ErrorActionPreference='Stop'
# Desktop/PowerShell 7 can pass an incompatible PSModulePath to Windows PowerShell.
# Use this process's built-in modules; do not change the user's environment.
$env:PSModulePath=Join-Path $PSHOME 'Modules'
$manifestPath=[IO.Path]::GetFullPath($Manifest)
if(-not $manifestPath.StartsWith('F:\',[StringComparison]::OrdinalIgnoreCase)){throw 'Maintenance manifest must be on F:.'}
if((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash -ne $ManifestSHA256){throw 'Pinned manifest hash changed.'}
$stage=Split-Path -Parent $manifestPath
$value=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if($value.stage -ne $stage -or $value.launchMethod -ne 'detached'){throw 'Manifest is not a detached one-shot stage.'}
foreach($file in $value.runtimeFiles){
  $target=[IO.Path]::GetFullPath((Join-Path $stage $file.name))
  if(-not $target.StartsWith(($stage+'\'),[StringComparison]::OrdinalIgnoreCase) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $file.sha256){throw 'Staged helper path/hash changed.'}
}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if($identity.User.Value -ne $value.ownerSid){throw 'Detached updater must use the same Windows owner.'}
$relay=Get-ScheduledTask -TaskName 'PTI Local Codex Relay' -ErrorAction Stop
$relaySid=if($relay.Principal.UserId -match '^S-1-'){$relay.Principal.UserId}else{([Security.Principal.NTAccount]::new($relay.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value}
if($relaySid -ne $identity.User.Value){throw 'Existing relay belongs to another Windows owner.'}
$temporary=Join-Path $stage 'temporary'
New-Item -ItemType Directory -Path $temporary -Force | Out-Null
# An explicit non-secret environment; no inherited browser pipes, tokens or keys.
$environment=@{
  SystemRoot=$env:SystemRoot;WINDIR=$env:SystemRoot
  USERPROFILE=[Environment]::GetFolderPath('UserProfile')
  APPDATA=[Environment]::GetFolderPath('ApplicationData')
  LOCALAPPDATA=[Environment]::GetFolderPath('LocalApplicationData')
  PSModulePath=(Join-Path $PSHOME 'Modules')
  TEMP=$temporary;TMP=$temporary
  Path=((Join-Path $env:SystemRoot 'System32')+';'+(Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0')+';'+(Split-Path -Parent $value.nodePath)+';'+(Split-Path -Parent $value.gitPath))
}
$variables=[string[]]@($environment.GetEnumerator() | Sort-Object Key | ForEach-Object {$_.Key+'='+$_.Value})
# Local CIM/WMI provider owns the child. Kernel permits breakaway or refuses;
# no elevation, service, scheduled task or persistent WMI subscription is created.
$startup=New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[uint16]0;CreateFlags=[uint32]16778248;EnvironmentVariables=$variables}
$wscript=Join-Path $env:SystemRoot 'System32\wscript.exe'
$command='"'+$wscript+'" //B //NoLogo "'+(Join-Path $stage 'maintenance-hidden.vbs')+'" "'+$manifestPath+'" '+$ManifestSHA256
$result=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$command;CurrentDirectory=$stage;ProcessStartupInformation=$startup}
if($result.ReturnValue -ne 0){throw ('Windows refused detached creation; Win32_Process.Create return code '+$result.ReturnValue+'. No elevated fallback was attempted.')}
$created=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$result.ProcessId) -ErrorAction Stop
$actual=Invoke-CimMethod -InputObject $created -MethodName GetOwnerSid
if($actual.ReturnValue -ne 0 -or $actual.Sid -ne $identity.User.Value){throw 'Detached process owner could not be confirmed; inspect the gate before recovery.'}
$receipt=[ordered]@{id=$value.id;method='local-wmi-detached-one-shot';scheduled=$false;pid=[int]$result.ProcessId;parentPid=[int]$created.ParentProcessId;ownerVerified=$true;manifestSHA256=$ManifestSHA256.ToLower();at=(Get-Date).ToUniversalTime().ToString('o')}
$file=Join-Path $stage 'launch.json';$tmp=$file+'.tmp'
[IO.File]::WriteAllText($tmp,($receipt | ConvertTo-Json),[Text.UTF8Encoding]::new($false));Move-Item -LiteralPath $tmp -Destination $file -ErrorAction Stop
$receipt | ConvertTo-Json -Compress
