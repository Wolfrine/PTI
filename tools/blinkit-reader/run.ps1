param([ValidateSet('run','once','replay')][string]$Command='run',[string]$EventId)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($PSScriptRoot)
if($root -ne 'F:\Workspace\Support\PTI\blinkit-reader'){throw 'Use the installed F-drive reader.'}
if($Command -eq 'replay'){
 if($EventId -notmatch '^blinkit-gmail-[a-f0-9]{8,40}$'){throw 'Invalid event ID.'}
 $request=Join-Path $root 'data\replay.request'
 [IO.File]::WriteAllText($request+'.tmp',(@{eventId=$EventId;requestedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json))
 Move-Item -LiteralPath ($request+'.tmp') -Destination $request -Force
 Write-Output 'Replay requested. Inspect canonical event/readback and reader status; this is not processed acceptance.'
 exit 0
}
$active=Get-Content -LiteralPath (Join-Path $root 'active.json') -Raw | ConvertFrom-Json
if($active.release -notmatch '^releases\\[A-Za-z0-9.-]+$'){throw 'Invalid active release.'}
$release=[IO.Path]::GetFullPath((Join-Path $root $active.release))
if(!$release.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Release outside installation.'}
if(Test-Path -LiteralPath (Join-Path $root 'data\stop.request')){exit 0}
$extra=if($Command -eq 'once'){' --once'}else{''}
$info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$active.nodePath;$info.Arguments='"'+(Join-Path $release 'src\daemon.mjs')+'" --root "'+$root+'"'+$extra;$info.WorkingDirectory=$release;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WindowStyle='Hidden';$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
$process=[Diagnostics.Process]::Start($info);$out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync();$process.WaitForExit();$out.Wait();$err.Wait();exit $process.ExitCode
