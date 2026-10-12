import test from 'node:test';
import assert from 'node:assert/strict';
import {chronicleModel,investmentRows,searchAll,traceNeighborhood,validateCanonical,assessmentReadout} from '../model.mjs';
const evidence=[{id:'e1',title:'source'},{id:'e2',title:'source2'}];
const nodes=[{id:'w1',nodeType:'workstream',title:'Morsel',status:'active'},{id:'t1',nodeType:'thread',title:'Acceptance'}];
const events=[{id:'v1',title:'Built',localDate:'2026-10-01',eventType:'implementation',nodeIds:['w1'],evidenceIds:['e1']},{id:'v2',title:'Reopened',localDate:'2026-10-02',eventType:'rejection',nodeIds:['w1','t1'],evidenceIds:['e2']}];
const edges=[{id:'x1',from:{type:'event',id:'v2'},type:'supports',to:{type:'node',id:'t1'},evidenceIds:['e2']}];
test('canonical references validate',()=>assert.deepEqual(validateCanonical({evidence,events,nodes,edges}),[]));
test('chronicle preserves day continuity',()=>{const m=chronicleModel(nodes,events,edges,[]);assert.deepEqual(m.days,['2026-10-01','2026-10-02']);assert.equal(m.rows[0].id,'w1');});
test('trace neighborhood follows typed edges',()=>{const t=traceNeighborhood('t1',nodes,events,edges,2);assert.ok(t.items.some(x=>x.id==='v2'));});
test('investment reflects rejection as rework',()=>{const row=investmentRows(nodes,events,edges).find(x=>x.id==='w1');assert.equal(row.rework,'medium');assert.equal(row.closure,'reopened');});
test('search spans canonical objects',()=>assert.equal(searchAll('morsel',{nodes,events,evidence})[0].item.id,'w1'));

test('assessment readout extracts conclusions without rendering object objects',()=>{
  const actual=assessmentReadout({
    id:'2026-10-08',localDate:'2026-10-08',status:'current',
    observation:{outputs:['21 curriculum drafts'],failuresAndOpenLoops:['100 awaiting review']},
    interpretation:{attentionProduced:'Drafts grew; no approval outcome verified.',improvementSignals:['Verify review completions']},
    basisEvidenceIds:['e1','e2'],coverage:{chatgpt:{status:'partial'}}
  });
  assert.equal(actual.conclusion,'Drafts grew; no approval outcome verified.');
  assert.deepEqual(actual.outputs,['21 curriculum drafts']);
  assert.deepEqual(actual.openLoops,['100 awaiting review']);
  assert.equal(actual.chatCoverage,'partial');
  assert.equal(actual.evidenceCount,2);
  assert.ok(!JSON.stringify(actual).includes('[object Object]'));
});
test('assessment readout is bounded and does not label sources as priorities',()=>{
  const actual=assessmentReadout({observation:{outputs:['a','b','c','d']},interpretation:{improvementSignals:['one','two','three','four']}});
  assert.deepEqual(actual.outputs,['a','b','c']);
  assert.deepEqual(actual.nextChecks,['one','two','three']);
  assert.equal(actual.chatCoverage,'unknown');
});
