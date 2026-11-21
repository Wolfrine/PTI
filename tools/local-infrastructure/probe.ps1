$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Get-PhysicalCounters {
  $counters = @{}
  foreach ($adapter in Get-NetAdapter -Physical | Where-Object Status -eq 'Up') {
    $statistics = Get-NetAdapterStatistics -Name $adapter.Name
    $counters[[string]$adapter.InterfaceGuid] = @([double]$statistics.ReceivedBytes, [double]$statistics.SentBytes)
  }
  return $counters
}

function Get-NetworkRate {
  try {
    $before = Get-PhysicalCounters
    if ($before.Count -eq 0) { return $null }
    $clock = [Diagnostics.Stopwatch]::StartNew()
    Start-Sleep -Milliseconds 1200
    $after = Get-PhysicalCounters
    if ($before.Count -ne $after.Count) { return $null }
    $received = 0.0; $sent = 0.0
    foreach ($id in $before.Keys) {
      if (!$after.ContainsKey($id) -or $after[$id][0] -lt $before[$id][0] -or $after[$id][1] -lt $before[$id][1]) { return $null }
      $received += $after[$id][0] - $before[$id][0]
      $sent += $after[$id][1] - $before[$id][1]
    }
    return @{ receivedBytesPerSecond = [Math]::Round($received / $clock.Elapsed.TotalSeconds); sentBytesPerSecond = [Math]::Round($sent / $clock.Elapsed.TotalSeconds) }
  } catch { return $null }
}

function Get-DiskCapacity($letter) {
  try {
    $drive = [IO.DriveInfo]::new("${letter}:\")
    if ($drive.IsReady -and $drive.DriveType -eq 'Fixed') {
      return @{ totalBytes = $drive.TotalSize; usedBytes = $drive.TotalSize - $drive.TotalFreeSpace }
    }
  } catch {}
  return $null
}

function Read-Status($path) {
  try {
    $item = Get-Item -LiteralPath $path
    if ($item.PSIsContainer -or $item.Length -gt 256KB) { return $null }
    return Get-Content -LiteralPath $item.FullName -Raw | ConvertFrom-Json
  } catch { return $null }
}

function Get-Epoch($value) {
  if (!$value) { return $null }
  try {
    $time = if ($value -is [long] -or $value -is [int]) { [DateTimeOffset]::FromUnixTimeMilliseconds($value) } else { [DateTimeOffset]$value }
    if ($time.Year -lt 2020 -or $time -gt [DateTimeOffset]::UtcNow) { return $null }
    return $time.ToUnixTimeMilliseconds()
  } catch { return $null }
}

function Get-Worker($id, $taskName, $processObserved, $periodic = $false) {
  $task = $tasks[$taskName]
  if (!$task -and $processObserved -ne $true) { return $null }
  $status = 'unknown'
  $evidence = 'task'
  $lastSeenAt = $null
  if ($processObserved -eq $true) {
    $evidence = 'process'
    $lastSeenAt = $now
  } elseif ($task -and !$periodic -and $processObserved -eq $false -and $task.State -in @('Ready', 'Disabled')) {
    $evidence = 'missing'
  }
  return @{ id = $id; status = $status; evidence = $evidence; lastSeenAt = $lastSeenAt; queued = $null; running = $null; components = @() }
}

function Find-Process($name, $pattern) {
  return $processes | Where-Object { $_.Name -match $name -and $_.CommandLine -match $pattern } | Select-Object -First 1
}

function Test-Process($name, $pattern) {
  if (!$processesKnown) { return $null }
  return [bool](Find-Process $name $pattern)
}

function Set-WorkerStatus($worker, $at, $status, $evidence, $maxAge = 180000, $running = $null) {
  if (!$worker -or !$at -or [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $at -gt $maxAge) { return }
  $worker.status = $status
  $worker.evidence = $evidence
  $worker.lastSeenAt = $at
  $worker.running = $running
}

$tasks = @{}
try {
  Get-ScheduledTask -TaskPath '\' | ForEach-Object { $tasks[$_.TaskName] = $_ }
} catch {}
$processesKnown = $false
try {
  $filter = "Name='node.exe' OR Name='python.exe' OR Name='pythonw.exe' OR Name='blender.exe' OR Name='jellyfin.exe' OR Name='caddy.exe'"
  $processes = Get-CimInstance -ClassName Win32_Process -Filter $filter -Property ProcessId,Name,CommandLine -OperationTimeoutSec 12
  $processesKnown = $true
} catch {}
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

$relay = Get-Worker 'local-codex' 'PTI Local Codex Relay' (Test-Process '^node\.exe$' '[\\/]LocalCodexBridge[\\/].*relay\.mjs')
$usage = Get-Worker 'codex-usage' 'PTI Codex Usage Monitor' $null $true
$assistant = Get-Worker 'gt-papers' 'PTI GT Papers Host' (Test-Process '^node\.exe$' '[\\/]gtop-assistant[\\/]src[\\/]main\.ts')
$checkingProcess = Find-Process '^node\.exe$' '[\\/]GTOP[\\/]grading[\\/]releases[\\/][a-f0-9]{40}[\\/].*[\\/]src[\\/]checking-worker\.ts'
$checking = Get-Worker 'gt-checking' 'GTOP Paper Checking' $(if ($processesKnown) { [bool]$checkingProcess })
$initiator = Get-Worker 'service-initiator' 'PTI Local Service Initiator' (Test-Process '^node\.exe$' 'local-service-initiator[\\/].*\.(?:mjs|cjs)')
$velum = Get-Worker 'velum-studio' 'PTI Velum Studio Worker' (Test-Process '^(?:node|python)\.exe$' 'velum-worker[\\/].*(?:worker|supervisor)')
$taleweald = Get-Worker 'taleweald-models' 'Taleweald Image3D Local Worker' (Test-Process '^node\.exe$' 'taleweald.*(?:image3d|local-worker)')
$blinkit = Get-Worker 'morsel-blinkit' 'PTI Blinkit Reader' (Test-Process '^node\.exe$' 'blinkit-reader[\\/].*\.mjs')
$onePiece = Get-Worker 'one-piece' 'PTI-OnePiece-Companion' (Test-Process '^node\.exe$' 'one-piece[\\/].*server\.mjs|one-piece-host[\\/]')
$ops = Get-Worker 'taleweald-ops' 'Taleweald Ops observer' $null $true
$android = Get-Worker 'android-auto' 'Android Auto Diagnostics Helper' (Test-Process '^node\.exe$' '[\\/]AndroidAutoDiagnostics[\\/]helper[\\/]daemon\.mjs')

$relayStatus = Read-Status 'H:\LocalCodexBridge\data\status.json'
if ($relayStatus.state -eq 'online' -and $relayStatus.listenerConnected -eq $true) {
  Set-WorkerStatus $relay (Get-Epoch $relayStatus.at) 'available' 'heartbeat'
}

$usageEvents = Read-Status 'H:\Workspace\Runtimes\PTI\codex-usage-monitor\data\events.json'
$usageEvent = @($usageEvents | Where-Object { $null -ne $_ }) | Select-Object -Last 1
if ($usageEvent.event -eq 'published' -and ($usageEvent.allowance -eq 'ok' -or $usageEvent.daily -eq 'ok')) {
  Set-WorkerStatus $usage (Get-Epoch $usageEvent.at) 'available' 'heartbeat' 720000
}

$initiatorStatus = Read-Status 'F:\Workspace\Support\PTI\local-service-initiator\data\status.json'
if ($initiatorStatus.state -eq 'ready') {
  Set-WorkerStatus $initiator (Get-Epoch $initiatorStatus.lastPollAt) 'available' 'heartbeat'
}

$hostAt = Get-Epoch $initiatorStatus.checkedAt
if (!$assistant -and $initiator -and $hostAt -and $now - $hostAt -le 180000 -and $initiatorStatus.localState -in @('running', 'stopped')) {
  $assistant = @{ id = 'gt-papers'; status = 'unknown'; evidence = 'unavailable'; lastSeenAt = $null; queued = $null; running = $null; components = @() }
}
if ($initiatorStatus.workerRunning -eq $true -and $initiatorStatus.workerHealthy -eq $true) {
  Set-WorkerStatus $assistant $hostAt 'available' 'health'
} elseif ($assistant -and $initiatorStatus.localState -eq 'stopped' -and $hostAt -and $now - $hostAt -le 180000) {
  $assistant.status = 'offline'
  $assistant.evidence = 'missing'
}
if ($assistant) { $assistant.components = @(@{ id = 'ollama-gt'; observed = $null }) }

$checkingStatus = Read-Status 'H:\Workspace\Runtimes\GTOP\grading\production\checking-status.json'
if ($checkingProcess -and $checkingStatus.pid -eq $checkingProcess.ProcessId -and $checkingStatus.connected -eq $true) {
  if ($checkingStatus.state -eq 'idle') { Set-WorkerStatus $checking (Get-Epoch $checkingStatus.updatedAt) 'idle' 'health' }
  if ($checkingStatus.state -eq 'working') { Set-WorkerStatus $checking (Get-Epoch $checkingStatus.updatedAt) 'working' 'health' }
}
if ($checking) { $checking.components = @(@{ id = 'ollama-checking'; observed = $null }) }

$velumStatus = Read-Status 'F:\Workspace\Programs\Independent-Products\PTI\tools\velum-worker\.runtime\status.json'
if ($velumStatus.listenerConnected -eq $true) {
  $velumAt = Get-Epoch $velumStatus.updatedAt
  if ($velumStatus.state -eq 'running' -and $velumStatus.activeJob -match '^[A-Za-z0-9_-]{1,80}$') {
    Set-WorkerStatus $velum $velumAt 'working' 'heartbeat' 180000 1
  } elseif ($velumStatus.state -eq 'idle' -and $velumStatus.activeJob -eq '') {
    Set-WorkerStatus $velum $velumAt 'idle' 'heartbeat' 180000 0
  }
}
if ($velum) { $velum.components = @(@{ id = 'comfyui'; observed = Test-Process '^pythonw?\.exe$' 'ComfyUI[\\/].*main\.py' }) }

if ($taleweald) { $taleweald.components = @(@{ id = 'blender'; observed = Test-Process '^blender\.exe$' 'Taleweald|UltraTex|Hunyuan' }) }

$blinkitFile = 'F:\Workspace\Support\PTI\blinkit-reader\data\status.json'
$blinkitStatus = Read-Status $blinkitFile
$blinkitAt = if ($blinkitStatus) { Get-Epoch (Get-Item -LiteralPath $blinkitFile -ErrorAction SilentlyContinue).LastWriteTimeUtc }
if ($blinkitStatus.morselBridgeReady -eq $true) {
  Set-WorkerStatus $blinkit $blinkitAt 'available' 'health'
} elseif ($blinkit -and $blinkitStatus.status -eq 'morsel_login_required' -and $blinkitAt -and $now - $blinkitAt -le 180000) {
  Set-WorkerStatus $blinkit $blinkitAt 'unknown' 'health'
  $blinkit.condition = 'sign-in-required'
}

$onePieceStatus = Read-Status 'F:\Workspace\Support\PTI\local-service-initiator\data\one-piece-status.json'
if ($onePieceStatus.companionReady -eq $true) {
  Set-WorkerStatus $onePiece (Get-Epoch $onePieceStatus.checkedAt) 'available' 'health'
}
if ($onePiece) {
  $onePiece.components = @(
    @{ id = 'jellyfin'; observed = Test-Process '^jellyfin\.exe$' 'OnePiece|one-piece' },
    @{ id = 'caddy'; observed = Test-Process '^caddy\.exe$' 'OnePiece|one-piece' }
  )
}

if ($ops) {
  try {
    $result = Get-ScheduledTaskInfo -InputObject $tasks['Taleweald Ops observer']
    if ($tasks['Taleweald Ops observer'].State -eq 'Ready' -and $result.LastTaskResult -eq 1) { $ops.condition = 'reported-error' }
  } catch {}
}

$workers = @($relay, $usage, $assistant, $checking, $initiator, $velum, $taleweald, $blinkit, $onePiece, $ops, $android | Where-Object { $null -ne $_ })
@{ disks = @{ F = Get-DiskCapacity 'F'; H = Get-DiskCapacity 'H' }; network = Get-NetworkRate; workers = $workers } | ConvertTo-Json -Depth 7 -Compress
