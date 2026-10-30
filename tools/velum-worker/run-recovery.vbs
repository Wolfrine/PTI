Option Explicit
' Windowless from creation; wait and propagate the helper result to Task Scheduler.
Dim shell, files, root, powershell, command
If WScript.Arguments.Count <> 1 Then WScript.Quit 2
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
If LCase(files.GetFileName(WScript.Arguments(0))) <> "node.exe" Then WScript.Quit 2
If Not files.FileExists(WScript.Arguments(0)) Then WScript.Quit 2
root = files.GetParentFolderName(WScript.ScriptFullName)
powershell = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
command = """" & powershell & """ -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & root & "\recovery.ps1"" -NodePath """ & WScript.Arguments(0) & """"
WScript.Quit shell.Run(command, 0, True)
