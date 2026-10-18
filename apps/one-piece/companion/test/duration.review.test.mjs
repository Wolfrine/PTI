/** Synthetic parser/acceptance fixtures only; these never establish real capacity. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseDecoderProgress,assessDurationReport,REQUIRED_DURATION_MS} from './duration-metrics.mjs';
import {validateDurationHandoff} from './duration-owned-engine.mjs';

const fixture=()=>({measuredWallClockMs:REQUIRED_DURATION_MS,measuredMonotonicMs:REQUIRED_DURATION_MS,originalDownloadAttempts:0,newOriginalNetworkBytes:0,
 sessions:[0,1,2].map(index=>({uid:`synthetic-${index}`,sessionId:`fixture-${index}`,mode:'prepared-mp4',decodedFrames:86000,decodedSeconds:3590,lastAdvanceElapsedMs:3599900,progressSamples:7000,decoderErrors:0,maximumUnplannedAdvanceGapMs:1000,durableResumeMatches:true})),
 samples:Array.from({length:61},()=>({storage:{usedBytes:10*1024**3}})),
 events:[{type:'natural-queued-transition',from:1000,to:1001,sameCoordinatorSession:true,sameProgressLease:true,exactQueuedContextAdopted:true,decoderReachedEof:true,firstAdvancingDecodeMs:500},
  {type:'seek',fromSeconds:900,toSeconds:780,persistedRewind:true,firstAdvancingDecodeMs:500},{type:'pause-resume',persistedPositionReused:true,firstAdvancingDecodeMs:500},
  {type:'seek',firstAdvancingDecodeMs:500},{type:'manual-loop',firstAdvancingDecodeMs:500}]});
test('FFmpeg uses microseconds rather than guessing an elapsed wall-clock playhead',()=>{
 assert.deepEqual(parseDecoderProgress('frame=120\nout_time_us=5000000\nprogress=continue\n'),{frames:120,seconds:5,ended:false});
 for(const block of ['frame=12\nout_time_ms=5000\nprogress=continue','frame=x\nout_time_us=1\nprogress=end','frame=12\nout_time_us=-1\nprogress=end'])assert.equal(parseDecoderProgress(block),null);
});
test('accelerated 60 media minutes cannot satisfy one real wall-clock hour',()=>{const value=fixture();value.measuredWallClockMs=120000;assert.equal(assessDurationReport(value).sixtyMinuteHeadlessCapacityPassed,false);});
test('a wall clock jump cannot replace a real monotonic hour',()=>{const value=fixture();value.measuredMonotonicMs=120000;assert.equal(assessDurationReport(value).checks.actualWallClock,false);});
test('dead third decoder and fake queue transition each independently fail acceptance',()=>{
 const dead=fixture();dead.sessions[2].decodedSeconds=100;assert.equal(assessDurationReport(dead).checks.sustainedActualDecoding,false);
 const missing=fixture();missing.events[0].exactQueuedContextAdopted=false;assert.equal(assessDurationReport(missing).checks.queuedCrossSourceAdoption,false);
});
test('capacity pass cannot conceal a warm-recovery performance miss or wrong delivery mode',()=>{
 const value=fixture();value.events[1].firstAdvancingDecodeMs=5353;const result=assessDurationReport(value);assert.equal(result.sixtyMinuteHeadlessCapacityPassed,true);assert.equal(result.warmRecoveryTargetPassed,false);
 value.sessions[2].mode='cast-h264';assert.equal(assessDurationReport(value).sixtyMinuteHeadlessCapacityPassed,false);
});
test('duration ownership accepts the exact Windows production handoff, rejects port/path/argv substitution',{skip:process.platform!=='win32'},async()=>{
 const value=JSON.parse(await readFile(new URL('../../../../docs/one-piece/evidence/cast-media-compat/prepared-production-handoff.json',import.meta.url),'utf8'));
 assert.equal(validateDurationHandoff(value).port,18107);
 for(const mutate of [copy=>{copy.descriptor.baseUrl='http://127.0.0.1:18096';},copy=>{copy.cacheRoot='C:/unrelated-cache';},copy=>{copy.descriptor.args[1]='H:/PTI-OnePiece/runtime/jellyfin/data';}]){const copy=structuredClone(value);mutate(copy);assert.throws(()=>validateDurationHandoff(copy));}
});
