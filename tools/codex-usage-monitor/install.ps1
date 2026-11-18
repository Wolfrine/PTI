param([switch]$Setup, [switch]$NoSchedule, [string]$NativeAuthConfig, [switch]$ReuseDependencies)
$ErrorActionPreference = 'Stop'
$sourceRoot = $PSScriptRoot
$installRoot = [IO.Path]::GetFullPath('F:\Workspace\Support\PTI\codex-usage-monitor')
$expectedRoot = [IO.Path]::GetFullPath('F:\Workspace\Support\PTI\codex-usage-monitor')
if ($installRoot -ne $expectedRoot) { throw 'Unexpected install target.' }
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
$nativeConfig = Join-Path $installRoot 'native-auth.json'
if (!$NativeAuthConfig) { $NativeAuthConfig = $nativeConfig }
& $nodePath --input-type=module -e 'const {nativeAuthKey}=await import(process.argv[1]); nativeAuthKey(process.argv[2]);' ([Uri](Join-Path $sourceRoot 'src\config.mjs')).AbsoluteUri $NativeAuthConfig
if ($LASTEXITCODE -ne 0) { throw 'Verified dedicated native Firebase auth configuration is required. Browser keys are not a fallback.' }
$version = (Get-Content -LiteralPath (Join-Path $sourceRoot 'package.json') -Raw | ConvertFrom-Json).version
$revision = (& git -C $sourceRoot rev-parse --short HEAD 2>$null)
if (-not $revision) { $revision = 'source' }
if ($version -notmatch '^\d+\.\d+\.\d+$' -or $revision -notmatch '^[a-zA-Z0-9-]+$') { throw 'Invalid version.' }
$releaseName = $version + '-' + $revision
$releaseRoot = Join-Path $installRoot ('releases\' + $releaseName)
if (Test-Path -LiteralPath $installRoot) {
  if ((Get-Item -LiteralPath $installRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Install root must not be a junction.' }
}
New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
# Reuse PTI's tested current-user DPAPI/DACL helper before putting private state here.
$protectModule = Join-Path $sourceRoot 'src\dpapi.mjs'
# Reapplying an inherited DACL to all old node_modules releases can exceed the
# helper's deadline. Reuse only an already exact, protected CurrentUser/SYSTEM
# full-control DACL; otherwise retain the existing protection helper.
$ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$existingAcl = Get-Acl -LiteralPath $installRoot
. (Join-Path $sourceRoot 'scripts\private-install-acl.ps1')
$privateAcl = Test-PrivateMonitorAcl -Acl $existingAcl -OwnerSid $ownerSid
if (!$privateAcl) {
  & $nodePath --input-type=module -e "const url=await import('node:url'); const {WindowsProtection}=await import(url.pathToFileURL(process.argv[1]).href); await new WindowsProtection().secureDirectory(process.argv[2]);" $protectModule $installRoot
  if ($LASTEXITCODE -ne 0) { throw 'Private installation directory could not be secured.' }
} else { Write-Output 'Existing private installation ACL verified; encrypted credentials preserved.' }
if ([IO.Path]::GetFullPath($NativeAuthConfig) -ne [IO.Path]::GetFullPath($nativeConfig)) { Copy-Item -LiteralPath $NativeAuthConfig -Destination $nativeConfig -Force }
Copy-Item -LiteralPath $nativeConfig -Destination (Join-Path $releaseRoot 'native-auth.json') -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'package.json'),(Join-Path $sourceRoot 'package-lock.json') -Destination $releaseRoot -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'src') -Destination $releaseRoot -Recurse -Force
if ($ReuseDependencies) {
  # Reuse only an identical lock under the same private F-drive installation.
  # The referenced prior release must remain; no credential or scheduler changes.
  $prior = Get-Content -LiteralPath (Join-Path $installRoot 'active.json') -Raw | ConvertFrom-Json
  $priorRoot = [IO.Path]::GetFullPath((Join-Path $installRoot ([string]$prior.release)))
  if (!$priorRoot.StartsWith(([IO.Path]::GetFullPath((Join-Path $installRoot 'releases')) + '\')) -or $priorRoot -eq $releaseRoot) { throw 'Invalid prior dependency release.' }
  $verifyDependencies = @'
import fs from 'node:fs';
import path from 'node:path';
const [oldFile,newFile,modules,root]=process.argv.slice(1);
const locks=[oldFile,newFile].map(file=>JSON.parse(fs.readFileSync(file,'utf8')));
for(const lock of locks){delete lock.version;delete lock.packages[''].version;}
if(JSON.stringify(locks[0])!==JSON.stringify(locks[1]))throw Error('Dependency lock differs; reuse refused.');
const actual=fs.realpathSync.native(modules),base=fs.realpathSync.native(root);
if(!actual.toLowerCase().startsWith((base+path.sep+'releases'+path.sep).toLowerCase()))throw Error('Dependency target escaped private releases.');
console.log(actual);
'@
  $sharedDependencies = & $nodePath --input-type=module -e $verifyDependencies (Join-Path $priorRoot 'package-lock.json') (Join-Path $sourceRoot 'package-lock.json') (Join-Path $priorRoot 'node_modules') $installRoot
  if ($LASTEXITCODE -ne 0) { throw 'Existing dependencies could not be verified; pointer unchanged.' }
  New-Item -ItemType Junction -Path (Join-Path $releaseRoot 'node_modules') -Target ([string]$sharedDependencies) -ErrorAction Stop | Out-Null
  Write-Output 'Identical dependency lock verified; prior private dependency release retained.'
} else {
  Push-Location $releaseRoot
  try { & $npmPath ci --omit=dev --ignore-scripts --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'Monitor dependencies could not be installed.' } }
  finally { Pop-Location }
}
foreach ($file in @('run.ps1','run-hidden.vbs','setup.ps1','status.ps1','remove.ps1')) { Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination $installRoot -Force }
$active = @{ version=$version; revision=$revision; release=('releases\' + $releaseName); nodePath=$nodePath; installedAt=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $installRoot 'active.json.tmp'), $active)
Move-Item -LiteralPath (Join-Path $installRoot 'active.json.tmp') -Destination (Join-Path $installRoot 'active.json') -Force
if ($Setup) { & (Join-Path $installRoot 'run.ps1') -Command setup; if ($LASTEXITCODE -ne 0) { throw 'PTI sign-in is incomplete; schedule not installed.' } }
if ($NoSchedule) { Write-Output 'Runtime installed. Schedule not changed.'; exit 0 }
if (-not (Test-Path -LiteralPath (Join-Path $installRoot 'data\credential.json'))) { throw 'Run setup.ps1, then install.ps1 again to register the schedule.' }
$taskName = 'PTI Codex Usage Monitor'
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$scriptHost = Join-Path $env:SystemRoot 'System32\wscript.exe'
if (-not (Test-Path -LiteralPath $scriptHost -PathType Leaf)) { throw 'Windows Script Host is required for the windowless scheduled launcher.' }
$runner = Join-Path $installRoot 'run-hidden.vbs'
$action = New-ScheduledTaskAction -Execute $scriptHost -Argument ('//B //NoLogo "' + $runner + '"') -WorkingDirectory $installRoot
$triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $currentUser),(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 5)))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Read Codex account allowance and daily tokens; publish one private PTI document. No inference.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output 'Installed PTI Codex Usage Monitor: every 5 minutes while signed in, plus login/missed-run recovery; no password or wake timer.'
