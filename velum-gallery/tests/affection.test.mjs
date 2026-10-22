import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOLD_THRESHOLD_MS, affectionLevel, safeAffectionLevel,
  affectionScore, isQuickSkip
} from '../affection.mjs';

test('affection starts after 450ms, reaches five by ~3.1 seconds and remains bounded',()=>{
  assert.equal(HOLD_THRESHOLD_MS,450);
  assert.equal(affectionLevel(449),0);
  assert.equal(affectionLevel(450),1);
  assert.equal(affectionLevel(1099),1);
  assert.equal(affectionLevel(1100),2);
  assert.equal(affectionLevel(1750),3);
  assert.equal(affectionLevel(2400),4);
  assert.equal(affectionLevel(3050),5);
  assert.equal(affectionLevel(15000),5);
  assert.equal(affectionLevel(NaN),0);
});
test('one strong hold outweighs a weak hold, independent of particle count',()=>{
  assert.ok(affectionScore([{type:'affection',level:5}])>
    affectionScore([{type:'affection',level:1}]));
  assert.equal(affectionScore([{type:'affection',level:5}]),5);
});
test('repeated deliberate holds strengthen preference with diminishing increments',()=>{
  const events=[{type:'affection',level:5}];
  const one=affectionScore(events);
  const two=affectionScore([...events,...events]);
  const three=affectionScore([...events,...events,...events]);
  assert.ok(two>one);
  assert.ok(three>two);
  assert.ok(two-one<one);
  assert.ok(three-two<two-one);
});
test('affection influence cannot grow without bounds, and old votes remain separate',()=>{
  const affections=Array.from({length:400},()=>({type:'affection',level:5}));
  assert.equal(affectionScore(affections),20);
  assert.equal(affectionScore([{type:'up'}, {type:'affection',level:2}]),2);
  assert.equal(safeAffectionLevel(7),5);
  assert.equal(safeAffectionLevel(0),1);
});
test('skip cleanup preserves only genuine quick exits',()=>{
  assert.equal(isQuickSkip({type:'skip',ms:300}),true);
  assert.equal(isQuickSkip({type:'skip',ms:1599}),true);
  assert.equal(isQuickSkip({type:'skip',ms:1600}),false);
  assert.equal(isQuickSkip({type:'skip',ms:35094}),false);
  assert.equal(isQuickSkip({type:'affection',ms:800}),false);
});
