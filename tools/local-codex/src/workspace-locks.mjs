import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

const wait = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const alive = pid => {try {process.kill(pid, 0); return true;} catch (error) {return error.code === 'EPERM';}};

export function canonicalResource(resource) {
  const actual = fs.realpathSync.native(resource).replaceAll('\\', '/').replace(/\/$/, '');
  return process.platform === 'win32' || /^[a-z]:\//i.test(actual) ? actual.toLowerCase() : actual;
}
export function resourcesOverlap(a, b) {return a === b || a.startsWith(b + '/') || b.startsWith(a + '/');}
export function lockConflict(a, b) {return (a.mode === 'edit' || b.mode === 'edit') && resourcesOverlap(a.resource, b.resource);}

function admission(locks, pid, isAlive) {
  // Per-owner immutable filenames and atomic ticket updates implement Lamport's
  // bakery admission. Unlike a shared stale lock pathname, reclaiming a dead
  // ticket cannot accidentally unlink another process's newly acquired mutex.
  const token=randomUUID(),file=path.join(locks,`workspace-admission-${token}.json`);
  const publish=value=>{
    const temporary=file+'.tmp';
    fs.writeFileSync(temporary,JSON.stringify({pid,token,...value}));
    fs.renameSync(temporary,file);
  };
  const entries=()=>{
    const values=[];
    for(const name of fs.readdirSync(locks).filter(name=>/^workspace-admission-[a-f0-9-]{36}\.json$/.test(name))){
      const target=path.join(locks,name);let value;
      try{value=read(target);}catch(error){if(error.code==='ENOENT')continue;throw error;}
      if(!isAlive(value.pid)){try{fs.unlinkSync(target);}catch(error){if(error.code!=='ENOENT')throw error;}continue;}
      values.push(value);
    }
    return values;
  };
  try{
    publish({choosing:true,ticket:0});
    const highest=Math.max(0,...entries().map(value=>Number.isSafeInteger(value.ticket)&&value.ticket>=0?value.ticket:0));
    if(highest>=Number.MAX_SAFE_INTEGER)throw Error('Workspace admission ticket overflow.');
    const ticket=highest+1;publish({choosing:false,ticket});
    for(let attempt=0;attempt<100;attempt++){
      const preceding=entries().some(value=>value.token!==token&&(value.choosing||!Number.isSafeInteger(value.ticket)||value.ticket<ticket||value.ticket===ticket&&value.token<token));
      if(!preceding)return()=>{if(fs.existsSync(file)&&read(file).token===token)fs.unlinkSync(file);};
      wait(10);
    }
    throw Error('Workspace admission is busy; retry shortly.');
  }catch(error){if(fs.existsSync(file)&&read(file).token===token)fs.unlinkSync(file);throw error;}
}

export function acquireWorkspaceLock(home, {taskId, resourcePath, cwd, mode, pid = process.pid}, options = {}) {
  const isAlive = options.isAlive || alive;
  const resource = canonicalResource(resourcePath || cwd);
  const locks = path.join(home, 'locks');
  fs.mkdirSync(locks, {recursive: true});
  const releaseAdmission=admission(locks,pid,isAlive);
  const token = randomUUID();
  const file = path.join(locks, `workspace-${createHash('sha256').update(taskId).digest('hex')}.json`);
  const candidate = {pid, taskId, token, mode, resource};
  try {
    for (const name of fs.readdirSync(locks).filter(name => /^workspace-[a-f0-9]{64}\.json$/.test(name))) {
      const otherFile = path.join(locks, name);
      let other;
      try {other = read(otherFile);} catch (error) {if (error.code === 'ENOENT') continue; throw error;}
      if (!isAlive(other.pid)) {fs.unlinkSync(otherFile); continue;}
      if (other.taskId === taskId || lockConflict(candidate, other)) throw Error('Workspace is busy with a conflicting task; wait for it to finish.');
    }
    fs.writeFileSync(file, JSON.stringify(candidate), {flag: 'wx'});
  } finally {
    releaseAdmission();
  }
  return () => {if (fs.existsSync(file) && read(file).token === token) fs.unlinkSync(file);};
}
