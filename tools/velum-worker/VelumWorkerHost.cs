using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
// GUI subsystem host: no console is created, including at scheduled logon.
internal static class VelumWorkerHost {
 [STAThread] static int Main(string[] args) {
  if(args.Length!=2 || !File.Exists(args[0]) || !File.Exists(args[1])) return 2;
  using(var mutex=new Mutex(false,"Local\\PTI.Velum.Studio.Worker.v2")) {
   bool acquired=false;
   try {
    try { acquired=mutex.WaitOne(0); } catch(AbandonedMutexException) { acquired=true; }
    if(!acquired) return 0;
    var start=new ProcessStartInfo(Path.GetFullPath(args[0]),"\""+Path.GetFullPath(args[1])+"\"");
    start.WorkingDirectory=Path.GetDirectoryName(Path.GetFullPath(args[1]));
    start.UseShellExecute=false;start.CreateNoWindow=true;
    start.RedirectStandardOutput=true;start.RedirectStandardError=true;
    start.EnvironmentVariables["VELUM_HOST_PID"]=Process.GetCurrentProcess().Id.ToString();
    using(var child=new Process()) {
     child.StartInfo=start;child.OutputDataReceived+=(s,e)=>{};child.ErrorDataReceived+=(s,e)=>{};
     child.Start();child.BeginOutputReadLine();child.BeginErrorReadLine();child.WaitForExit();return child.ExitCode;
    }
   } catch { return 1; } finally { if(acquired) mutex.ReleaseMutex(); }
  }
 }
}
