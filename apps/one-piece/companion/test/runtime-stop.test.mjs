import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';

test('Windows stop command closes the launcher backoff gap and refuses foreign task/process identities',{skip:process.platform!=='win32'},async()=>{
 const scriptPath=fileURLToPath(new URL('../scripts/stop-runtime.ps1',import.meta.url)).replaceAll("'","''");
 const releaseSource=await readFile(new URL('../src/runtime/release.mjs',import.meta.url),'utf8');
 const inspectionScript=/const STOP_INSPECTION=String\.raw`([\s\S]*?)`;/m.exec(releaseSource)?.[1];
 assert.ok(inspectionScript,'Activation must use the actual reviewed inspection command');
 const script=String.raw`
$ErrorActionPreference='Stop'
. '${scriptPath}'
$config=[pscustomobject]@{nodeExecutable='H:\PTI-OnePiece\tools\node\node.exe';runtimeRoot='H:\PTI-OnePiece\runtime';repositoryRoot='F:\synthetic-fixture';privateRoot='H:\PTI-OnePiece\runtime\private'}
$state=[pscustomobject]@{supervisorPid=1234;processes=[pscustomobject]@{backend=[pscustomobject]@{pid=1235}}}
function Reset-Fixture {
 $script:task=[pscustomobject]@{TaskName='PTI-OnePiece-Companion';State='Running';Actions=@([pscustomobject]@{Execute=$config.nodeExecutable;Arguments='"H:\PTI-OnePiece\runtime\launch-current.mjs"';WorkingDirectory=$config.runtimeRoot})}
 $script:all=@();$script:ports=@();$script:stopCalls=0;$script:writeCalls=0;$script:supervisorAlive=$false
}
function Get-ScheduledTask {param($TaskName,$TaskPath,$ErrorAction) return $script:task}
function Stop-ScheduledTask {param($TaskName,$TaskPath) $script:stopCalls++;$script:task.State='Ready'}
function Get-CimInstance {param($ClassName,$Filter) if($Filter){if($script:supervisorAlive){return $script:supervisor}}else{return $script:all}}
function Get-Process {param($Id,$ErrorAction) if($script:supervisorAlive -and $Id -eq 1234){return $script:supervisor}}
function Get-NetTCPConnection {param($State,$ErrorAction) return $script:ports}
function Start-Sleep {param($Milliseconds)}
function Expect-Refusal([scriptblock]$Action,[string]$Code) {try{& $Action;throw 'fixture-incorrectly-accepted'}catch{if($_.Exception.Message -ne $Code){throw}}}

Reset-Fixture
$proof=Stop-OnePieceRuntime -Config $config -State $state -WriteStopRequest {throw 'no live supervisor in backoff'}
if(-not $proof.stopped -or $script:stopCalls -ne 1 -or $proof.taskState -ne 'Ready'){throw 'backoff-not-stopped'}

Reset-Fixture
$helper='F:\Workspace\Support\PTI\local-service-initiator\releases\1.1.0-123abcd\native\PTI.LocalServiceHost.exe'
$script:task.Actions[0]=[pscustomobject]@{Execute=$helper;Arguments='"F:\Workspace\Support\PTI\local-service-initiator\settings.json" one-piece';WorkingDirectory='F:\Workspace\Support\PTI\local-service-initiator'}
$proof=Stop-OnePieceRuntime -Config $config -State $state -ReadInitiatorSettings {[pscustomobject]@{onePieceEnabled=$true;helperExecutable=$helper}}
if(-not $proof.stopped -or $script:stopCalls -ne 1){throw 'native-task-not-stopped'}
$script:task.State='Running';$script:task.Actions[0].Arguments='"F:\Workspace\Support\PTI\local-service-initiator\settings.json" worker'
Expect-Refusal {Stop-OnePieceRuntime -Config $config -State $state -ReadInitiatorSettings {[pscustomobject]@{onePieceEnabled=$true;helperExecutable=$helper}}} 'task-identity'

Reset-Fixture
$script:task.Actions[0].Arguments='"F:\unrelated.mjs"'
Expect-Refusal {Stop-OnePieceRuntime -Config $config -State $state} 'task-identity'
if($script:stopCalls -ne 0){throw 'foreign-task-stopped'}

Reset-Fixture
$script:all=@([pscustomobject]@{ProcessId=1235;CommandLine='synthetic remaining child'})
Expect-Refusal {Stop-OnePieceRuntime -Config $config -State $state} 'runtime-process-still-active'

Reset-Fixture
$script:all=@([pscustomobject]@{ProcessId=7777;CommandLine='node H:\PTI-OnePiece\runtime\launch-current.mjs'})
Expect-Refusal {Stop-OnePieceRuntime -Config $config -State $state} 'launcher-or-supervisor-still-active'

Reset-Fixture
$script:ports=@([pscustomobject]@{LocalAddress='192.168.68.105';LocalPort=18099})
Expect-Refusal {Stop-OnePieceRuntime -Config $config -State $state} 'runtime-port-still-active'

Reset-Fixture
$script:supervisorAlive=$true
$script:supervisor=[pscustomobject]@{ProcessId=1234;ExecutablePath='C:\unrelated\node.exe';CommandLine='synthetic unrelated process'}
Expect-Refusal {Stop-OnePieceRuntime -Config $config -State $state -WriteStopRequest {throw 'must not request foreign shutdown'}} 'supervisor-identity'
if($script:stopCalls -ne 0){throw 'foreign-supervisor-mutated'}

Reset-Fixture
$script:supervisorAlive=$true
$script:supervisor=[pscustomobject]@{ProcessId=1234;ExecutablePath=$config.nodeExecutable;CommandLine='node F:\synthetic-fixture\apps\one-piece\companion\src\runtime\supervisor.mjs --config H:\PTI-OnePiece\runtime\private\config.json'}
$proof=Stop-OnePieceRuntime -Config $config -State $state -WriteStopRequest {$script:writeCalls++;$script:supervisorAlive=$false;$script:task.State='Ready'}
if(-not $proof.stopped -or $script:writeCalls -ne 1 -or $script:stopCalls -ne 0){throw 'graceful-shutdown-order'}

# Execute the activation's actual read-only inspection with every OS dependency
# replaced by the fixture commands above; no protected H file is opened.
function Get-Content {param($LiteralPath,[switch]$Raw) return ($config|ConvertTo-Json -Compress)}
function Test-Path {param($LiteralPath) return $false}
$inspection=& {${inspectionScript}}
$inspected=$inspection|ConvertFrom-Json
if($inspected.launcherCount -ne 0 -or $inspected.supervisorCount -ne 0 -or $inspected.recordedProcessCount -ne 0 -or $inspected.listeningPortCount -ne 0 -or $inspected.taskState -ne 'Ready'){throw 'activation-inspection'}
$script:task.State='Running'
$inspection=& {${inspectionScript}}
if(($inspection|ConvertFrom-Json).taskState -ne 'Running'){throw 'activation-backoff-task-missed'}
[Console]::Out.Write('{"synthetic":true,"scenarios":9,"activationInspectionMocked":true,"runtimeMutated":false}')
`;
 let result;
 try{result=await promisify(execFile)(path.win32.join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:15000,maxBuffer:16384});}
 catch(error){throw new Error(`Windows stop fixture failed: ${String(error.stderr??'').slice(-2000)}`);}
 assert.deepEqual(JSON.parse(result.stdout),{synthetic:true,scenarios:9,activationInspectionMocked:true,runtimeMutated:false});
});
