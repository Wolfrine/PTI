param([ValidateSet('Protect','Unprotect')][string]$Mode)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$utf8 = New-Object System.Text.UTF8Encoding($false)
$inputValue = [Console]::In.ReadToEnd()
$entropy = $utf8.GetBytes('PTI Velum dedicated device v2')
if ($Mode -eq 'Protect') {
    $sealed = [Security.Cryptography.ProtectedData]::Protect($utf8.GetBytes($inputValue),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Console]::Out.Write([Convert]::ToBase64String($sealed))
} else {
    $plain = [Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($inputValue),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Console]::Out.Write($utf8.GetString($plain))
    [Array]::Clear($plain,0,$plain.Length)
}
