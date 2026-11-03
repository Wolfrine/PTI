import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDriveCreations,loadDriveCreations,DRIVE_CREATION_LIMITS} from '../drive-creations.mjs';
import {validateJob} from '../studio-contract.mjs';

// Metadata-only synthetic fixtures. These hashes/IDs do not identify private images.
const hash='a'.repeat(64),now=1800000000000;
const reference=(index=0,role='subject')=>({index,role,source:{kind:'drive',id:`synthetic-source-${index}`,name:`Synthetic source ${index}.png`},mime:'image/png',bytes:1024,sha256:hash,width:512,height:768});
function manifest(id='sample-1'){
 return {schemaVersion:1,kind:'velum-quality-run',runId:'synthetic-run',label:'Synthetic metadata fixture - no inference',sourceType:'synthetic',sourceLabel:'Synthetic adult fallback fixture',createdAt:now,samples:[{id,createdAt:now,completedAt:now+1000,durationSeconds:30.5,model:'qwen-image-2.1',prompt:'  Exact original prompt.\nNo rewriting.  ',effectivePrompt:'  Exact original prompt.\nNo rewriting.  ',seed:12345,settings:{steps:40,seed:12345,guidance:4.5,fixture:'SYNTHETIC - NOT A REAL OUTPUT'},image:{fileId:`synthetic-original-${id}`,mime:'image/png',bytes:4096,sha256:hash,width:512,height:768},references:[reference()],qualityEvaluation:{status:'UNKNOWN',identity:'UNKNOWN',pose:'UNKNOWN',photorealism:'UNKNOWN',garmentChange:'UNKNOWN',anatomy:'UNKNOWN',notes:'Metadata parser fixture; no image quality was evaluated.'}}]};
}
const parse=value=>parseDriveCreations(value,{manifestFileId:'synthetic-manifest',manifestName:'Velum-acceptance-synthetic.json'});
const file=(index,size)=>({id:`synthetic-manifest-${index}`,name:`Velum-acceptance-synthetic-${index}.json`,modifiedTime:new Date(now+index*1000).toISOString(),...(size===undefined?{}:{size})});

test('Drive catalog uses the same bounded original and conditioned-input budgets as Studio',()=>{
 const original=manifest();original.samples[0].image.width=896;original.samples[0].image.height=1184;assert.equal(parse(original)[0].width,896);
 for(const change of [{bytes:7200001},{width:3073},{width:1200,height:1200}]){const value=manifest();Object.assign(value.samples[0].image,change);assert.throws(()=>parse(value),/Invalid Drive quality catalog/);}
 for(const change of [{bytes:2097153},{width:1025},{height:1025}]){const value=manifest();Object.assign(value.samples[0].references[0],change);assert.throws(()=>parse(value),/Studio limits/);}
});

test('Drive quality catalog preserves exact evidence and creates immutable non-executable records',()=>{
 const input=manifest(),sample=input.samples[0];input.compareFileId='synthetic-comparison';const [record]=parse(input);
 assert.equal(record.id,'drive-quality-sample-1');assert.equal(record.schemaVersion,1);assert.equal(record.recordType,'drive-acceptance');assert.equal(record.status,'completed');assert.equal(record.executableJob,false);assert.equal(record.originalVerified,false);
 assert.equal(record.prompt,sample.prompt);assert.equal(record.effectivePrompt,sample.effectivePrompt);assert.equal(record.durationSeconds,30.5);assert.equal(record.completedAt-record.createdAt,1000,'actual inference seconds do not pretend to equal upload wall time');
 assert.deepEqual(record.driveOriginal,{fileId:sample.image.fileId,manifestFileId:'synthetic-manifest'});assert.equal(record.compareFileId,'synthetic-comparison');assert.equal(record.result.sha256,hash);assert.equal(record.result.bytes,4096);assert.equal(record.qualityEvaluation.identity,'UNKNOWN');assert.equal(record.provenance.sourceType,'synthetic');assert.equal(record.provenance.sourceLabel,input.sourceLabel);
 for(const value of [record,record.result,record.result.settings,record.references,record.references[0],record.references[0].source,record.qualityEvaluation])assert.ok(Object.isFrozen(value));
 input.samples[0].settings.steps=99;assert.equal(record.result.settings.steps,40);assert.throws(()=>{record.result.bytes=1;},TypeError);assert.throws(()=>validateJob(record));
 for(const key of ['deviceUid','expiresAt','consent','inputsReady','parentJobId'])assert.equal(Object.hasOwn(record,key),false);
});

test('manifest/sample/image/source/model validation rejects malformed or queue-shaped evidence',()=>{
 const variants=[
  m=>m.schemaVersion=4,m=>m.kind='job',m=>m.recordType='historical-import',m=>m.samples[0].recordType='job',m=>m.samples[0].status='completed',
  m=>m.sourceType='mixed',m=>delete m.sourceLabel,m=>m.sourceLabel='',m=>m.samples[0].model='made-up-model',m=>m.samples[0].seed=-1,
  m=>m.samples[0].image.sha256='A'.repeat(64),m=>m.samples[0].image.sha256='abc',m=>m.samples[0].image.mime='image/jpeg',m=>m.samples[0].image.bytes=0,m=>m.samples[0].image.width=0,m=>m.samples[0].image.height=20000,m=>{m.samples[0].image.width=16384;m.samples[0].image.height=16384;},m=>m.samples[0].image.fileId='https://example.invalid/image',
  m=>m.samples[0].createdAt='2026-11-03',m=>m.samples[0].completedAt=now-1,m=>m.samples[0].durationSeconds=NaN,m=>m.samples[0].durationSeconds=0,
  m=>m.samples[0].references=[],m=>m.samples[0].references[0].source.kind='file',m=>m.samples[0].references[0].source.id='',m=>m.samples[0].references[0].index=1,m=>m.samples[0].references[0].sha256='x'.repeat(64),m=>m.samples[0].references[0].source.id=m.samples[0].image.fileId,
  m=>m.samples[0].effectivePrompt=m.samples[0].prompt+' undisclosed rewrite',m=>m.samples[0].settings={},m=>m.samples[0].settings.guidance=Infinity,m=>m.samples[0].settings.constructor='blocked',
  m=>m.samples[0].qualityEvaluation.identity=9.2,m=>m.samples[0].qualityEvaluation.status='accepted',m=>m.samples[0].qualityEvaluation.pose='Good',m=>delete m.samples[0].qualityEvaluation.anatomy
 ];
 for(const [index,change] of variants.entries()){const candidate=manifest();change(candidate);assert.throws(()=>parse(candidate),/Invalid Drive quality catalog/,`malformed variant ${index}`);}
 assert.throws(()=>parseDriveCreations(manifest(),{manifestFileId:'../private'}),/manifest file ID/);
});

test('duplicate IDs, sample/reference bounds and per-model caps cannot masquerade as multiple outputs',()=>{
 let input=manifest();input.samples.push(structuredClone(input.samples[0]));assert.throws(()=>parse(input),/sample ID/);
 input=manifest();input.samples.push({...structuredClone(input.samples[0]),id:'other'});assert.throws(()=>parse(input),/duplicate original/);
 input=manifest();input.samples[0].references.push({...reference(1),source:{...reference().source}});assert.throws(()=>parse(input),/duplicate source/);
 input=manifest();input.samples=Array.from({length:11},(_,i)=>manifest('many-'+i).samples[0]);assert.throws(()=>parse(input),/sample count/);
 input=manifest();input.samples[0].references=Array.from({length:10},(_,i)=>reference(i));assert.equal(parse(input)[0].references.length,10);
 input.samples[0].references.push(reference(10));assert.throws(()=>parse(input),/reference count/);
 input=manifest();input.samples[0].model='flux2-klein-fp8';input.samples[0].references=[reference(0),reference(1),reference(2)];assert.throws(()=>parse(input),/reference count/);
 input=manifest();input.samples[0].model='realvis-dynamic';input.samples[0].references=[reference(0),reference(1)];assert.throws(()=>parse(input),/reference count/);
});

test('pose is an actual final image reference with exact effective-prompt and role/source lineage',()=>{
 function posed(){const input=manifest();const sample=input.samples[0];sample.references.push(reference(1,'pose'));sample.pose={referenceIndex:1,catalogId:'synthetic-catalog',fileId:'synthetic-source-1',category:'standard',label:'Synthetic pose',instruction:'Recorded exact pose instruction.',mode:'image'};sample.effectivePrompt=sample.prompt+'\n\n'+sample.pose.instruction;return input;}
 const [record]=parse(posed());assert.equal(record.references[1].role,'pose');assert.equal(record.pose.referenceIndex,1);assert.equal(record.effectivePrompt,record.prompt+'\n\n'+record.pose.instruction);
 for(const mutate of [m=>delete m.samples[0].pose,m=>m.samples[0].pose.mode='text',m=>m.samples[0].pose.fileId='wrong-source',m=>m.samples[0].pose.referenceIndex=0,m=>m.samples[0].effectivePrompt+=' rewrite',m=>m.samples[0].references.push(reference(2)),m=>m.samples[0].references[0].role='pose']){const input=posed();mutate(input);assert.throws(()=>parse(input),/Invalid Drive quality catalog/);}
});

test('conditioned pose input preserves its catalog source ID and separate immutable byte lineage',async()=>{
 const input=manifest(),sample=input.samples[0];
 const poseReference={...reference(1,'pose'),source:{kind:'drive',id:'synthetic-pose-original-900x1200',name:'Synthetic catalog original.png'},inputFileId:'synthetic-pose-conditioned-768x1024',width:768,height:1024,bytes:2048,sha256:'b'.repeat(64)};
 sample.references.push(poseReference);
 sample.pose={referenceIndex:1,catalogId:'synthetic-catalog',fileId:poseReference.source.id,category:'standard',label:'Synthetic pose',instruction:'Recorded exact pose instruction.',mode:'image'};
 sample.effectivePrompt=sample.prompt+'\n\n'+sample.pose.instruction;
 const [record]=parse(input),referenceRecord=record.references[1];
 assert.equal(referenceRecord.source.id,'synthetic-pose-original-900x1200');assert.equal(record.pose.fileId,referenceRecord.source.id);
 assert.equal(referenceRecord.inputFileId,'synthetic-pose-conditioned-768x1024');assert.equal(referenceRecord.sha256,'b'.repeat(64));assert.equal(referenceRecord.bytes,2048);assert.equal(referenceRecord.width,768);assert.equal(referenceRecord.height,1024);
 assert.ok(Object.isFrozen(referenceRecord));assert.throws(()=>{referenceRecord.inputFileId='mutated';},TypeError);assert.throws(()=>validateJob(record));
 assert.equal(Object.hasOwn(record.references[0],'inputFileId'),false,'legacy references preserve source-only lookup');
 const loaded=await loadDriveCreations({listManifests:async()=>[file(1)],readManifest:async()=>JSON.stringify(input)});
 assert.equal(loaded[0].references[1].inputFileId,referenceRecord.inputFileId);assert.equal(loaded[0].pose.fileId,referenceRecord.source.id);
 poseReference.inputFileId='changed-after-parse';assert.equal(referenceRecord.inputFileId,'synthetic-pose-conditioned-768x1024');
 const legacy=parse(manifest())[0];assert.equal(Object.hasOwn(legacy.references[0],'inputFileId'),false);assert.equal(legacy.references[0].source.id,'synthetic-source-0');
});

test('conditioned input IDs reject URLs, malformed IDs, output/manifest collisions and duplicate inputs',()=>{
 for(const value of ['',null,undefined,12,'../conditioned','https://example.invalid/input.png','data:image/png;base64,AAAA','input id','x'.repeat(161)]){
  const input=manifest();input.samples[0].references[0].inputFileId=value;assert.throws(()=>parse(input),/reference input file ID/);
 }
 for(const value of ['synthetic-original-sample-1','synthetic-manifest']){
  const input=manifest();input.samples[0].references[0].inputFileId=value;assert.throws(()=>parse(input),/reference input collides/);
 }
 const duplicate=manifest();duplicate.samples[0].references=[{...reference(0),inputFileId:'synthetic-shared-input'},{...reference(1),inputFileId:'synthetic-shared-input'}];assert.throws(()=>parse(duplicate),/duplicate reference input/);
 const extra=manifest();extra.samples[0].references[0].inputFileId='synthetic-conditioned';extra.samples[0].references[0].inputUrl='https://example.invalid/input.png';assert.throws(()=>parse(extra),/reference fields/);
 const overwrittenPose=manifest();overwrittenPose.samples[0].references.push({...reference(1,'pose'),inputFileId:'synthetic-conditioned-pose'});overwrittenPose.samples[0].pose={referenceIndex:1,catalogId:'synthetic-catalog',fileId:'synthetic-conditioned-pose',category:'standard',label:'Synthetic pose',instruction:'Recorded exact pose instruction.',mode:'image'};overwrittenPose.samples[0].effectivePrompt=overwrittenPose.samples[0].prompt+'\n\n'+overwrittenPose.samples[0].pose.instruction;assert.throws(()=>parse(overwrittenPose),/pose source lineage/);
});

test('quality judgments remain bounded strings and never convert to automatic acceptance',()=>{
 const input=manifest();input.sourceType='real';input.sourceLabel='Real source metadata fixture only';input.samples[0].qualityEvaluation={status:'assessed',identity:'UNKNOWN',pose:'Visible mismatch noted by fixture reviewer',photorealism:'Lighting assessment pending',garmentChange:'Requested edit not established',anatomy:'UNKNOWN',notes:'No automatic keep decision.'};
 const [record]=parse(input);assert.deepEqual(record.qualityEvaluation,input.samples[0].qualityEvaluation);assert.equal(Object.hasOwn(record,'feedback'),false);assert.equal(Object.hasOwn(record,'accepted'),false);
 input.samples[0].qualityEvaluation.anatomy='x'.repeat(2001);assert.throws(()=>parse(input),/quality judgment/);
});

test('loader requests Private manifests, reads only the five latest matches and returns at most fifty read-only records',async()=>{
 const reads=[];let query;
 const records=await loadDriveCreations({listManifests:async options=>{query=options;return {files:[file(1),{id:'unrelated',name:'Other.json'},file(4),file(0),file(5),file(2),file(3)]};},readManifest:async listed=>{reads.push(listed.id);const input=manifest();input.samples=Array.from({length:10},(_,i)=>{const sample=manifest(listed.id+'-'+i).samples[0];sample.createdAt+=i;return sample;});return JSON.stringify(input);}});
 assert.deepEqual(query,{folder:'private',prefix:'Velum-acceptance-',mimeType:'application/json',limit:5,orderBy:'modifiedTime desc'});assert.deepEqual(reads,[5,4,3,2,1].map(i=>'synthetic-manifest-'+i));assert.equal(records.length,50);assert.ok(Object.isFrozen(records));assert.ok(records.every(record=>record.recordType==='drive-acceptance'&&record.executableJob===false));assert.equal(DRIVE_CREATION_LIMITS.records,50);
});

test('loader accepts bounded UTF-8 strings/binary/Blob and rejects malformed JSON/encoding',async()=>{
 const text=JSON.stringify(manifest());const encoded=new TextEncoder().encode(text);
 for(const response of [text,encoded,encoded.buffer,new Blob([text])]){const records=await loadDriveCreations({listManifests:async()=>[file(1)],readManifest:async()=>response});assert.equal(records.length,1);}
 for(const response of ['{',new Uint8Array([255,255]),{},'null'])await assert.rejects(loadDriveCreations({listManifests:async()=>[file(1)],readManifest:async()=>response}),/Invalid Drive quality catalog/);
});

test('aggregate JSON, settings nesting/size and listing bounds are enforced before returning evidence',async()=>{
 let reads=0;
 await assert.rejects(loadDriveCreations({listManifests:async()=>[file(1),file(2),file(3)],readManifest:async item=>{reads++;return JSON.stringify(manifest(item.id))+' '.repeat(128*1024);}}),/aggregate JSON size/);assert.equal(reads,2);
 await assert.rejects(loadDriveCreations({listManifests:async()=>[file(1,DRIVE_CREATION_LIMITS.jsonBytes+1)],readManifest:async()=>{throw Error('Must not read');}}),/listed manifest size/);
 await assert.rejects(loadDriveCreations({listManifests:async()=>Array.from({length:101},(_,i)=>file(i)),readManifest:async()=>''}),/manifest listing/);
 let input=manifest();input.samples[0].settings={nested:{a:{b:{c:{d:{e:{f:{g:true}}}}}}}};assert.throws(()=>parse(input),/settings depth/);
 input=manifest();input.samples[0].settings.long=Array(100).fill('x'.repeat(1000));assert.throws(()=>parse(input),/settings size/);
 input=manifest();input.label='x'.repeat(DRIVE_CREATION_LIMITS.jsonBytes);assert.throws(()=>parse(input),/manifest size/);
});

test('duplicate listed manifests or loaded sample/image IDs reject ambiguity',async()=>{
 await assert.rejects(loadDriveCreations({listManifests:async()=>[file(1),file(1)],readManifest:async()=>JSON.stringify(manifest())}),/duplicate manifest/);
 await assert.rejects(loadDriveCreations({listManifests:async()=>[file(1),file(2)],readManifest:async()=>JSON.stringify(manifest())}),/duplicate loaded record/);
 await assert.rejects(loadDriveCreations({listManifests:async()=>[file(1),file(2)],readManifest:async listed=>{const input=manifest(listed.id);input.samples[0].image.fileId='same-image';return JSON.stringify(input);}}),/duplicate loaded record/);
});

test('cancellation before and during authenticated callback reads returns no late records',async()=>{
 let reads=0;const first=new AbortController();first.abort();await assert.rejects(loadDriveCreations({signal:first.signal,listManifests:async()=>{throw Error('Must not list');},readManifest:async()=>''}),{name:'AbortError'});
 const second=new AbortController();await assert.rejects(loadDriveCreations({signal:second.signal,listManifests:async options=>{assert.equal(options.signal,second.signal);return [file(1),file(2)];},readManifest:async(_,options)=>{reads++;assert.equal(options.signal,second.signal);second.abort();return JSON.stringify(manifest());}}),{name:'AbortError'});assert.equal(reads,1);
 const third=new AbortController();class LateBlob extends Blob{async arrayBuffer(){third.abort();return super.arrayBuffer();}}
 await assert.rejects(loadDriveCreations({signal:third.signal,listManifests:async()=>[file(1)],readManifest:async()=>new LateBlob([JSON.stringify(manifest())])}),{name:'AbortError'});
});
