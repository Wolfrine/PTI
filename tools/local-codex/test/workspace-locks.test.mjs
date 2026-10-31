import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {acquireWorkspaceLock,canonicalResource,resourcesOverlap} from '../src/workspace-locks.mjs';
const root=path.join(fileURLToPath(new URL('../test-data/',import.meta.url)),'workspace-locks-'+randomUUID());
fs.mkdirSync(path.join(root,'a/child'),{recursive:true});fs.mkdirSync(path.join(root,'b'),{recursive:true});
const request=(taskId,mode,resourcePath=path.join(root,'a'))=>({taskId,mode,resourcePath});
test('parallel readers coexist; writers conflict with readers, writers, nested resources and aliases',()=>{
  const home=path.join(root,'readers');const a=acquireWorkspaceLock(home,request('reader-a','inspect')),b=acquireWorkspaceLock(home,request('reader-b','inspect',path.join(root,'a/child')));
  assert.throws(()=>acquireWorkspaceLock(home,request('writer','edit')),/conflicting/);
  const unrelated=acquireWorkspaceLock(home,request('independent','edit',path.join(root,'b')));unrelated();a();
  assert.throws(()=>acquireWorkspaceLock(home,request('writer','edit')),/conflicting/);b();
  const writer=acquireWorkspaceLock(home,request('writer','edit'));
  assert.throws(()=>acquireWorkspaceLock(home,request('reader-c','inspect',path.join(root,'a/child'))),/conflicting/);
  assert.throws(()=>acquireWorkspaceLock(home,request('writer-c','edit',path.join(root,'a/child'))),/conflicting/);writer();
  const alias=path.join(root,'alias');fs.symlinkSync(path.join(root,'a'),alias,process.platform==='win32'?'junction':'dir');
  assert.equal(canonicalResource(alias),canonicalResource(path.join(root,'a')));assert.equal(resourcesOverlap('f:/work/one','f:/work/one-more'),false);
});
test('dead worker claims and dead admission mutex are recovered without removing live ownership',()=>{
  const home=path.join(root,'stale'),locks=path.join(home,'locks');fs.mkdirSync(locks,{recursive:true});
  const key=createHash('sha256').update('dead').digest('hex');fs.writeFileSync(path.join(locks,`workspace-${key}.json`),JSON.stringify({taskId:'dead',pid:2147483647,token:'stale',mode:'edit',resource:canonicalResource(path.join(root,'a'))}));
  const ticket=randomUUID();fs.writeFileSync(path.join(locks,`workspace-admission-${ticket}.json`),JSON.stringify({pid:2147483647,token:ticket,choosing:true,ticket:0}));
  const release=acquireWorkspaceLock(home,request('new','edit'));assert.equal(fs.existsSync(path.join(locks,`workspace-${key}.json`)),false);assert.throws(()=>acquireWorkspaceLock(home,request('new','inspect')),/conflicting/);release();
  assert.equal(fs.readdirSync(locks).length,0);
});
test('two separate processes cannot concurrently acquire conflicting writer locks',async()=>{
  const home=path.join(root,'processes'),module=new URL('../src/workspace-locks.mjs',import.meta.url).href;
  const code=`import {acquireWorkspaceLock} from ${JSON.stringify(module)};process.stdout.write('ready\\n');await new Promise(r=>process.stdin.once('data',r));let release;try{release=acquireWorkspaceLock(process.argv[1],{taskId:process.argv[2],mode:'edit',resourcePath:process.argv[3]});process.stdout.write('acquired\\n');await new Promise(r=>setTimeout(r,400));}catch{process.stdout.write('busy\\n');}finally{release?.();process.stdin.destroy();}`;
  const children=['one','two'].map(id=>{const child=spawn(process.execPath,['--input-type=module','-e',code,home,id,path.join(root,'a')],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';const ready=new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('ready\n'))resolve();});child.on('error',reject);child.on('exit',code=>{if(code)reject(Error('Fixture child failed.'));});});const done=new Promise((resolve,reject)=>{child.on('exit',code=>code===0?resolve():reject(Error('Fixture child failed.')));});return {child,ready,done,output:()=>output};});
  await Promise.all(children.map(c=>c.ready));for(const c of children)c.child.stdin.write('go\n');await Promise.all(children.map(c=>c.done));
  assert.equal(children.filter(c=>c.output().includes('acquired\n')).length,1);assert.equal(children.filter(c=>c.output().includes('busy\n')).length,1);
});
