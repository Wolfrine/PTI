param([string]$RuntimeRoot = 'H:\PTI-OnePiece\pilot\jellyfin')
$ErrorActionPreference = 'Stop'
$server = Join-Path $RuntimeRoot 'runtime\jellyfin\jellyfin.exe'
if (-not (Test-Path -LiteralPath $server)) { throw 'Download/extract the pinned official portable bundle documented in README.md first.' }
$listener = Get-NetTCPConnection -LocalPort 18096 -State Listen -ErrorAction SilentlyContinue
if ($listener) { throw 'Port 18096 is already occupied. Inspect it before starting a second pilot.' }
foreach ($leaf in @('config-v2','data-v2','cache','logs','library','private')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $RuntimeRoot $leaf) | Out-Null
}
$networkPath = Join-Path $RuntimeRoot 'config-v2\network.xml'
if (-not (Test-Path -LiteralPath $networkPath)) {
@'
<?xml version="1.0" encoding="utf-8"?>
<NetworkConfiguration>
  <InternalHttpPort>18096</InternalHttpPort><PublicHttpPort>18096</PublicHttpPort>
  <EnableHttps>false</EnableHttps><RequireHttps>false</RequireHttps>
  <AutoDiscovery>false</AutoDiscovery><EnableUPnP>false</EnableUPnP>
  <EnableIPv4>true</EnableIPv4><EnableIPv6>false</EnableIPv6>
  <EnableRemoteAccess>false</EnableRemoteAccess>
  <LocalNetworkAddresses><string>127.0.0.1</string></LocalNetworkAddresses>
  <LocalNetworkSubnets><string>127.0.0.0/8</string></LocalNetworkSubnets>
</NetworkConfiguration>
'@ | Set-Content -LiteralPath $networkPath -Encoding utf8
}
[xml]$network = Get-Content -LiteralPath $networkPath
if ($network.NetworkConfiguration.LocalNetworkAddresses.string -ne '127.0.0.1' -or
    $network.NetworkConfiguration.AutoDiscovery -ne 'false' -or
    $network.NetworkConfiguration.EnableRemoteAccess -ne 'false') {
    throw 'Pilot requires loopback binding, disabled discovery, and disabled remote access.'
}
$arguments = @('--datadir',(Join-Path $RuntimeRoot 'data-v2'),'--configdir',(Join-Path $RuntimeRoot 'config-v2'),
    '--cachedir',(Join-Path $RuntimeRoot 'cache'),'--logdir',(Join-Path $RuntimeRoot 'logs'),
    '--ffmpeg',(Join-Path $RuntimeRoot 'runtime\jellyfin\ffmpeg.exe'),'--nowebclient','--nonetchange')
$process = Start-Process -FilePath $server -ArgumentList $arguments -WorkingDirectory (Split-Path $server) `
    -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $RuntimeRoot 'logs\console.out.log') `
    -RedirectStandardError (Join-Path $RuntimeRoot 'logs\console.err.log')
$process.Id | Set-Content -LiteralPath (Join-Path $RuntimeRoot 'private\process.id')
Write-Output "Started isolated Jellyfin pilot PID $($process.Id); inspect loopback binding before API setup."
