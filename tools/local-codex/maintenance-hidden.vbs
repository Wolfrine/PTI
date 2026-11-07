Option Explicit
Dim shell, files, manifest, digest, root, command, result
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
If WScript.Arguments.Count <> 2 Then WScript.Quit 2
manifest = WScript.Arguments(0)
digest = WScript.Arguments(1)
If Len(digest) <> 64 Then WScript.Quit 2
root = files.GetParentFolderName(WScript.ScriptFullName)
command = """" & shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & root & "\maintenance-once.ps1"" -Manifest """ & manifest & """ -ManifestSHA256 " & digest
result = shell.Run(command, 0, True)
WScript.Quit result
