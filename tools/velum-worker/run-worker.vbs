Option Explicit
Dim shell, fso, root, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
If WScript.Arguments.Count <> 1 Then WScript.Quit 2
shell.CurrentDirectory = root
command = Chr(34) & WScript.Arguments(0) & Chr(34) & " " & Chr(34) & fso.BuildPath(root, "worker.mjs") & Chr(34)
WScript.Quit shell.Run(command, 0, True)
