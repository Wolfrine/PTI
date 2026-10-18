/** Offline fixtures only: no private config read, process spawn, GPU, media request or TV operation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeOwnedEngineIntent} from './duration-owned-engine.mjs';
import {createProductionPreparedPilot,validateHumanLineageRecords} from './production-prepared-pilot.mjs';
import {MediaCoordinator} from '../src/media/coordinator.mjs';
import {classifyCastResource,validateProductionRawProofs} from './cast-real.mjs';

test('owned-engine opt-in is exact per intent and never borrowed silently',()=>{
 assert.doesNotThrow(()=>authorizeOwnedEngineIntent('cast',{PTI_RUN_REAL_CAST:'1'}));
 assert.doesNotThrow(()=>authorizeOwnedEngineIntent('duration',{PTI_RUN_REAL_DURATION:'1'}));
 for(const[intent,env]of[['cast',{}],['duration',{}],['cast',{PTI_RUN_REAL_DURATION:'1'}],['duration',{PTI_RUN_REAL_CAST:'1'}],['other',{PTI_RUN_REAL_CAST:'1',PTI_RUN_REAL_DURATION:'1'}]])assert.throws(()=>authorizeOwnedEngineIntent(intent,env));
});
test('real prepared static path with query is classified as a complete video file',()=>{
 assert.equal(classifyCastResource('/Videos/'+'a'.repeat(32)+'/stream.mp4?MediaSourceId='+'b'.repeat(32)+'&Static=true',true),'video-file');
 assert.equal(classifyCastResource('/Videos/a/master.m3u8?x=1',true),'hls-playlist');
 assert.equal(classifyCastResource('/Videos/a/Stream.vtt?x=1',true),'webvtt');
 assert.equal(classifyCastResource('/Videos/a/0.mp4?x=1',false),'video-segment');
});
test('production hardware evidence rejects stale, callback-only or unowned raw receipts',()=>{
 const proofs=Array.from({length:10},(_,index)=>({episodeId:index%2?'one-piece-1001':'one-piece-1000',command:'seek',state:'PLAYING',exactOwnedFreshProof:true,rawVersion:index+1,listenerRawVersion:index+1,platformVersion:1,rawAgeMs:2,platformAgeMs:4}));
 assert.equal(validateProductionRawProofs(proofs).strictRawAndPlatformProofs,true);
 for(const mutation of [row=>{row.platformAgeMs=1001;},row=>{row.listenerRawVersion=0;},row=>{row.exactOwnedFreshProof=false;}]){const copy=structuredClone(proofs);mutation(copy[0]);assert.throws(()=>validateProductionRawProofs(copy));}
});
test('human presentation reuse requires the exact stored video/caption payload and original selections',()=>{
 const rows=[1000,1001].map((episode,index)=>({episode,productionRenditionId:String(index),allStoredPayloadHashesAndSelectionsMatch:true,humanObservation:{acceptedForObservedJapaneseAndEnglishPresentation:true},video:{sha256:'a'.repeat(64),bytes:123},fullEnglishVtt:{sha256:'b'.repeat(64),bytes:456,cueIdentity:{cues:200}},original:{md5:'c'.repeat(32),selected:{audioIndex:1,subtitleIndex:2}}}));
 const audit={kind:'read-only-human-helper-to-production-payload-lineage',episodes:rows,limits:['synthetic offline fixture']},records=new Map(rows.map(row=>[row.productionRenditionId,{video:row.video,captions:row.fullEnglishVtt,recipe:{original:{md5:row.original.md5},audio:{index:1},subtitle:{index:2}}}]));
 assert.equal(validateHumanLineageRecords(audit,records).sameStoredVideoCaptionHashesAndSelection,true);
 const changed=structuredClone(records);changed.get('1').video.sha256='d'.repeat(64);assert.throws(()=>validateHumanLineageRecords(audit,changed));
});
test('production hardware binding returns the real coordinator, rejects all original downloads, and stays inert without opt-in',{skip:process.platform!=='win32'},async()=>{
 const catalog={episodes:[{episodeNumber:1000},{episodeNumber:1001}]};
 const media=await createProductionPreparedPilot({catalog,privateRoot:'H:/PTI-OnePiece/real-cast-qa/offline-fixture'});
 assert.ok(media instanceof MediaCoordinator);assert.equal(media.defaultMode,'prepared-mp4');assert.equal(media.autoPrefetch,false);
 assert.equal(media.evidence.productionMediaModules,true);assert.equal(media.evidence.testOnlyStaticBinding,false);assert.equal(media.evidence.engine,undefined);
 await assert.rejects(media.cache.downloader.download(),{code:'cached-original-required'});assert.equal(media.evidence.originalDownloadAttempts,1);
 const saved=process.env.PTI_RUN_REAL_CAST;delete process.env.PTI_RUN_REAL_CAST;
 try{await assert.rejects(media.initialize({hardwareAcceleration:'nvenc'}),/Explicit matching test opt-in/);assert.equal(media.evidence.engine,undefined);}finally{if(saved===undefined)delete process.env.PTI_RUN_REAL_CAST;else process.env.PTI_RUN_REAL_CAST=saved;}
});
