/** Lifecycle-only test wrapper around the REAL production coordinator. No media response or source stubs. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createMediaCoordinator} from '../src/media/index.mjs';
import {ownDurationEngine,validateDurationHandoff,authorizeOwnedEngineIntent} from './duration-owned-engine.mjs';

const HANDOFF=fileURLToPath(new URL('../../../../docs/one-piece/evidence/cast-media-compat/prepared-production-handoff.json',import.meta.url));
const HUMAN_LINEAGE=fileURLToPath(new URL('../../../../docs/one-piece/evidence/cast-media-compat/human-production-lineage.json',import.meta.url));
const BIN='H:/PTI-OnePiece/pilot/jellyfin/runtime/jellyfin';
const codeError=code=>Object.assign(new Error(code),{code});

export function validateHumanLineageRecords(audit,records){
 assert.equal(audit.kind,'read-only-human-helper-to-production-payload-lineage');assert.deepEqual(audit.episodes.map(row=>row.episode),[1000,1001]);
 for(const row of audit.episodes){const record=records.get(row.productionRenditionId);assert.ok(record&&row.allStoredPayloadHashesAndSelectionsMatch&&row.humanObservation.acceptedForObservedJapaneseAndEnglishPresentation);
  assert.equal(record.video.sha256,row.video.sha256);assert.equal(record.video.bytes,row.video.bytes);
  assert.equal(record.captions.sha256,row.fullEnglishVtt.sha256);assert.equal(record.captions.bytes,row.fullEnglishVtt.bytes);assert.equal(record.captions.cueIdentity.cues,row.fullEnglishVtt.cueIdentity.cues);
  assert.equal(record.recipe.original.md5,row.original.md5);assert.equal(record.recipe.audio.index,row.original.selected.audioIndex);assert.equal(record.recipe.subtitle.index,row.original.selected.subtitleIndex);
 }
 return{artifact:'docs/one-piece/evidence/cast-media-compat/human-production-lineage.json',sameStoredVideoCaptionHashesAndSelection:true,
  scope:'Prior timed human presentation observations only; no new human reply, fresh full-file rehash, quantified subtitle sync or current TV transport pass is inferred',limits:audit.limits};
}

export async function createProductionPreparedPilot({catalog,privateRoot,handoffPath=HANDOFF}={}){
 assert.ok(catalog?.episodes?.length&&typeof privateRoot==='string');
 const relative=path.win32.relative('H:/PTI-OnePiece/real-cast-qa',privateRoot);
 assert.ok(relative&&!relative.startsWith('..')&&!path.win32.isAbsolute(relative),'Use only the Cast harness private run root');
 const handoff=validateDurationHandoff(JSON.parse(await readFile(handoffPath,'utf8')));
 let owner,initialized=false,closed=false,stopping=null;
 const evidence={kind:'real-production-prepared-coordinator-hardware-binding',productionMediaModules:true,testOnlyStaticBinding:false,
  defaultMode:'prepared-mp4',newOriginalDownloads:0,originalDownloadAttempts:0,enginePort:handoff.port,originalsAllowedByHarness:[1000,1001],
  identity:'synthetic control-plane identities only; no production Firebase or physical-phone authentication proof',startedAt:null,cleanup:{}};
 const media=createMediaCoordinator({catalog,cacheRoot:handoff.cacheRoot,managedRoots:handoff.managedRoots,
  extraAccountingRoots:[...handoff.extraAccountingRoots,privateRoot],defaultMode:'prepared-mp4',verifiedModes:['compatible-h264','cast-h264','prepared-mp4'],autoPrefetch:false,monitorMs:1000,
  downloader:{async download(){evidence.originalDownloadAttempts++;throw codeError('cached-original-required');}},
  jellyfin:{baseUrl:handoff.baseUrl,tokenProvider:async()=>{assert.ok(owner,'Owned engine not started');return owner.tokenProvider();},preparedEnabled:true,ffmpegPath:`${BIN}/ffmpeg.exe`,ffprobePath:`${BIN}/ffprobe.exe`},
  onEmergencyStop:async error=>{
   evidence.emergencyStop={code:/^[A-Za-z0-9_-]+$/.test(error?.code??'')?error.code:'media-emergency'};
   // Coordinator already aborts its owned jobs before invoking this hook. Verify/cancel its exact engine, never a shared pilot.
   if(owner)await owner.shutdown(media.engine);
  }});
 const initialize=media.initialize.bind(media),shutdown=media.shutdown.bind(media);
 media.evidence=evidence;
 media.initialize=async options=>{
  authorizeOwnedEngineIntent('cast');assert.equal(process.env.PTI_CAST_PRODUCTION_PREPARED,'1','Separate production Cast opt-in required');
  assert.ok(!initialized&&!closed,'Initialize this owned wrapper once');initialized=true;evidence.startedAt=new Date().toISOString();
  owner=await ownDurationEngine(handoffPath,{intent:'cast'});evidence.engine=owner.evidence;
  await owner.ready(media.engine);const result=await initialize(options);
  const usage=await media.cache.usage();assert.ok(usage.projectedBytes<=20*1024**3,'Global retained media exceeds the approved quota');
  evidence.initialStorage=usage;evidence.coordinatorClass=media.constructor.name;
  evidence.priorHumanPresentationLineage=validateHumanLineageRecords(JSON.parse(await readFile(HUMAN_LINEAGE,'utf8')),media.cache.renditions);return result;
 };
 media.shutdown=async()=>{
  if(stopping)return stopping;closed=true;
  stopping=(async()=>{
   let failure;try{if(initialized)await shutdown();evidence.cleanup.coordinatorClosed=true;}catch(error){failure=error;evidence.cleanup.coordinatorClosed=false;}
   try{if(owner)await owner.shutdown(media.engine);evidence.cleanup.ownedEngineStopped=Boolean(owner?.evidence.cleanup.proof?.noOwnedProcess);}catch(error){failure??=error;evidence.cleanup.ownedEngineStopped=false;}
   if(failure)throw failure;
  })();return stopping;
 };
 return media;
}
