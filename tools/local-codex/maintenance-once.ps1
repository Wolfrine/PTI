param([Parameter(Mandatory=$true)][string]$Manifest,[Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ManifestSHA256,[switch]$Recover)
$ErrorActionPreference = 'Stop'
$manifestPath = [IO.Path]::GetFullPath($Manifest)
if (-not $manifestPath.StartsWith('F:\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Maintenance manifest must be on F:.' }
if ((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash -ne $ManifestSHA256) { throw 'Manifest differs from the hash pinned in the owner task action.' }
$stageRoot = Split-Path -Parent $manifestPath
$value = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($value.stage -ne $stageRoot) { throw 'Manifest staging directory mismatch.' }
foreach ($file in $value.runtimeFiles) {
  $target = [IO.Path]::GetFullPath((Join-Path $stageRoot $file.name))
  if (-not $target.StartsWith(($stageRoot + '\'),[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid helper path.' }
  if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $file.sha256) { throw 'Staged helper hash mismatch.' }
}
$operation = if ($Recover) { 'recover' } else { 'execute' }
& ([string]$value.nodePath) (Join-Path $stageRoot 'runner.mjs') --action $operation --manifest $manifestPath --manifest-sha256 $ManifestSHA256
exit $LASTEXITCODE
