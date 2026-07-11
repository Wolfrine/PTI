[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$portableJava = 'F:\Workspace\Support\tools\jdk-21\jdk-21.0.11+10'

if (Test-Path -LiteralPath $portableJava) {
    $env:JAVA_HOME = $portableJava
    $env:Path = "$portableJava\bin;$env:Path"
}

$javaVersion = & cmd.exe /d /c "java -version 2>&1"
if ($LASTEXITCODE -ne 0 -or ($javaVersion -join "`n") -notmatch 'version "(2[1-9]|[3-9][0-9])') {
    throw 'Firestore emulator tests require Java 21 or newer.'
}

Push-Location $repoRoot
try {
    & firebase.cmd emulators:exec --project pti-rules-test --only firestore "node --test functions/test/firestore-rules.test.mjs"
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
