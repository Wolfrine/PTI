import test from 'node:test';
import assert from 'node:assert/strict';
import {captureDocId, pathsFromTree, pathsFromCompare, turnFromCapture} from './harness-sync-core.mjs';

const path = 'captures/chatgpt/2026/10/12/20261012T060019258Z-pti-private.json';
const source = {
  schema_version:1, source:'chatgpt_skill_github_presend', session_save_policy:'on',
  captured_at_utc:'2026-10-12T06:00:19.258Z', conversation_id:null,
  conversation_hint:'PTI Track conversation interface planning',
  messages:[
    {role:'user',content:'Okay additionally I have made PTI private now.',provenance:'visible_user_message'},
    {role:'assistant',content:'Verified.',provenance:'assistant_prepared_final_markdown',delivery_verified:false}
  ],
  coverage:{assistant_prepared_text_saved:true,final_rendered_response_verified:false},
  notes:'Final rendered response was not independently verified.'
};
test('stable identifier and path validation',()=>{
  assert.equal(captureDocId(path),'20261012T060019258Z-pti-private');
  assert.throws(()=>captureDocId('../.env'));
});
test('original verbatim role texts and provenance survive',()=>{
  const result=turnFromCapture({path,content:JSON.stringify(source),blobSha:'abc123',indexedAt:'2026-10-12T06:30:00Z'});
  assert.deepEqual(result.messages, source.messages);
  assert.equal(result.localDate,'2026-10-12');
  assert.equal(result.conversationId,null);
  assert.equal(result.groupingConfidence,'hint-only');
  assert.equal(result.deliveryVerified,false);
  assert.equal(result.captureStatus,'prepared-complete');
  assert.equal(result.sourceContentSha256.length,64);
});
test('partial authored answer is not presented as complete',()=>{
  const record={...source,notes:'Earlier partial assistant text was emitted before this GitHub write.'};
  const result=turnFromCapture({path,content:JSON.stringify(record),blobSha:'abc123',indexedAt:'2026-10-12T06:30:00Z'});
  assert.equal(result.captureStatus,'partial');
});
test('opt out is never imported',()=>{
  const record={...source,messages:[{...source.messages[0],content:'harness: off'},source.messages[1]]};
  assert.throws(()=>turnFromCapture({path,content:JSON.stringify(record),blobSha:'abc123',indexedAt:'2026-10-12T06:30:00Z'}));
});
test('tree fails closed on truncation and comparison on modifications',()=>{
  assert.throws(()=>pathsFromTree({truncated:true,tree:[]}));
  assert.deepEqual(pathsFromTree({truncated:false,tree:[{type:'blob',path,sha:'abc'}, {type:'blob',path:'.env'}]}),[{path,sha:'abc'}]);
  assert.deepEqual(pathsFromCompare({status:'ahead',total_commits:1,files:[{filename:path,sha:'abc',status:'added'}]}),[{path,sha:'abc'}]);
  assert.throws(()=>pathsFromCompare({status:'ahead',total_commits:1,files:[{filename:path,sha:'abc',status:'modified'}]}));
});
test('invalid schema and missing assistant is rejected',()=>{
  const invalid={...source,messages:[source.messages[0]]};
  assert.throws(()=>turnFromCapture({path,content:JSON.stringify(invalid),blobSha:'abc',indexedAt:'2026-10-12T06:30:00Z'}));
});
