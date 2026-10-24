import { spawn } from 'node:child_process';
import { mkdir, lstat } from 'node:fs/promises';
import path from 'node:path';

// This script is constant. Secrets and paths travel over stdin, never command arguments,
// environment variables, script files, transcripts, or inherited stdout/stderr.
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  Add-Type -AssemblyName System.Security
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  if ($request.operation -eq 'secureDirectory') {
    $directory = [IO.DirectoryInfo]::new([string]$request.path)
    if (-not $directory.Exists -or ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'directory' }
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    # Change only the DACL. Reassigning ownership unnecessarily requires WRITE_OWNER
    # and can fail under the actual unattended runtime's otherwise adequate token.
    $acl.SetAccessRuleProtection($true, $false)
    $inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    $propagate = [Security.AccessControl.PropagationFlags]::None
    $allow = [Security.AccessControl.AccessControlType]::Allow
    foreach ($principal in @($sid, $system)) {
      $rule = [Security.AccessControl.FileSystemAccessRule]::new($principal, [Security.AccessControl.FileSystemRights]::FullControl, $inherit, $propagate, $allow)
      [void]$acl.AddAccessRule($rule)
    }
    [IO.Directory]::SetAccessControl($directory.FullName, $acl)
    $actual = [IO.Directory]::GetAccessControl($directory.FullName)
    if (-not $actual.AreAccessRulesProtected) { throw 'acl' }
    foreach ($rule in $actual.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
      if ($rule.AccessControlType -eq $allow -and $rule.IdentityReference.Value -ne $sid.Value -and $rule.IdentityReference.Value -ne $system.Value) { throw 'acl' }
    }
    [Console]::Out.Write('ok')
  } else {
    $bytes = [Convert]::FromBase64String([string]$request.value)
    $entropy = [Convert]::FromBase64String([string]$request.entropy)
    try {
      if ($request.operation -eq 'protect') {
        $result = [Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
      } elseif ($request.operation -eq 'unprotect') {
        $result = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
      } else { throw 'operation' }
      [Console]::Out.Write([Convert]::ToBase64String($result))
    } finally {
      if ($null -ne $bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
      if ($null -ne $result) { [Array]::Clear($result, 0, $result.Length) }
    }
  }
} catch { [Console]::Error.Write('protected-store-failed'); exit 1 }
`;
const COMMAND = Buffer.from(SCRIPT, 'utf16le').toString('base64');
const MAXIMUM = 192 * 1024;

export class ProtectionError extends Error {
  constructor(code = 'protected-store-unavailable') { super(code); this.code = code; this.status = 503; }
}

/** DPAPI belongs to the Windows identity that actually runs the companion. No fallback. */
export class WindowsProtection {
  constructor({ timeoutMs = 30_000 } = {}) {
    if (process.platform !== 'win32') throw new ProtectionError('windows-dpapi-required');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) throw new Error('Invalid protection deadline');
    this.timeoutMs = timeoutMs;
    this.executable = path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  }
  async run(request) {
    const input = Buffer.from(JSON.stringify(request), 'utf8');
    if (input.length > MAXIMUM) { input.fill(0); throw new ProtectionError(); }
    try {
      return await new Promise((resolve, reject) => {
        let child;
        try { child = spawn(this.executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', COMMAND], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false }); }
        catch { reject(new ProtectionError()); return; }
        const chunks = []; let total = 0; let settled = false;
        const finish = (error, value) => {
          if (settled) return; settled = true; clearTimeout(timer);
          for (const chunk of chunks) chunk.fill(0);
          if (error) { child.kill(); reject(error); } else resolve(value);
        };
        const timer = setTimeout(() => { child.kill(); finish(new ProtectionError('protected-store-timeout')); }, this.timeoutMs);
        child.stdout.on('data', chunk => {
          if (settled) { chunk.fill(0); return; }
          total += chunk.length;
          if (total > MAXIMUM) { child.kill(); finish(new ProtectionError()); }
          else chunks.push(Buffer.from(chunk));
          chunk.fill(0);
        });
        // Deliberately discard error text: OS/.NET diagnostics must never escape with input.
        child.stderr.on('data', chunk => chunk.fill(0));
        child.on('error', () => finish(new ProtectionError()));
        child.stdin.on('error', () => finish(new ProtectionError()));
        child.on('close', code => {
          if (settled) return;
          if (code !== 0) { finish(new ProtectionError()); return; }
          const output = Buffer.concat(chunks);
          finish(null, output);
        });
        child.stdin.end(input);
      });
    } finally { input.fill(0); }
  }
  async transform(operation, value, entropy) {
    if (!Buffer.isBuffer(value) || value.length < 1 || value.length > 96 * 1024
        || !Buffer.isBuffer(entropy) || entropy.length !== 32) throw new ProtectionError();
    const output = await this.run({ operation, value: value.toString('base64'), entropy: entropy.toString('base64') });
    try {
      const encoded = output.toString('ascii');
      if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new ProtectionError();
      const result = Buffer.from(encoded, 'base64');
      if (!result.length || result.length > 96 * 1024) { result.fill(0); throw new ProtectionError(); }
      return result;
    } finally { output.fill(0); }
  }
  protect(value, entropy) { return this.transform('protect', value, entropy); }
  unprotect(value, entropy) { return this.transform('unprotect', value, entropy); }
  async secureDirectory(directory) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory) || directory.length > 2048) throw new ProtectionError();
    // Refuse junctions/symlinks at every existing level, including before mkdir.
    const levels = []; let current = path.resolve(directory);
    for (;;) { levels.push(current); const parent = path.dirname(current); if (parent === current) break; current = parent; }
    const check = async () => {
      for (const level of levels) {
        try { const stat = await lstat(level); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ProtectionError(); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    };
    await check(); await mkdir(directory, { recursive: true, mode: 0o700 }); await check();
    const result = await this.run({ operation: 'secureDirectory', path: path.resolve(directory) });
    try { if (result.toString('ascii') !== 'ok') throw new ProtectionError(); }
    finally { result.fill(0); }
  }
}
