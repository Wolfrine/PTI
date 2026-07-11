[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $GhArguments
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command gh.exe -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI (gh.exe) is not installed.'
}

$credentialText = "protocol=https`nhost=github.com`n`n" | git credential fill
$passwordLine = $credentialText |
    Where-Object { $_ -like 'password=*' } |
    Select-Object -First 1

if (-not $passwordLine) {
    throw 'Windows Git Credential Manager did not return a GitHub credential.'
}

try {
    $env:GH_TOKEN = $passwordLine.Substring('password='.Length)
    & gh.exe @GhArguments
    exit $LASTEXITCODE
}
finally {
    Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue
    Remove-Variable passwordLine, credentialText -ErrorAction SilentlyContinue
}
