// Read-only quality evidence. These records never enter the executable job schema.
const contractURL=new URL('./studio-contract.mjs',import.meta.url);contractURL.search=new URL(import.meta.url).search;
const {MODEL_IDS,MODEL_REFERENCE_LIMITS}=await import(contractURL.href);
export const DRIVE_CREATION_LIMITS=Object.freeze({manifests:5,samples:10,records:50,jsonBytes:256*1024,imageBytes:7200000,imageEdge:3072,imagePixels:1150000});
const encoder=new TextEncoder(),fileID=/^[A-Za-z0-9_-]{1,160}$/,sampleID=/^[A-Za-z0-9_-]{1,80}$/,hash=/^[a-f0-9]{64}$/;
const fail=message=>{throw new Error(`Invalid Drive quality catalog: ${message}.`);};
function object(value,label){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail(label);return value;}
function keys(value,required,optional=[],label='unexpected fields'){object(value,label);const allowed=new Set([...required,...optional]);if(required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!allowed.has(key)))fail(label);}
function string(value,max,label,{empty=false}={}){if(typeof value!=='string'||value.length>max||(!empty&&!value.trim())||/[\u0000]/.test(value))fail(label);return value;}
function integer(value,min,max,label){if(!Number.isSafeInteger(value)||value<min||value>max)fail(label);return value;}
function driveID(value,label='file ID'){if(typeof value!=='string'||!fileID.test(value))fail(label);return value;}
function timestamp(value,label){return integer(value,1,8640000000000000,label);}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function jsonSize(value){try{return encoder.encode(JSON.stringify(value)).byteLength;}catch{fail('JSON');}}
function settings(value){
 object(value,'settings');if(!Object.keys(value).length)fail('missing recorded settings');let entries=0;
 function visit(node,depth=0){
  if(depth>6)fail('settings depth');
  if(node===null||typeof node==='boolean')return;
  if(typeof node==='number'){if(!Number.isFinite(node))fail('settings number');return;}
  if(typeof node==='string'){string(node,6000,'settings string',{empty:true});return;}
  if(Array.isArray(node)){if(node.length>100)fail('settings array');node.forEach(item=>visit(item,depth+1));return;}
  object(node,'settings value');
  for(const [key,item] of Object.entries(node)){if(++entries>512||['__proto__','constructor','prototype'].includes(key)||key.length>100)fail('settings keys');visit(item,depth+1);}
 }
 visit(value);if(jsonSize(value)>32768)fail('settings size');return JSON.parse(JSON.stringify(value));
}
function image(value,label,{original=false}={}){
 keys(value,original?['fileId','mime','bytes','sha256','width','height']:['mime','bytes','sha256','width','height'],[],label);
 if(original)driveID(value.fileId);
 if(!(original?['image/png']:['image/png','image/jpeg']).includes(value.mime))fail(label+' MIME');
 integer(value.bytes,100,DRIVE_CREATION_LIMITS.imageBytes,label+' byte length');
 if(typeof value.sha256!=='string'||!hash.test(value.sha256))fail(label+' hash');
 integer(value.width,1,DRIVE_CREATION_LIMITS.imageEdge,label+' width');integer(value.height,1,DRIVE_CREATION_LIMITS.imageEdge,label+' height');
 if(value.width*value.height>DRIVE_CREATION_LIMITS.imagePixels)fail(label+' pixel count');
 return {...value};
}
function reference(value,index){
 keys(value,['index','role','source','mime','bytes','sha256','width','height'],['inputFileId'],'reference fields');
 if(value.index!==index||!['subject','pose'].includes(value.role))fail('reference order or role');
 keys(value.source,['kind','id','name'],[],'reference source');if(value.source.kind!=='drive')fail('reference source kind');
 driveID(value.source.id,'reference source ID');string(value.source.name,160,'reference source name');
 if(Object.hasOwn(value,'inputFileId'))driveID(value.inputFileId,'reference input file ID');
 const {mime,bytes,sha256,width,height}=value;image({mime,bytes,sha256,width,height},'reference');
 if(bytes>2097152||width>1024||height>1024||width*height>1048576)fail('conditioned reference exceeds Studio limits');
 return {...value,source:{...value.source}};
}
function pose(value,references){
 keys(value,['referenceIndex','catalogId','fileId','category','label','instruction','mode'],[],'pose fields');
 if(value.mode!=='image')fail('pose mode');
 const index=integer(value.referenceIndex,0,references.length-1,'pose reference index'),ref=references[index];
 if(index!==references.length-1||ref.role!=='pose'||ref.source.id!==value.fileId)fail('pose source lineage');
 driveID(value.fileId,'pose file ID');string(value.catalogId,160,'pose catalog');string(value.category,80,'pose category');string(value.label,160,'pose label');string(value.instruction,1200,'pose instruction');
 return {...value};
}
function evaluation(value){
 const dimensions=['identity','pose','photorealism','garmentChange','anatomy'];
 keys(value,['status',...dimensions,'notes'],[],'quality evaluation fields');
 if(!['UNKNOWN','assessed'].includes(value.status))fail('quality evaluation status');
 for(const key of dimensions){string(value[key],2000,'quality judgment');if(value.status==='UNKNOWN'&&value[key]!=='UNKNOWN')fail('unknown quality judgment');}
 string(value.notes,4000,'quality notes',{empty:true});return {...value};
}

/**
 * Private manifest v1:
 * {schemaVersion:1,kind:'velum-quality-run',runId,label,sourceType:'real'|'synthetic',
 *  sourceLabel,createdAt,compareFileId?,samples:[{id,createdAt,completedAt,durationSeconds,
 *  model,prompt,effectivePrompt,seed,settings,image:{fileId,mime:'image/png',bytes,
 *  sha256,width,height},references:[{index,role:'subject'|'pose',source:{kind:'drive',
 *  id,name},inputFileId?,mime,bytes,sha256,width,height}],pose?,qualityEvaluation:{status:'UNKNOWN'|
 *  'assessed',identity,pose,photorealism,garmentChange,anatomy,notes}}]}
 * Hashes/sizes are expectations until the caller verifies actual original bytes.
 * Reference integrity metadata describes inputFileId when present, otherwise
 * source.id. source.id and pose.fileId always retain the original source identity.
 */
export function parseDriveCreations(manifest,{manifestFileId,manifestName=''}={}){
 driveID(manifestFileId,'manifest file ID');string(manifestName,200,'manifest name',{empty:true});
 if(jsonSize(manifest)>DRIVE_CREATION_LIMITS.jsonBytes)fail('manifest size');
 keys(manifest,['schemaVersion','kind','runId','label','sourceType','sourceLabel','createdAt','samples'],['compareFileId'],'manifest fields');
 if(manifest.schemaVersion!==1||manifest.kind!=='velum-quality-run')fail('manifest type');
 if(typeof manifest.runId!=='string'||!sampleID.test(manifest.runId))fail('run ID');
 string(manifest.label,160,'run label');if(!['real','synthetic'].includes(manifest.sourceType))fail('source type');
 string(manifest.sourceLabel,160,'source label');timestamp(manifest.createdAt,'manifest timestamp');
 if(manifest.compareFileId!==undefined)driveID(manifest.compareFileId,'comparison file ID');
 if(!Array.isArray(manifest.samples)||!manifest.samples.length||manifest.samples.length>DRIVE_CREATION_LIMITS.samples)fail('sample count');
 const sampleIDs=new Set(),originalIDs=new Set();
 return freeze(manifest.samples.map(sample=>{
  keys(sample,['id','createdAt','completedAt','durationSeconds','model','prompt','effectivePrompt','seed','settings','image','references','qualityEvaluation'],['pose'],'sample fields');
  if(typeof sample.id!=='string'||!sampleID.test(sample.id)||sampleIDs.has(sample.id))fail('duplicate or invalid sample ID');sampleIDs.add(sample.id);
  timestamp(sample.createdAt,'sample timestamp');timestamp(sample.completedAt,'completion timestamp');if(sample.completedAt<sample.createdAt)fail('completion precedes start');
  if(!Number.isFinite(sample.durationSeconds)||sample.durationSeconds<=0||sample.durationSeconds>604800)fail('inference duration');
  if(!MODEL_IDS.includes(sample.model))fail('model');
  string(sample.prompt,6000,'original prompt');string(sample.effectivePrompt,8000,'effective prompt');integer(sample.seed,0,2147483647,'seed');
  const actualSettings=settings(sample.settings),original=image(sample.image,'original image',{original:true});
  if(originalIDs.has(original.fileId)||original.fileId===manifestFileId)fail('duplicate original or manifest ID');originalIDs.add(original.fileId);
  if(!Array.isArray(sample.references)||!sample.references.length||sample.references.length>Math.min(10,MODEL_REFERENCE_LIMITS[sample.model]||0))fail('model reference count');
  const references=sample.references.map(reference),sourceIDs=new Set(),inputIDs=new Set();let poseCount=0;
  for(const ref of references){
   if(sourceIDs.has(ref.source.id)||ref.source.id===original.fileId)fail('duplicate source or overwritten original');sourceIDs.add(ref.source.id);
   const inputID=ref.inputFileId||ref.source.id;
   if(inputID===original.fileId||inputID===manifestFileId)fail('reference input collides with output or manifest');
   if(inputIDs.has(inputID))fail('duplicate reference input');inputIDs.add(inputID);
   if(ref.role==='pose')poseCount++;
  }
  if(!references.some(ref=>ref.role==='subject'))fail('subject source missing');
  const selectedPose=sample.pose===undefined?undefined:pose(sample.pose,references);
  if(poseCount!==(selectedPose?1:0))fail('pose role lineage');
  if(sample.effectivePrompt!==(selectedPose?`${sample.prompt}\n\n${selectedPose.instruction}`:sample.prompt))fail('effective prompt lineage');
  const qualityEvaluation=evaluation(sample.qualityEvaluation);
  const {mime,bytes,sha256,width,height}=original;
  return {
   id:`drive-quality-${sample.id}`,schemaVersion:1,recordType:'drive-acceptance',executableJob:false,status:'completed',originalVerified:false,
   model:sample.model,prompt:sample.prompt,effectivePrompt:sample.effectivePrompt,seed:sample.seed,width,height,
   createdAt:sample.createdAt,completedAt:sample.completedAt,durationSeconds:sample.durationSeconds,
   result:{mime,bytes,sha256,width,height,seconds:sample.durationSeconds,settings:actualSettings},references,...(selectedPose?{pose:selectedPose}:{}),qualityEvaluation,
   driveOriginal:{fileId:original.fileId,manifestFileId},...(manifest.compareFileId?{compareFileId:manifest.compareFileId}:{}),
   provenance:{kind:manifest.kind,runId:manifest.runId,label:manifest.label,sourceType:manifest.sourceType,sourceLabel:manifest.sourceLabel,manifestFileId,manifestName}
  };
 }));
}

function abort(signal){if(signal?.aborted){if(signal.throwIfAborted)signal.throwIfAborted();throw new DOMException('Catalog read cancelled.','AbortError');}}
async function manifestText(value,remaining){
 let bytes;
 if(typeof value==='string')bytes=encoder.encode(value);
 else if(typeof Blob!=='undefined'&&value instanceof Blob){if(value.size>remaining)fail('aggregate JSON size');bytes=new Uint8Array(await value.arrayBuffer());}
 else if(value instanceof ArrayBuffer)bytes=new Uint8Array(value);
 else if(ArrayBuffer.isView(value))bytes=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
 else fail('manifest response');
 if(bytes.byteLength>remaining)fail('aggregate JSON size');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('manifest encoding');}
 return {text,bytes:bytes.byteLength};
}

// Callbacks provide authenticated Drive reads. No OAuth state, network endpoint or
// queue write is owned here. At most five originals' manifests, 256 KiB aggregate JSON.
export async function loadDriveCreations({listManifests,readManifest,signal}={}){
 if(typeof listManifests!=='function'||typeof readManifest!=='function')throw new Error('Drive quality catalog reads are unavailable.');
 abort(signal);
 const listed=await listManifests({folder:'private',prefix:'Velum-acceptance-',mimeType:'application/json',limit:5,orderBy:'modifiedTime desc',...(signal?{signal}:{})});abort(signal);
 const files=Array.isArray(listed)?listed:listed?.files;if(!Array.isArray(files)||files.length>100)fail('manifest listing');
 const candidates=files.filter(file=>typeof file?.name==='string'&&/^Velum-acceptance-[A-Za-z0-9_.-]+\.json$/.test(file.name)).map(file=>{
  driveID(file.id,'listed manifest ID');string(file.name,200,'manifest filename');
  const modifiedAt=typeof file.modifiedTime==='number'?file.modifiedTime:Date.parse(file.modifiedTime);
  if(!Number.isFinite(modifiedAt)||modifiedAt<=0)fail('manifest modified time');
  const size=file.size===undefined?undefined:Number(file.size);if(size!==undefined&&(!Number.isSafeInteger(size)||size<1||size>DRIVE_CREATION_LIMITS.jsonBytes))fail('listed manifest size');
  return {...file,modifiedAt,size};
 }).sort((a,b)=>b.modifiedAt-a.modifiedAt||a.id.localeCompare(b.id)).slice(0,5);
 const manifestIDs=new Set(),recordIDs=new Set(),imageIDs=new Set(),records=[];let usedBytes=0;
 for(const file of candidates){
  if(manifestIDs.has(file.id))fail('duplicate manifest ID');manifestIDs.add(file.id);
  abort(signal);const raw=await readManifest(file,signal?{signal}:{});abort(signal);
  const {text,bytes}=await manifestText(raw,DRIVE_CREATION_LIMITS.jsonBytes-usedBytes);abort(signal);usedBytes+=bytes;
  let manifest;try{manifest=JSON.parse(text);}catch{fail('manifest JSON');}
  const page=parseDriveCreations(manifest,{manifestFileId:file.id,manifestName:file.name});
  for(const record of page){if(recordIDs.has(record.id)||imageIDs.has(record.driveOriginal.fileId))fail('duplicate loaded record');recordIDs.add(record.id);imageIDs.add(record.driveOriginal.fileId);records.push(record);}
  if(records.length>DRIVE_CREATION_LIMITS.records)fail('loaded record count');
 }
 abort(signal);return Object.freeze(records.sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id)));
}
