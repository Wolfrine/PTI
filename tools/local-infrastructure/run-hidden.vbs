Option Explicit
Dim shell, filesystem, root, node, command
If WScript.Arguments.Count <> 1 Then WScript.Quit 2
Set shell = CreateObject("WScript.Shell")
Set filesystem = CreateObject("Scripting.FileSystemObject")
root = filesystem.GetParentFolderName(WScript.ScriptFullName)
node = WScript.Arguments(0)
shell.CurrentDirectory = root
shell.Environment("Process")("GOOGLE_CLOUD_QUOTA_PROJECT") = "worldline-intel"
shell.Environment("Process")("TEMP") = "H:\Workspace\Temp"
shell.Environment("Process")("TMP") = "H:\Workspace\Temp"
command = Chr(34) & node & Chr(34) & " " & Chr(34) & root & "\observer.mjs" & Chr(34) & " publish"
WScript.Quit shell.Run(command, 0, True)
