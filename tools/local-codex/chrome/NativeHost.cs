using System;
using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

// Windowless stdio shim. Chrome supplies the handles; no socket or shell is used.
internal static class NativeHost {
  [STAThread] static int Main(string[] args) {
    if (args.Length < 1 || !Regex.IsMatch(args[0], "^chrome-extension://[a-p]{32}/$")) return 2;
    var directory = AppDomain.CurrentDomain.BaseDirectory;
    var node = File.ReadAllText(Path.Combine(directory, "node-path.txt")).Trim();
    var start = new ProcessStartInfo(node) {
      Arguments = "\"" + Path.Combine(directory, "native-host.mjs") + "\" " + args[0],
      WorkingDirectory = directory, UseShellExecute = false, CreateNoWindow = true,
      RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true
    };
    using (var child = Process.Start(start)) {
      var input = Task.Run(() => { try { Console.OpenStandardInput().CopyTo(child.StandardInput.BaseStream); } finally { child.StandardInput.Close(); } });
      // Diagnostics stay local to the process; never corrupt Chrome's binary stdout.
      child.ErrorDataReceived += (sender, value) => {}; child.BeginErrorReadLine();
      try { child.StandardOutput.BaseStream.CopyTo(Console.OpenStandardOutput()); child.WaitForExit(); return child.ExitCode; }
      finally { if (!child.HasExited) child.Kill(); }
    }
  }
}
