import test from 'node:test';
import assert from 'node:assert/strict';
import {staticInterval,cueRows,preparedTracks,validateStaticResponse} from './prepared-pilot.mjs';

test('prepared ranges are bounded to a known complete representation, including open and suffix ranges',()=>{
 assert.deepEqual(staticInterval('bytes=50-99',1000),{start:50,end:99,length:50,status:206});
 assert.deepEqual(staticInterval('bytes=900-',1000),{start:900,end:999,length:100,status:206});
 assert.deepEqual(staticInterval('bytes=-100',1000),{start:900,end:999,length:100,status:206});
 assert.deepEqual(staticInterval(undefined,1000),{start:0,end:999,length:1000,status:200});
 for(const range of ['bytes=-','bytes=-0','bytes=1000-','bytes=100-50','bytes=0-1,4-5','bytes=999999999999999999999-'])assert.throws(()=>staticInterval(range,1000));
 assert.throws(()=>staticInterval(undefined,2*1024**3+1));
});
test('a plausible206 with wrong total, length, MIME or compression is rejected before streaming',()=>{
 const interval=staticInterval('bytes=100-199',1000),headers={'content-length':'100','content-range':'bytes 100-199/1000','accept-ranges':'bytes','content-type':'video/mp4'};
 validateStaticResponse(new Response(new Uint8Array(100),{status:206,headers}),interval,1000);
 for(const change of [{'content-range':'bytes 100-199/999'},{'content-length':'101'},{'content-type':'text/html'},{'content-encoding':'gzip'}])assert.throws(()=>validateStaticResponse(new Response(new Uint8Array(100),{status:206,headers:{...headers,...change}}),interval,1000));
 assert.throws(()=>validateStaticResponse(new Response(new Uint8Array(100),{status:200,headers}),interval,1000));
});
test('external subtitle lineage compares actual timing and dialogue while tolerating cue IDs and line endings',()=>{
 const original='WEBVTT\n\n10\n00:10:00.000 --> 00:10:02.000\nFull English dialogue.\n';
 const served='WEBVTT\r\n\r\n00:10:00.000 --> 00:10:02.000\r\nFull English dialogue.\r\n';
 assert.deepEqual(cueRows(original),cueRows(served));
 assert.notDeepEqual(cueRows(original),cueRows(served.replace('10:00.000','10:00.050')));
 assert.notDeepEqual(cueRows(original),cueRows(served.replace('Full English dialogue.','Song title only.')));
});
test('derived indices are inspected rather than copied from original1001 index4',()=>{
 const streams=[{Type:'Video',Index:0},{Type:'Audio',Index:1,Language:'jpn'},{Type:'Subtitle',Index:2,Language:'eng',IsExternal:true}];
 const selected=preparedTracks({MediaStreams:streams});assert.equal(selected.audio.Index,1);assert.equal(selected.caption.Index,2);
 assert.throws(()=>preparedTracks({MediaStreams:streams.map(row=>row.Type==='Audio'?{...row,Language:'eng'}:row)}));
 assert.throws(()=>preparedTracks({MediaStreams:streams.map(row=>row.Type==='Subtitle'?{...row,IsExternal:false}:row)}));
});
