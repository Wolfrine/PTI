import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readJson} from '../src/windows.mjs';

test('Windows PowerShell 5 UTF8 BOM in worker process record does not break startup checks',async()=>{
  const testRoot=path.dirname(fileURLToPath(import.meta.url));
  const root=await mkdtemp(path.join(testRoot,'.scratch-'));
  try {
    const file=path.join(root,'process.json');
    await writeFile(file,'\uFEFF{"pid":123,"startedAt":"2026-10-26T10:00:00Z"}','utf8');
    assert.equal((await readJson(file)).pid,123);
    assert.equal(await readJson(path.join(root,'missing.json')),null);
    await writeFile(file,'invalid');await assert.rejects(readJson(file));
  }finally{
    // Remove only the exact scratch directory created inside this repository.
    assert(path.resolve(root).startsWith(path.resolve(testRoot)+path.sep+'.scratch-'));
    await rm(root,{recursive:true,force:true});
  }
});
