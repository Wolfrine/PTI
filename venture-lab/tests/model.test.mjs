import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeMessage,makeDecision,makeExperiment,validateExperiment,validateLinks,safeUrl} from '../model.mjs';
const user={uid:'me',displayName:'Me'};
test('reject executable source URLs and malformed/oversized audio',()=>{assert.throws(()=>safeUrl('javascript:alert(1)'));assert.throws(()=>makeMessage({threadId:'t',audioData:'data:text/html;base64,AA=='},user));assert.throws(()=>makeMessage({threadId:'t',audioData:'data:audio/webm;base64,'+'A'.repeat(600001)},user));});
test('decision and completed experiment require actual reasoning and observations',()=>{assert.throws(()=>makeDecision({threadId:'t',branchId:'b',outcome:'rejected',reason:' '},user));assert.throws(()=>validateExperiment({title:'x',hypothesis:'x',method:'x',successCriterion:'x',status:'completed',result:'',learning:''}));const e=makeExperiment({threadId:'t',branchId:'b',title:'x',hypothesis:'x',method:'x',successCriterion:'x'},user);assert.equal(e.status,'planned');});
test('cross-discussion sources and directions are rejected',()=>{const s={threads:[{id:'t'}],branches:[{id:'b',threadId:'other'}],messages:[]};assert.throws(()=>validateLinks({threadId:'t',branchId:'b'},s));assert.throws(()=>validateLinks({threadId:'t',sourceMessageId:'missing'},s));});
