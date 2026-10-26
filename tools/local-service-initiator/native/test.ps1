param([string]$BuildDirectory='F:\Workspace\Support\PTI\native-launcher-build')
$ErrorActionPreference='Stop'
$helper=Join-Path ([IO.Path]::GetFullPath($BuildDirectory)) 'PTI.LocalServiceHost.exe'
$companion=Join-Path ([IO.Path]::GetFullPath($BuildDirectory)) 'PTI.ConsoleProbe.exe'
function Get-Subsystem([string]$Path) {
    $bytes=[IO.File]::ReadAllBytes($Path)
    $pe=[BitConverter]::ToInt32($bytes,0x3c)
    [BitConverter]::ToUInt16($bytes,$pe+4+20+68)
}
if ((Get-Subsystem $helper) -ne 2) { throw 'Service host must be the Windows GUI subsystem, with no allocated console.' }
if ((Get-Subsystem $companion) -ne 3) { throw 'Probe companion must be the console subsystem to test console suppression.' }
$assembly=[Reflection.Assembly]::LoadFile($helper)
$quote=$assembly.GetType('NativeLauncher').GetMethod('Quote',[Reflection.BindingFlags]'NonPublic,Static')
$cases=@(
    @{input='simple';expected='"simple"'},
    @{input='C:\folder with space\file';expected='"C:\folder with space\file"'},
    @{input='C:\trailing\';expected='"C:\trailing\\"'},
    @{input='embedded"quote';expected='"embedded\"quote"'}
)
foreach ($case in $cases) { if ($quote.Invoke($null,@($case.input)) -ne $case.expected) { throw 'Windows fixed-argument escaping regression.' } }
$process=Start-Process -FilePath $helper -ArgumentList @('F:\not-the-protected-settings.json','worker') -PassThru -Wait -WindowStyle Hidden
if ($process.ExitCode -ne 2) { throw 'An arbitrary settings path must be refused before any service launch.' }
& (Join-Path $PSScriptRoot 'probe.ps1') -BuildDirectory $BuildDirectory -Output (Join-Path $BuildDirectory 'probe.json')
if ($LASTEXITCODE -ne 0) { throw 'Native probe failed.' }
Write-Output 'Native subsystem, fixed configuration, argument escaping and no-console tests passed. No model or controller started.'
