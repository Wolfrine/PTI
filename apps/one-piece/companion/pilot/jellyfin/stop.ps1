param([string]$RuntimeRoot = 'H:\PTI-OnePiece\pilot\jellyfin', [switch]$EncodersOnly)
$ErrorActionPreference = 'Stop'
$pilotProcessId = [int](Get-Content -LiteralPath (Join-Path $RuntimeRoot 'private\process.id'))
$server = Get-CimInstance Win32_Process -Filter "ProcessId=$pilotProcessId"
if (-not $server) { Write-Output 'Isolated pilot is already stopped.'; exit 0 }
$expected = [IO.Path]::GetFullPath((Join-Path $RuntimeRoot 'runtime\jellyfin\jellyfin.exe'))
if ($server.Name -ne 'jellyfin.exe' -or $server.ExecutablePath -ne $expected) {
    throw 'Recorded PID does not identify this isolated Jellyfin executable. Refusing to stop it.'
}
function Get-PilotEncoderProcesses {
    Get-CimInstance Win32_Process | Where-Object {
        $_.ParentProcessId -eq $pilotProcessId -and $_.Name -in @('ffmpeg.exe','ffprobe.exe')
    } | ForEach-Object {
        $candidate = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
        if ($candidate -and -not $candidate.HasExited -and $candidate.ProcessName -in @('ffmpeg','ffprobe')) { $candidate }
    }
}
for ($attempt = 0; $attempt -lt 3; $attempt++) {
    $children = @(Get-PilotEncoderProcesses)
    if ($children.Count -eq 0) { break }
    foreach ($child in $children) {
        Stop-Process -InputObject $child -Force -ErrorAction SilentlyContinue
        try { $child.WaitForExit(1000) | Out-Null } catch { }
    }
}
if (@(Get-PilotEncoderProcesses).Count -gt 0) { throw 'An isolated pilot encoder/probe child remains after cancellation.' }
if ($EncodersOnly) { Write-Output 'Stopped only the isolated pilot encoder/probe children.'; exit 0 }
Stop-Process -Id $pilotProcessId
Write-Output 'Stopped only the isolated pilot and its encoder/probe children.'
