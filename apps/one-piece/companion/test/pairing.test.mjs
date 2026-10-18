import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {OwnerBinding} from '../src/pairing.mjs';

test('only an explicit one-use local challenge fixes the verified owner, surviving restart',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'op-pair-'));t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('op-pair-'));await rm(root,{recursive:true,force:true});});
 const binding=new OwnerBinding({root});await binding.initialize();
 await assert.rejects(binding.pair({uid:'attacker',token:'fixture'},{confirmOwner:true,code:'guess'}),{code:'local-setup-expired'});
 const challenge=binding.beginLocalSetup();
 await assert.rejects(binding.pair({uid:'owner',token:'fixture'},{code:challenge.code}),{code:'invalid-local-setup'});
 const results=await Promise.allSettled(['owner','attacker'].map(uid=>binding.pair({uid,token:'fixture'},{code:challenge.code,confirmOwner:true})));
 assert.equal(results[0].status,'fulfilled');assert.equal(results[1].reason.code,'already-paired');
 const restored=new OwnerBinding({root});await restored.initialize();assert.equal(restored.ownerUid,'owner');
 assert.throws(()=>restored.beginLocalSetup(),{code:'already-paired'});
});

test('local challenge expires and guessing is bounded',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'op-pair-'));t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('op-pair-'));await rm(root,{recursive:true,force:true});});
 let now=0;const binding=new OwnerBinding({root,clock:()=>now});binding.beginLocalSetup();
 for(let i=0;i<5;i++)await assert.rejects(binding.pair({uid:'owner',token:'fixture'},{code:'wrong',confirmOwner:true}),{code:'invalid-local-setup'});
 await assert.rejects(binding.pair({uid:'owner',token:'fixture'},{code:'wrong',confirmOwner:true}),{code:'local-setup-expired'});
 const challenge=binding.beginLocalSetup();now=challenge.expiresAt;
 await assert.rejects(binding.pair({uid:'owner',token:'fixture'},{code:challenge.code,confirmOwner:true}),{code:'local-setup-expired'});
});
