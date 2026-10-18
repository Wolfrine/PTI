/** Pure evidence checks for the opt-in capacity harness; unit fixtures are not real-run evidence. */
export const REQUIRED_DURATION_MS=3_600_000;

export function parseDecoderProgress(block){
 const fields=Object.fromEntries(block.trim().split(/\r?\n/).filter(line=>line.includes('=')).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
 const frames=Number(fields.frame),microseconds=Number(fields.out_time_us);
 if(!Number.isSafeInteger(frames)||frames<0||!Number.isFinite(microseconds)||microseconds<0||!['continue','end'].includes(fields.progress))return null;
 return{frames,seconds:microseconds/1_000_000,ended:fields.progress==='end'};
}

export function assessDurationReport(report){
 const sessions=report.sessions??[],samples=report.samples??[],events=report.events??[];
 const checks={
  actualWallClock:report.measuredWallClockMs>=REQUIRED_DURATION_MS&&report.measuredMonotonicMs>=REQUIRED_DURATION_MS,
  threeDistinctProfiles:sessions.length===3&&new Set(sessions.map(row=>row.uid)).size===3&&new Set(sessions.map(row=>row.sessionId)).size===3,
  sustainedActualDecoding:sessions.length===3&&sessions.every(row=>row.decodedFrames>1000&&row.decodedSeconds>=REQUIRED_DURATION_MS/1000*.97&&row.lastAdvanceElapsedMs>=REQUIRED_DURATION_MS-10_000&&row.progressSamples>600&&row.decoderErrors===0),
  boundedUnplannedGaps:sessions.length===3&&sessions.every(row=>row.maximumUnplannedAdvanceGapMs<=7500),
  queuedCrossSourceAdoption:events.some(row=>row.type==='natural-queued-transition'&&row.from===1000&&row.to===1001&&row.sameCoordinatorSession&&row.sameProgressLease&&row.exactQueuedContextAdopted&&row.decoderReachedEof),
  deliberateRewind:events.some(row=>row.type==='seek'&&row.toSeconds<row.fromSeconds&&row.persistedRewind===true),
  durableIndependentResume:sessions.length===3&&sessions.every(row=>row.durableResumeMatches===true)&&events.some(row=>row.type==='pause-resume'&&row.persistedPositionReused===true),
  quotaMaintained:samples.length>=60&&samples.every(row=>Number.isFinite(row.storage?.usedBytes)&&row.storage.usedBytes<=20*1024**3&&!row.storage.safetyPaused),
  noSourceNetwork:report.originalDownloadAttempts===0&&report.newOriginalNetworkBytes===0,
  productionPreparedOnly:sessions.length===3&&sessions.every(row=>row.mode==='prepared-mp4')&&report.testOnlyStaticBinding!==true,
 };
 const recoveries=events.filter(row=>['seek','pause-resume','natural-queued-transition','manual-loop'].includes(row.type));
 return{checks,sixtyMinuteHeadlessCapacityPassed:!report.error&&Object.values(checks).every(Boolean),
  warmRecoveryTargetMs:5000,warmRecoveryTargetPassed:recoveries.length>=5&&recoveries.every(row=>Number.isFinite(row.firstAdvancingDecodeMs)&&row.firstAdvancingDecodeMs<=5000),
  warmRecoveryMisses:recoveries.filter(row=>!Number.isFinite(row.firstAdvancingDecodeMs)||row.firstAdvancingDecodeMs>5000).map(row=>({type:row.type,uid:row.uid,elapsedMs:row.firstAdvancingDecodeMs??null}))};
}
