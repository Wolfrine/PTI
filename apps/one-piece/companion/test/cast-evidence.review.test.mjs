import test from 'node:test';
import assert from 'node:assert/strict';
import {copy2Counterfactual,isAdvancingSeekPlayback,validateTimingEvidence} from './cast-real.mjs';

test('focused hardware evidence cannot pass when its timing branch or natural transition did not execute',()=>{
 assert.throws(()=>validateTimingEvidence({steps:[],seekMetrics:[]}),/Required timing stage/);
 // The old branch defect did prepare and load real media, but skipped timing work.
 assert.throws(()=>validateTimingEvidence({steps:['initialize-cached-engine','temporary-mdns','discover-without-takeover','prepare-full-episode-1000','load-real-hls-and-webvtt'].map(name=>({name,ok:true})),seekMetrics:[]}),/source1-cast-profile-baseline/);
});

test('Sony PLAYING at the exact seek target before subsequent BUFFERING is not recovery evidence',()=>{
 const seekReply={owned:true,episodeId:'one-piece-1000',state:'PLAYING',positionSeconds:600};
 assert.equal(isAdvancingSeekPlayback(seekReply,'one-piece-1000',600),false);
 assert.equal(isAdvancingSeekPlayback({...seekReply,state:'BUFFERING'},'one-piece-1000',600),false);
 assert.equal(isAdvancingSeekPlayback({...seekReply,positionSeconds:600.203},'one-piece-1000',600),true);
 assert.equal(isAdvancingSeekPlayback({...seekReply,owned:false,positionSeconds:600.203},'one-piece-1000',600),false);
 assert.equal(isAdvancingSeekPlayback({...seekReply,episodeId:'one-piece-1001',positionSeconds:600.203},'one-piece-1000',600),false);
});

test('copy2 comparison changes only the selected1000 source and forced profile while preserving tracks and the other source',()=>{
 const source='a'.repeat(32),other='b'.repeat(32),url=`http://127.0.0.1:18096/Items/${source}/PlaybackInfo`;
 const body={MediaSourceId:source,AllowVideoStreamCopy:false,AudioStreamIndex:1,SubtitleStreamIndex:2,DeviceProfile:{Name:'PTI cast-h264'}},options={method:'POST',body:JSON.stringify(body)};
 const result=copy2Counterfactual(url,options,source);assert.equal(result.applied,true);
 assert.deepEqual(JSON.parse(result.options.body),{...body,AllowVideoStreamCopy:true});assert.equal(JSON.parse(options.body).AllowVideoStreamCopy,false);
 assert.equal(copy2Counterfactual(url,{...options,body:JSON.stringify({...body,MediaSourceId:other})},source).applied,false);
 assert.equal(copy2Counterfactual(url,{...options,body:JSON.stringify({...body,DeviceProfile:{Name:'PTI compatible-h264'}})},source).applied,false);
 assert.equal(copy2Counterfactual(url.replace('127.0.0.1:18096','example.com'),options,source).applied,false);
});
