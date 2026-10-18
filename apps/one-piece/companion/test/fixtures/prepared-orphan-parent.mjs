// Benign Node canary only: this fixture never starts FFmpeg, an engine or a GPU.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PreparedToolRegistry } from '../../src/media/prepared-processes.mjs';

const workRoot = path.resolve(process.argv[2]);
const marker = path.join(workRoot, `${randomUUID()}.video.part.mp4`);
const registry = new PreparedToolRegistry({ workRoot, ffmpegPath: process.execPath, ffprobePath: process.execPath });
const code = "const fs=require('node:fs');setInterval(()=>{if(fs.existsSync(process.argv[1]+'.stop'))process.exit(0)},50);setTimeout(()=>process.exit(0),30000)";
const args = ['-e', code, marker];
const intent = await registry.begin(process.execPath, args);
// A detached benign canary survives Windows' normal parent/job cleanup, so this
// fixture exercises the recovery path rather than merely proving cascading exit.
const child = spawn(process.execPath, args, { windowsHide: true, detached: true, stdio: 'ignore' });
if (process.argv[3] !== 'intent-only') await registry.started(intent, child.pid);
// Wait until startup has settled before simulating a hard backend termination.
await new Promise(resolve => setTimeout(resolve, 200));
if (child.exitCode !== null) throw new Error('Benign orphan canary exited during startup');
process.stdout.write(JSON.stringify({ pid: child.pid, marker, record: intent.file }) + '\n');
setInterval(() => {}, 1000);
