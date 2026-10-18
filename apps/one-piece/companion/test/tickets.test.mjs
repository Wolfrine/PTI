import test from 'node:test';
import assert from 'node:assert/strict';
import {TicketStore,encodeResource,decodeResource} from '../src/tickets.mjs';
const scope={sessionId:'lease-session',generation:1,authorityEpoch:1,uid:'viewer',episodeId:'one-piece-1001',destination:'cast',resources:['/Videos/item/master.m3u8']};
test('media capabilities cannot cross episode/resource scope, survive expiry or takeover',()=>{
  let now=1000;const store=new TicketStore({clock:()=>now});
  const {token}=store.mint({...scope,ttlMs:2000});
  assert.equal(token.length,32);assert.equal(store.entries.has(token),false);
  const allowed=store.authorize(token,scope.episodeId,scope.resources[0]);
  assert.throws(()=>store.authorize(token,'one-piece-1000',scope.resources[0]),{code:'media-not-found'});
  assert.throws(()=>store.authorize(token,scope.episodeId,'/System/Info'),{code:'media-not-found'});
  store.extendResources(allowed,['/Videos/item/segment.ts']);
  store.authorize(token,scope.episodeId,'/Videos/item/segment.ts');
  now=3001;assert.throws(()=>store.authorize(token,scope.episodeId,scope.resources[0]),{code:'media-not-found'});
  const second=store.mint(scope);store.revokeSession(scope.sessionId);
  assert.throws(()=>store.authorize(second.token,scope.episodeId,scope.resources[0]),{code:'media-not-found'});
});
test('resource encoding is canonical and cannot smuggle a raw URL/backslash',()=>{
  const resource='/Videos/item/main.m3u8?AudioStreamIndex=2';
  assert.equal(decodeResource(encodeResource(resource)),resource);
  assert.throws(()=>encodeResource('https://outside.invalid/file'));
  assert.throws(()=>encodeResource('/Videos\\..\\System'));
  assert.throws(()=>decodeResource(encodeResource(resource)+'='));
});
