param([Parameter(Mandatory=$true)][string]$CertificatePath)
$ErrorActionPreference = 'Stop'
try {
    $expected = '307F6A88C652E429513F47B386F761249F52A30D6FE93B91ECE7501C3C640489'
    $resolved = [IO.Path]::GetFullPath($CertificatePath)
    if (-not $resolved.StartsWith('H:\PTI-OnePiece\', [StringComparison]::OrdinalIgnoreCase)) { throw 'certificate-path' }
    $certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($resolved)
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $fingerprint = ([BitConverter]::ToString($hash.ComputeHash($certificate.RawData))).Replace('-', '') } finally { $hash.Dispose() }
    if ($fingerprint -ne $expected -or $certificate.HasPrivateKey) { throw 'certificate-fingerprint' }
    $wasPresent = Test-Path -LiteralPath ('Cert:\CurrentUser\Root\' + $certificate.Thumbprint)
    if (-not $wasPresent) { Import-Certificate -FilePath $resolved -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null }
    if (-not (Test-Path -LiteralPath ('Cert:\CurrentUser\Root\' + $certificate.Thumbprint))) { throw 'certificate-import' }
    [ordered]@{ installed = $true; alreadyPresent = [bool]$wasPresent; store = 'CurrentUser\Root'; certificateSha256 = $fingerprint; privateKeyImported = $false } | ConvertTo-Json -Compress
} catch { [Console]::Error.Write('household-ca-install-failed'); exit 1 }
