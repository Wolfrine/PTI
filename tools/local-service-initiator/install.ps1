param(
    [string]$WorkerConfig = 'H:\GTOP-Local-AI\pilot-runtime\worker.json',
    [string]$ControllerRoot = 'H:\GTOP-Local-AI\gtop-documentation\tools\gtop-assistant',
    [string]$ModelDirectory = 'H:\GTOP-Local-AI\models\ollama',
    [switch]$NoSchedule,
    [switch]$EnableOnePiece
)
$ErrorActionPreference = 'Stop'
$installRoot = [IO.Path]::GetFullPath('F:\Workspace\Support\PTI\local-service-initiator')
$sourceRoot = $PSScriptRoot
$nodeCandidates = @('F:\Workspace\Support\tools\node-24\node.exe',(Get-Command node.exe -ErrorAction Stop).Source,(Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'))
$nodeSource = $null
foreach ($candidate in $nodeCandidates) { if (Test-Path -LiteralPath $candidate -PathType Leaf) { $reportedVersion = & $candidate --version; if ($reportedVersion -match '^v(\d+)\.' -and [int]$Matches[1] -ge 22) { $nodeSource = $candidate; break } } }
if (!$nodeSource) { throw 'Node.js 22+ is required. No existing supported runtime was found.' }
$worker = Get-Content -LiteralPath $WorkerConfig -Raw | ConvertFrom-Json
if ($worker.workerId -ne 'sachit-windows' -or !$worker.secretProtected -or $worker.ollama -ne 'http://127.0.0.1:11434') { throw 'Existing protected GTOP pairing is required.' }
foreach ($required in @($WorkerConfig,(Join-Path $ControllerRoot 'start-worker.ps1'),$ModelDirectory)) { if (!(Test-Path -LiteralPath $required)) { throw 'A configured GTOP dependency is missing.' } }
$ollamaPath = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
if (!(Test-Path -LiteralPath $ollamaPath -PathType Leaf)) { throw 'Existing Ollama application is missing.' }
if ((Test-Path -LiteralPath $installRoot) -and ((Get-Item -LiteralPath $installRoot).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Install root cannot be a junction.' }
$version = (Get-Content -LiteralPath (Join-Path $sourceRoot 'package.json') -Raw | ConvertFrom-Json).version
$revision = (& git -C $sourceRoot rev-parse --short HEAD)
if ($version -notmatch '^\d+\.\d+\.\d+$' -or $revision -notmatch '^[a-f0-9]+$') { throw 'Invalid source version.' }
$release = 'releases\' + $version + '-' + $revision
$releaseRoot = Join-Path $installRoot $release
$protectModule = [IO.Path]::GetFullPath((Join-Path $sourceRoot '..\codex-usage-monitor\src\dpapi.mjs'))
& $nodeSource --input-type=module -e "const {pathToFileURL}=await import('node:url'); const {WindowsProtection}=await import(pathToFileURL(process.argv[1])); await new WindowsProtection().secureDirectory(process.argv[2]);" $protectModule $installRoot
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the private installation directory.' }
New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
$runtimeRoot = Join-Path $installRoot 'runtime'
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$nodePath = Join-Path $runtimeRoot 'node.exe'
if (!(Test-Path -LiteralPath $nodePath) -or (Get-FileHash -LiteralPath $nodePath).Hash -ne (Get-FileHash -LiteralPath $nodeSource).Hash) { Copy-Item -LiteralPath $nodeSource -Destination $nodePath -Force }
if ((Get-FileHash -LiteralPath $nodePath).Hash -ne (Get-FileHash -LiteralPath $nodeSource).Hash) { throw 'Node runtime copy did not verify.' }
Copy-Item -LiteralPath (Join-Path $sourceRoot 'src') -Destination $releaseRoot -Recurse -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'package.json') -Destination $releaseRoot -Force
$nativeDirectory = Join-Path $releaseRoot 'native'
& (Join-Path $sourceRoot 'native\build.ps1') -OutputDirectory $nativeDirectory | Out-Null
& (Join-Path $sourceRoot 'native\test.ps1') -BuildDirectory $nativeDirectory | Out-Null
foreach ($file in @('run.ps1','run-hidden.vbs','status.ps1')) { Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination $installRoot -Force }
$settings = @{workerId=$worker.workerId;gateway=$worker.gateway;workerConfig=[IO.Path]::GetFullPath($WorkerConfig);controllerRoot=[IO.Path]::GetFullPath($ControllerRoot);ollamaExecutable=$ollamaPath;modelDirectory=[IO.Path]::GetFullPath($ModelDirectory);stateDirectory=(Join-Path $installRoot 'data');helperExecutable=(Join-Path $nativeDirectory 'PTI.LocalServiceHost.exe');workerNodeExecutable=$nodePath}
if ($EnableOnePiece) {
    if (!(Test-Path -LiteralPath 'H:\PTI-OnePiece\runtime\private\config.json' -PathType Leaf)) { throw 'Existing One Piece installation is required.' }
    $settings.onePieceEnabled = $true
    $companionTask = Get-ScheduledTask -TaskName 'PTI-OnePiece-Companion' -TaskPath '\' -ErrorAction Stop
    if ([string]$companionTask.Settings.MultipleInstances -ne 'IgnoreNew') { throw 'One Piece task must serialize starts.' }
    $previousAction = Join-Path $installRoot 'one-piece-task-previous.json'
    if (!(Test-Path -LiteralPath $previousAction)) {
        [IO.File]::WriteAllText($previousAction, (@{execute=$companionTask.Actions.Execute;arguments=$companionTask.Actions.Arguments;workingDirectory=$companionTask.Actions.WorkingDirectory} | ConvertTo-Json))
    }
    # Update the NEXT invocation only. Do not stop the companion or alter its
    # triggers/principal/settings while a family member may be watching.
    $companionAction = New-ScheduledTaskAction -Execute (Join-Path $nativeDirectory 'PTI.LocalServiceHost.exe') -Argument ('"' + (Join-Path $installRoot 'settings.json') + '" one-piece') -WorkingDirectory $installRoot
}
[IO.File]::WriteAllText((Join-Path $installRoot 'settings.json.tmp'), ($settings | ConvertTo-Json))
Move-Item -LiteralPath (Join-Path $installRoot 'settings.json.tmp') -Destination (Join-Path $installRoot 'settings.json') -Force
$active = @{version=$version;sourceRevision=$revision;release=$release;nodePath=$nodePath;installedAt=[DateTime]::UtcNow.ToString('o')}
[IO.File]::WriteAllText((Join-Path $installRoot 'active.json.tmp'), ($active | ConvertTo-Json))
Move-Item -LiteralPath (Join-Path $installRoot 'active.json.tmp') -Destination (Join-Path $installRoot 'active.json') -Force
if ($NoSchedule) { Write-Output 'Initiator installed; scheduler unchanged.'; exit 0 }
if ($EnableOnePiece) { Set-ScheduledTask -TaskName 'PTI-OnePiece-Companion' -TaskPath '\' -Action $companionAction | Out-Null }
$taskName = 'PTI Local Service Initiator'
# Task Scheduler can stop its script host while leaving a waiting Node child.
# Upgrade only our exact installed initiator; native service hosts stay independent.
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Disable-ScheduledTask -TaskName $taskName | Out-Null
    Stop-ScheduledTask -TaskName $taskName
}
$priorStatusFile = Join-Path $installRoot 'data\status.json'
if (Test-Path -LiteralPath $priorStatusFile) {
    $priorStatus = Get-Content -LiteralPath $priorStatusFile -Raw | ConvertFrom-Json
    if ($priorStatus.pid) {
        $priorProcess = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$priorStatus.pid)
        $normalizedRoot = $installRoot.Replace('\','/')
        if ($priorProcess -and $priorProcess.Name -eq 'node.exe' -and $priorProcess.ExecutablePath -eq $nodePath -and $priorProcess.CommandLine.Replace('\','/').Contains($normalizedRoot+'/releases/') -and $priorProcess.CommandLine.Replace('\','/').Contains($normalizedRoot+'/settings.json')) {
            Stop-Process -Id $priorProcess.ProcessId -Force
            Start-Sleep -Milliseconds 800
        }
    }
}
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\wscript.exe') -Argument ('//B //NoLogo "' + (Join-Path $installRoot 'run-hidden.vbs') + '"') -WorkingDirectory $installRoot
$triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $currentUser),(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Receive authenticated fixed GTOP and optional One Piece start requests; no inference, public port, password or PC wake.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output 'Windowless initiator scheduled. Only a remote authorized start request launches GTOP; idle model remains unloaded.'
