import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {releaseFiles,sha256,verifyRelease,recoveryAction} from '../src/maintenance-policy.mjs';

test('staged seven-file integrity rejects corruption and extras before pointer swap',()=>{
  const directory=path.join(import.meta.dirname,'../test-data','maintenance-'+randomUUID());fs.mkdirSync(directory,{recursive:true});
  const artifacts=releaseFiles.map(name=>{const bytes=Buffer.from('synthetic '+name);fs.writeFileSync(path.join(directory,name),bytes);return {name,bytes:bytes.length,sha256:sha256(bytes)};});
  assert.equal(verifyRelease(directory,artifacts),7);fs.writeFileSync(path.join(directory,'worker.mjs'),'corrupt');assert.throws(()=>verifyRelease(directory,artifacts),/mismatch/);
  assert.throws(()=>verifyRelease(directory,artifacts.slice(1)),/seven/);
});
test('interrupted pointer swap retains the gate; ambiguous release never permits destructive rollback',()=>{
  const id=randomUUID();assert.equal(recoveryAction({maintenance:{id,phase:'draining'}},id),'abort-without-install');
  assert.equal(recoveryAction({maintenance:{id,phase:'installing'}},id),'rollback-under-sealed-gate');
  assert.equal(recoveryAction({maintenance:null,lastMaintenance:{id,outcome:'activated-verified'}},id),'already-released');
  assert.throws(()=>recoveryAction({maintenance:null},id),/refuse to stop/);assert.throws(()=>recoveryAction({maintenance:{id:randomUUID(),phase:'installing'}},id),/Another/);
});
