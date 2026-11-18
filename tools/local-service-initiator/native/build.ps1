param([string]$OutputDirectory='H:\Workspace\Builds\PTI\native-launcher')
$ErrorActionPreference='Stop'
$env:TEMP='H:\Workspace\Temp\PTI-native'
$env:TMP=$env:TEMP
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
$outputRoot=[IO.Path]::GetFullPath($OutputDirectory)
if (!$outputRoot.StartsWith('H:\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Native build output must be on H:; source stays on F:.' }
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'Installed Windows .NET Framework C# compiler is unavailable.' }
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$source=Join-Path $PSScriptRoot 'NativeLauncher.cs'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /r:System.Web.Extensions.dll ('/out:'+(Join-Path $outputRoot 'PTI.LocalServiceHost.exe')) $source
if ($LASTEXITCODE -ne 0) { throw 'Native WinExe build failed.' }
# Same fixed source, compiled as console subsystem, makes CREATE_NO_WINDOW test meaningful.
& $compiler /nologo /target:exe /platform:x64 /optimize+ /r:System.Web.Extensions.dll ('/out:'+(Join-Path $outputRoot 'PTI.ConsoleProbe.exe')) $source
if ($LASTEXITCODE -ne 0) { throw 'Native console probe build failed.' }
Get-FileHash -LiteralPath (Join-Path $outputRoot 'PTI.LocalServiceHost.exe'),(Join-Path $outputRoot 'PTI.ConsoleProbe.exe') | Select-Object Path,Hash
