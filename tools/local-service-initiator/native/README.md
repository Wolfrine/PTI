# Windowless local service host

This Windows .NET Framework WinExe launches only the two locally configured GTOP roles and the optional fixed One Piece launcher. It uses `ProcessStartInfo.UseShellExecute=false` and `CreateNoWindow=true`, with redirected standard input/output/error. There is no shell, PowerShell child, console, desktop switching, focus manipulation, elevation, credential operation or remote command selection. The existing One Piece scheduled task serializes logon and explicit start requests through this host.

The installed .NET SDK is absent on this PC. `build.ps1` uses the already installed Windows Framework 4.x C# compiler; it downloads nothing. Both source and all build/probe outputs are on F. The default output is `F:\Workspace\Support\PTI\native-launcher-build`.

```powershell
./build.ps1
./probe.ps1
./test.ps1
```

Runtime invocation after the owner installs the WinExe:

```text
PTI.LocalServiceHost.exe F:\Workspace\Support\PTI\local-service-initiator\settings.json ollama
PTI.LocalServiceHost.exe F:\Workspace\Support\PTI\local-service-initiator\settings.json worker
```

Settings must be at that exact protected installation location, contain `workerId:sachit-windows`, and use its exact F-drive `data` directory. Ollama is restricted to the installed current user's `LocalAppData\Programs\Ollama\ollama.exe serve`. It receives only selected Windows environment variables plus explicit loopback, existing model directory, one-model limits and `OLLAMA_NO_CLOUD=1`. No model is downloaded or warmed.

Version 1.2.0 requires `ollamaEndpoint` (default `http://127.0.0.1:11435`) and the existing `H:\GTOP-Local-AI\models\ollama` root. Port 11434 is rejected; the native host checks dedicated-port occupancy under the role mutex before spawning. Worker mode validates [runner contract v1](../GTOP-RUNNER-CONTRACT.md) and supplies its endpoint, current Codex executable and dynamic resolver helper through explicit `GTOP_*` environment variables. Host records include helper/child creation timestamps and endpoint/model ownership, plus the worker contract identity. Inherited user-level Ollama variables are not forwarded.

Worker mode requires `workerNodeExecutable` to equal the private installation's `runtime\node.exe`. It generates the fixed Node loader/main/config arguments from `controllerRoot` and `workerConfig`; no shell text is accepted. It reads existing worker configuration only to verify the paired worker and find `dataDirectory`. Existing worker stdout/stderr stay there and `process.json` is emitted as BOM-free UTF-8. F-drive `ollama-host.json` and `worker-host.json` record helper and child PID, fixed executable, start time and exit state. A PID record proves process creation, not assistant readiness; Firebase worker heartbeats remain authoritative. A per-user, per-role mutex prevents duplicate helpers.

The helper stays alive to drain child logs and wait for exit. Parent Node must launch the WinExe detached with ignored standard handles. The helper itself has the Windows GUI subsystem and creates no console. The no-inference probe launches only a fixed companion compiled from this same source with the **console** subsystem. `GetConsoleWindow()==0` on that child confirms the console-suppression setting is effective; input-desktop names before/after must match. No Ollama, Node controller or model is started by the probe. Probe files are explicitly synthetic and contain no credentials.

Passing this deterministic probe is separate from a real scheduled invocation and checking that the actual service/runner remains windowless during use. The probe does not establish performance, educational quality, GPU behavior or game acceptance.

Microsoft primary references: [ProcessStartInfo.CreateNoWindow](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.processstartinfo.createnowindow), [UseShellExecute](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.processstartinfo.useshellexecute), [CreateProcess flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags), [CreateDesktop](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-createdesktopw), [Desktop security](https://learn.microsoft.com/en-us/windows/win32/winstation/desktop-security-and-access-rights). Private desktops were investigated and deliberately omitted after the owner identified transient console windows as the problem; the implementation never changes or activates a desktop.
