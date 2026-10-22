import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOLD_THRESHOLD_MS, HEART_GROWTH_MS, affectionDurationMs,
  heartGrowth, heartParticleSizePx, affectionScore,
  totalAffectionMs, isQuickSkip
} from '../affection.mjs';

test('hold begins at 450ms, visual growth is continuous and only size stops increasing',()=>{
  assert.equal(HOLD_THRESHOLD_MS,450);
  assert.equal(HEART_GROWTH_MS,8000);
  assert.equal(heartGrowth(449),0);
  assert.equal(heartGrowth(450),0);
  assert.ok(heartGrowth(1750)>0);
  assert.ok(heartGrowth(5000)>heartGrowth(1750));
  assert.ok(heartGrowth(7800)>heartGrowth(5000));
  assert.equal(heartGrowth(8000),1);
  assert.equal(heartGrowth(16000),1);
});
test('particle sizes evolve from small hearts to occasional ~60-70px large hearts',()=>{
  assert.ok(heartParticleSizePx(450,0.8)<35);
  assert.ok(heartParticleSizePx(5000,0.8)>heartParticleSizePx(450,0.8));
  assert.ok(heartParticleSizePx(8000,1)>=60);
  assert.ok(heartParticleSizePx(8000,1)<=65);
  assert.equal(heartParticleSizePx(16000,1),heartParticleSizePx(8000,1));
  assert.ok(heartParticleSizePx(8000,0.05)<heartParticleSizePx(8000,0.95));
});
test('new holds keep exact duration rather than converting into 1-5 levels',()=>{
  assert.equal(affectionDurationMs({type:'affection',ms:468}),468);
  assert.equal(affectionDurationMs({type:'affection',ms:12450}),12450);
  assert.equal(affectionDurationMs({type:'affection',ms:900000}),900000);
  assert.equal(affectionDurationMs({type:'up',ms:7500}),0);
});
test('legacy affection with level-only records remains readable',()=>{
  assert.equal(affectionDurationMs({type:'affection',level:1}),450);
  assert.equal(affectionDurationMs({type:'affection',level:5}),3050);
  assert.equal(affectionDurationMs({type:'affection',level:5,ms:18620}),18620);
  assert.equal(totalAffectionMs([{type:'affection',level:3},{type:'affection',ms:10000}]),11750);
});
test('12-second hold scores higher than 3 seconds but less than four times as much',()=>{
  const short=affectionScore([{type:'affection',ms:3000}]);
  const long=affectionScore([{type:'affection',ms:12000}]);
  assert.ok(long>short);
  assert.ok(long<short*4);
});
test('repeated holds always matter with diminishing returns, no ceiling',()=>{
  const e={type:'affection',ms:7000};
  const one=affectionScore([e]);
  const two=affectionScore([e,e]);
  const three=affectionScore([e,e,e]);
  assert.ok(two>one);
  assert.ok(three>two);
  assert.ok(three-two<two-one);
  const many=Array.from({length:500},()=>e);
  assert.ok(affectionScore(many)>20, 'historical ceiling is removed');
  assert.ok(affectionScore([...many,e])>affectionScore(many));
});
test('historical votes are not secretly counted as affection',()=>{
  assert.equal(affectionScore([{type:'up'},{type:'down'}]),0);
  assert.equal(affectionScore([{type:'up'},{type:'affection',ms:2000}]),
    affectionScore([{type:'affection',ms:2000}]));
});
test('only genuine quick skips are penalized',()=>{
  assert.equal(isQuickSkip({type:'skip',ms:300}),true);
  assert.equal(isQuickSkip({type:'skip',ms:1599}),true);
  assert.equal(isQuickSkip({type:'skip',ms:1600}),false);
  assert.equal(isQuickSkip({type:'skip',ms:35094}),false);
});
