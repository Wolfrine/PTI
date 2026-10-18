import test from 'node:test';
import assert from 'node:assert/strict';
import {gitBlobHash,parseReleaseTree,releasePath,assertStoppedInspection} from '../src/runtime/release.mjs';
test('versioned release path rejects refs, traversal, UNC paths and non-commit labels',()=>{
 for(const value of ['main','../release','a'.repeat(39),'A'.repeat(40),'\\\\server\\share'])assert.throws(()=>releasePath(value));
 assert.equal(releasePath('a'.repeat(40)),'H:\\PTI-OnePiece\\releases\\'+'a'.repeat(40));
});
test('release manifest tree accepts only committed code/catalog regular files, rejects symlinks and unrelated files',()=>{
 const record='100644 blob '+'a'.repeat(40)+'\tapps/one-piece/companion/src/server.mjs\0';assert.deepEqual(parseReleaseTree(record),[{blob:'a'.repeat(40),relative:'apps/one-piece/companion/src/server.mjs'}]);
 for(const record of ['120000 blob '+'a'.repeat(40)+'\tapps/one-piece/companion/src/link\0','100644 blob '+'a'.repeat(40)+'\tprivate/config.json\0','100644 blob '+'a'.repeat(40)+'\tapps/one-piece/companion/src/../private.json\0'])assert.throws(()=>parseReleaseTree(record));
});
test('copied source bytes are verified with Git object framing, not a filename or assumed clean working tree',()=>{
 assert.equal(gitBlobHash(Buffer.from('test\n')),'9daeafb9864cf43055ae93beb0afd6c7d144bfa4');
 assert.notEqual(gitBlobHash(Buffer.from('test\r\n')),gitBlobHash(Buffer.from('test\n')));
});
test('release activation rejects a recovering launcher even when the supervisor is absent',()=>{
 const now=1792314000000,configSha256='a'.repeat(64);
 const proof={recordedAt:new Date(now-1000).toISOString(),configSha256,stopped:true,launcherAbsent:true,supervisorAbsent:true,recordedChildrenAbsent:true,portsClosed:true,taskState:'Ready'};
 const inspection={launcherCount:0,supervisorCount:0,recordedProcessCount:0,listeningPortCount:0,taskState:'Ready'};
 const accepted={proof,inspection,configSha256,now};assert.equal(assertStoppedInspection(accepted),true);
 for(const patch of [{launcherCount:1},{supervisorCount:1},{recordedProcessCount:1},{listeningPortCount:1},{taskState:'Running'},{taskState:'Queued'},{launcherCount:undefined}])assert.throws(()=>assertStoppedInspection({...accepted,inspection:{...inspection,...patch}}),/stop-runtime-before-activation/);
 for(const patch of [{recordedAt:new Date(now-300001).toISOString()},{recordedAt:new Date(now+1).toISOString()},{configSha256:'b'.repeat(64)},{launcherAbsent:false},{portsClosed:false},{taskState:'Running'}])assert.throws(()=>assertStoppedInspection({...accepted,proof:{...proof,...patch}}),/stop-runtime-before-activation/);
 assert.throws(()=>assertStoppedInspection({inspection,configSha256,now}),/stop-runtime-before-activation/);
});
