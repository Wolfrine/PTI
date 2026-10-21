import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseFeedImage, reconcileDiscovery, FRESH_WINDOW_MS } from '../feed.mjs';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const old = {id:'old', addedAt:NOW - 45 * 86400000};
const fresh = {id:'new', addedAt:NOW - 86400000};
const stats = new Map();
const choose = (images, opts={}) => chooseFeedImage(images, {
  getStats: id => stats.get(id) || {views:0,score:0,lastView:0},
  discovered: {'old':NOW - 45*86400000, 'new':NOW - 86400000},
  now:NOW, random:()=>0.5, ...opts
});

test('first sync does not classify entire old Drive library as a new import',()=>{
  assert.deepEqual(reconcileDiscovery([old,fresh],{},NOW),{old:old.addedAt,new:fresh.addedAt});
});
test('later sync marks newly discovered older creations as new',()=>{
  const result = reconcileDiscovery([old,fresh],{old:old.addedAt},NOW);
  assert.deepEqual(result,{old:old.addedAt,new:NOW});
});
test('preserves previously discovered dates',()=>{
  const result = reconcileDiscovery([old],{old:NOW-3*86400000},NOW);
  assert.equal(result.old,NOW-3*86400000);
});
test('large backlog prioritizes new items over old',()=>{
  const added=Array.from({length:30},(_,i)=>({id:'b'+i,addedAt:NOW}));
  const discovered=Object.fromEntries(added.map(x=>[x.id,NOW]));
  discovered.old=old.addedAt;
  const result=chooseFeedImage([old,...added],{getStats:()=>({views:0}),discovered,now:NOW,random:()=>0.75});
  assert.notEqual(result.id,'old');
});
test('a single new item does not monopolize the feed',()=>{
  assert.equal(choose([old,fresh],{random:()=>0.9}).id,'old');
});
test('each fresh image receives exposure before repeats',()=>{
  stats.set('new',{views:1,score:3,lastView:NOW});
  const more={id:'more',addedAt:NOW};
  const result=choose([fresh,more],{discovered:{new:NOW,more:NOW},random:()=>0.5});
  assert.equal(result.id,'more');
  stats.clear();
});
test('mature images exit the fresh cohort after two views',()=>{
  stats.set('new',{views:2,score:1,lastView:NOW});
  const chosen=choose([old,fresh],{random:()=>0.9});
  assert.ok(chosen);
  stats.clear();
});
test('recently seen IDs are not picked when alternatives are available',()=>{
  assert.equal(choose([old,fresh],{recentIds:['new']}).id,'old');
});
test('falls back when recent history excludes every candidate',()=>{
  assert.ok(choose([old],{recentIds:['old']}));
});
test('handles empty library and aged out fresh item',()=>{
  assert.equal(choose([],{}),null);
  assert.equal(choose([old],{discovered:{old:NOW-FRESH_WINDOW_MS-1}}).id,'old');
});
