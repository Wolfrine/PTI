import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDiscussionIndex,captureCompleteness,filterDiscussionIndex,sourceLink} from '../discussions.mjs';
const turn=(id,parent,content='text')=>({id,harnessConversationId:parent,conversationHint:'same title',capturedAt:'2026-10-12T06:00:00Z',localDate:'2026-10-12',messages:[{role:'user',content},{role:'assistant',content:'prepared'}],coverage:{user_message_copied:true,assistant_prepared_text_saved:true,final_rendered_response_verified:false}});
test('only explicit parent identity joins a turn; hints and dates never merge legacy captures',()=>{
 const source=[turn('a','chat-one'),turn('b','chat-two'),turn('legacy',null),turn('orphan','missing')];
 const before=JSON.stringify(source);
 const index=buildDiscussionIndex([{id:'chat-one',title:'same title',turnCount:5},{id:'chat-two',title:'same title',turnCount:1}],source);
 assert.deepEqual(index.conversations[0].turns.map(t=>t.id),['a']);
 assert.equal(index.conversations[0].missingIndexedTurns,4);
 assert.deepEqual(new Set(index.legacyTurns.map(t=>t.id)),new Set(['legacy','orphan']));
 assert.equal(JSON.stringify(source),before);
});
test('partial source flags override prepared-complete; missing metadata remains unknown',()=>{
 assert.equal(captureCompleteness({...turn('a','c'),captureStatus:'prepared-complete',coverage:{assistant_prepared_text_saved:false}}),'partial');
 assert.equal(captureCompleteness(turn('a','c')),'prepared-complete');
 assert.equal(captureCompleteness({messages:[{role:'assistant',content:'partial'}]}),'unknown');
});
test('full message text can be searched without truncation or editing',()=>{
 const raw='x'.repeat(1000)+'needle\n<script>verbatim</script>';
 const index=buildDiscussionIndex([{id:'chat-one',turnCount:1}],[turn('a','chat-one',raw)]);
 assert.equal(filterDiscussionIndex(index,{query:'needle'}).conversations.length,1);
 assert.equal(index.conversations[0].turns[0].messages[0].content,raw);
 assert.equal(filterDiscussionIndex(index,{query:'absent'}).conversations.length,0);
});
test('source links reject executable, foreign, and lookalike URLs',()=>{
 for(const url of ['javascript:alert(1)','https://github.com.evil.test/Wolfrine/chatgpt_harness/blob/main/x','https://github.com/other/repo/blob/main/x'])assert.equal(sourceLink(url),'');
 assert.equal(sourceLink('https://github.com/Wolfrine/chatgpt_harness/blob/main/x'),'https://github.com/Wolfrine/chatgpt_harness/blob/main/x');
});
