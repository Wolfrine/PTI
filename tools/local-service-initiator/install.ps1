param(
    [string]$WorkerConfig = 'H:\GTOP-Local-AI\pilot-runtime\worker.json',
    [string]$ControllerRoot = 'H:\GTOP-Local-AI\gtop-documentation\tools\gtop-assistant',
    [string]$ModelDirectory = 'H:\GTOP-Local-AI\models\ollama',
    [switch]$NoSchedule
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
foreach ($file in @('run.ps1','run-hidden.vbs','status.ps1')) { Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination $installRoot -Force }
$settings = @{workerId=$worker.workerId;gateway=$worker.gateway;workerConfig=[IO.Path]::GetFullPath($WorkerConfig);controllerRoot=[IO.Path]::GetFullPath($ControllerRoot);ollamaExecutable=$ollamaPath;modelDirectory=[IO.Path]::GetFullPath($ModelDirectory);stateDirectory=(Join-Path $installRoot 'data')}
[IO.File]::WriteAllText((Join-Path $installRoot 'settings.json'), ($settings | ConvertTo-Json))
$active = @{version=$version;sourceRevision=$revision;release=$release;nodePath=$nodePath;installedAt=[DateTime]::UtcNow.ToString('o')}
[IO.File]::WriteAllText((Join-Path $installRoot 'active.json.tmp'), ($active | ConvertTo-Json))
Move-Item -LiteralPath (Join-Path $installRoot 'active.json.tmp') -Destination (Join-Path $installRoot 'active.json') -Force
if ($NoSchedule) { Write-Output 'Initiator installed; scheduler unchanged.'; exit 0 }
$taskName = 'PTI Local Service Initiator'
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\wscript.exe') -Argument ('//B //NoLogo "' + (Join-Path $installRoot 'run-hidden.vbs') + '"') -WorkingDirectory $installRoot
$triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $currentUser),(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Receive authenticated fixed GTOP start requests; no inference, public port, password or PC wake.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output 'Windowless initiator scheduled. Only a remote authorized start request launches GTOP; idle model remains unloaded.'
