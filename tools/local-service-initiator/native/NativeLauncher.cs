using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

// WinExe entry point: no console is allocated. Every child also explicitly requests
// CREATE_NO_WINDOW through ProcessStartInfo; no shell or PowerShell is involved.
internal static class NativeLauncher
{
    private const string InstallRoot = @"F:\Workspace\Support\PTI\local-service-initiator";
    private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 131072 };

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            if (args.Length == 2 && args[0] == "--probe") return Probe(args[1]);
            if (args.Length == 2 && args[0] == "--probe-child") return ProbeChild(args[1]);
            if (args.Length != 2 || (args[1] != "ollama" && args[1] != "worker")) return 2;
            if (!SamePath(args[0], Path.Combine(InstallRoot, "settings.json"))) return 2;
            return Run(ReadObject(args[0]), args[1]);
        }
        // Never allow an unhandled exception/error dialog onto the interactive desktop.
        // Caller observes exit status and the private host record; exception text is private.
        catch { return 1; }
    }

    private static int Run(Dictionary<string, object> settings, string mode)
    {
        if (Text(settings, "workerId") != "sachit-windows") throw new InvalidDataException();
        string state = Path.GetFullPath(Text(settings, "stateDirectory"));
        if (!SamePath(state, Path.Combine(InstallRoot, "data"))) throw new InvalidDataException();
        Directory.CreateDirectory(state);
        string sid = WindowsIdentity.GetCurrent().User.Value;
        bool acquired = false;
        using (Mutex mutex = new Mutex(false, @"Local\PTI-GTOP-Native-" + mode + "-" + sid))
        {
            try
            {
                try { acquired = mutex.WaitOne(0); } catch (AbandonedMutexException) { acquired = true; }
                if (!acquired) return 0;
                string executable, arguments, stdout, stderr, processRecord = null, configPath = null;
                ProcessStartInfo info;
                if (mode == "ollama")
                {
                    executable = Path.GetFullPath(Text(settings, "ollamaExecutable"));
                    string expected = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\Ollama\ollama.exe");
                    if (!SamePath(executable, expected) || !File.Exists(executable)) throw new InvalidDataException();
                    string models = ExistingDirectory(Text(settings, "modelDirectory"));
                    arguments = "serve";
                    stdout = Path.Combine(state, "ollama.stdout.log");
                    stderr = Path.Combine(state, "ollama.stderr.log");
                    info = HiddenInfo(executable, arguments);
                    info.EnvironmentVariables["OLLAMA_HOST"] = "127.0.0.1:11434";
                    info.EnvironmentVariables["OLLAMA_MODELS"] = models;
                    info.EnvironmentVariables["OLLAMA_NO_CLOUD"] = "1";
                    info.EnvironmentVariables["OLLAMA_NUM_PARALLEL"] = "1";
                    info.EnvironmentVariables["OLLAMA_MAX_LOADED_MODELS"] = "1";
                }
                else
                {
                    executable = Path.GetFullPath(Text(settings, "workerNodeExecutable"));
                    if (!SamePath(executable, Path.Combine(InstallRoot, @"runtime\node.exe")) || !File.Exists(executable)) throw new InvalidDataException();
                    string root = ExistingDirectory(Text(settings, "controllerRoot"));
                    configPath = Path.GetFullPath(Text(settings, "workerConfig"));
                    Dictionary<string, object> config = ReadObject(configPath);
                    if (Text(config, "workerId") != "sachit-windows") throw new InvalidDataException();
                    string data = ExistingDirectory(Text(config, "dataDirectory"));
                    string loader = Path.Combine(root, @"node_modules\tsx\dist\loader.mjs");
                    string main = Path.Combine(root, @"src\main.ts");
                    if (!File.Exists(loader) || !File.Exists(main)) throw new InvalidDataException();
                    arguments = "--import " + Quote(new Uri(loader).AbsoluteUri) + " " + Quote(main) + " " + Quote(configPath);
                    stdout = Path.Combine(data, "worker.stdout.log");
                    stderr = Path.Combine(data, "worker.stderr.log");
                    processRecord = Path.Combine(data, "process.json");
                    info = HiddenInfo(executable, arguments);
                    info.WorkingDirectory = root;
                }
                string record = Path.Combine(state, mode + "-host.json");
                string startedAt = DateTime.UtcNow.ToString("o");
                using (StreamWriter output = Append(stdout))
                using (StreamWriter error = Append(stderr))
                using (Process child = new Process())
                {
                    object outputGate = new object(), errorGate = new object(); int logWriteFailed = 0;
                    child.StartInfo = info;
                    // Event handlers execute outside Main's catch. Disk-full/log errors must
                    // never become an unhandled exception or Windows error dialog.
                    child.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) try { lock (outputGate) { output.WriteLine(e.Data); output.Flush(); } } catch { Interlocked.Exchange(ref logWriteFailed, 1); } };
                    child.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) try { lock (errorGate) { error.WriteLine(e.Data); error.Flush(); } } catch { Interlocked.Exchange(ref logWriteFailed, 1); } };
                    if (!child.Start()) throw new InvalidOperationException();
                    child.StandardInput.Close();
                    child.BeginOutputReadLine(); child.BeginErrorReadLine();
                    try { child.PriorityClass = ProcessPriorityClass.BelowNormal; } catch { }
                    Dictionary<string, object> host = Object("mode", mode, "helperPid", Process.GetCurrentProcess().Id, "childPid", child.Id, "startedAt", startedAt, "executable", executable, "helperExecutable", Executable(), "phase", "running", "createNoWindow", true);
                    if (processRecord != null) AtomicJson(processRecord, Object("pid", child.Id, "startedAt", startedAt, "config", configPath, "stdout", stdout, "stderr", stderr));
                    // Publish host readiness only after the compatibility PID record is durable.
                    AtomicJson(record, host);
                    child.WaitForExit(); // Also waits for asynchronous stdout/stderr callbacks.
                    host["phase"] = "exited"; host["exitCode"] = child.ExitCode; host["exitedAt"] = DateTime.UtcNow.ToString("o"); host["logWriteFailed"] = logWriteFailed != 0;
                    AtomicJson(record, host);
                    return child.ExitCode == 0 ? 0 : 1;
                }
            }
            finally { if (acquired) mutex.ReleaseMutex(); }
        }
    }

    private static ProcessStartInfo HiddenInfo(string executable, string arguments)
    {
        ProcessStartInfo info = new ProcessStartInfo(executable, arguments) { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, WorkingDirectory = Path.GetDirectoryName(executable) };
        string[] inherited = { "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "PROGRAMDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "SYSTEMDRIVE", "HOMEDRIVE", "HOMEPATH" };
        info.EnvironmentVariables.Clear();
        foreach (string name in inherited) { string value = Environment.GetEnvironmentVariable(name); if (value != null) info.EnvironmentVariables[name] = value; }
        return info;
    }

    private static int Probe(string destination)
    {
        destination = FOutput(destination);
        string childFile = destination + ".child.json";
        string companion = Path.Combine(Path.GetDirectoryName(Executable()), "PTI.ConsoleProbe.exe");
        if (!File.Exists(companion)) throw new FileNotFoundException();
        string before = InputDesktop();
        using (Process child = new Process())
        {
            child.StartInfo = HiddenInfo(companion, "--probe-child " + Quote(childFile));
            if (!child.Start()) throw new InvalidOperationException();
            child.StandardInput.Close();
            child.BeginOutputReadLine(); child.BeginErrorReadLine();
            if (!child.WaitForExit(15000)) throw new TimeoutException();
            child.WaitForExit();
            Dictionary<string, object> observation = ReadObject(childFile);
            string after = InputDesktop();
            bool noConsole = Convert.ToInt64(observation["consoleWindow"]) == 0;
            bool passed = child.ExitCode == 0 && noConsole && before == after;
            AtomicJson(destination, Object("passed", passed, "mode", "synthetic-no-inference-probe", "helperPid", Process.GetCurrentProcess().Id, "helperConsoleWindow", GetConsoleWindow().ToInt64(), "childPid", observation["pid"], "childConsoleWindow", observation["consoleWindow"], "inputDesktopBefore", before, "inputDesktopAfter", after, "childDesktop", observation["desktop"], "createNoWindow", true, "at", DateTime.UtcNow.ToString("o")));
            return passed ? 0 : 1;
        }
    }

    private static int ProbeChild(string destination)
    {
        AtomicJson(FOutput(destination), Object("pid", Process.GetCurrentProcess().Id, "consoleWindow", GetConsoleWindow().ToInt64(), "desktop", DesktopName(GetThreadDesktop(GetCurrentThreadId()))));
        return GetConsoleWindow() == IntPtr.Zero ? 0 : 1;
    }

    private static string InputDesktop()
    {
        IntPtr desktop = OpenInputDesktop(0, false, 1);
        if (desktop == IntPtr.Zero) throw new InvalidOperationException();
        try { return DesktopName(desktop); } finally { CloseDesktop(desktop); }
    }
    private static string DesktopName(IntPtr desktop)
    {
        int needed; GetUserObjectInformation(desktop, 2, IntPtr.Zero, 0, out needed);
        IntPtr buffer = Marshal.AllocHGlobal(needed);
        try { if (!GetUserObjectInformation(desktop, 2, buffer, needed, out needed)) throw new InvalidOperationException(); return Marshal.PtrToStringUni(buffer); }
        finally { Marshal.FreeHGlobal(buffer); }
    }
    private static string FOutput(string path)
    {
        path = Path.GetFullPath(path);
        if (!path.StartsWith(@"F:\", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException();
        Directory.CreateDirectory(Path.GetDirectoryName(path)); return path;
    }
    private static string ExistingDirectory(string path)
    {
        path = Path.GetFullPath(path);
        if ((!path.StartsWith(@"F:\", StringComparison.OrdinalIgnoreCase) && !path.StartsWith(@"H:\", StringComparison.OrdinalIgnoreCase)) || !Directory.Exists(path)) throw new InvalidDataException();
        return path;
    }
    private static bool SamePath(string a, string b) { return String.Equals(Path.GetFullPath(a).TrimEnd('\\'), Path.GetFullPath(b).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase); }
    private static string Executable() { return Process.GetCurrentProcess().MainModule.FileName; }
    private static string Text(Dictionary<string, object> value, string name)
    {
        object result; if (!value.TryGetValue(name, out result) || !(result is string) || String.IsNullOrWhiteSpace((string)result) || ((string)result).IndexOfAny(new char[] { '\r', '\n', '\0' }) >= 0) throw new InvalidDataException();
        return (string)result;
    }
    private static Dictionary<string, object> ReadObject(string path)
    {
        if (new FileInfo(path).Length > 131072) throw new InvalidDataException();
        return Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(path, Utf8).TrimStart('\uFEFF'));
    }
    private static Dictionary<string, object> Object(params object[] pairs)
    {
        Dictionary<string, object> value = new Dictionary<string, object>(); for (int i = 0; i < pairs.Length; i += 2) value[(string)pairs[i]] = pairs[i + 1]; return value;
    }
    private static StreamWriter Append(string file) { return new StreamWriter(new FileStream(file, FileMode.Append, FileAccess.Write, FileShare.ReadWrite), Utf8); }
    private static void AtomicJson(string file, Dictionary<string, object> value)
    {
        string temp = file + ".native-tmp"; File.WriteAllText(temp, Json.Serialize(value), Utf8);
        if (File.Exists(file)) File.Replace(temp, file, null); else File.Move(temp, file);
    }
    // Windows CRT argument escaping, with no command interpreter or interpolation.
    private static string Quote(string value)
    {
        StringBuilder output = new StringBuilder("\""); int slashes = 0;
        foreach (char c in value) { if (c == '\\') { slashes++; continue; } if (c == '"') output.Append('\\', slashes * 2 + 1); else output.Append('\\', slashes); slashes = 0; output.Append(c); }
        output.Append('\\', slashes * 2); return output.Append('"').ToString();
    }

    [DllImport("kernel32.dll")] private static extern IntPtr GetConsoleWindow();
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern IntPtr GetThreadDesktop(uint threadId);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll")] private static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool GetUserObjectInformation(IntPtr handle, int index, IntPtr info, int length, out int needed);
}
