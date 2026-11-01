// Preparation only: no credential loading, network client, inference or CLI side effects.
// A release-approved caller can supply the existing approved-PC Queue adapter.
import {readFile,stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {imagePayload} from './core.mjs';
import {thumbnailPayload} from './reference-input.mjs';
import {PC_DEVICE_UID} from '../../velum-gallery/device-config.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const ORIGINAL = '761e1c0d1c2eabc32539ee49e7e10ccf7c84a449018557156598aef6585aab15';
const POSE = 'b3d8dd39972adedee458f30fcf58c827575313591ca2a5ea57486dc454cd562c';
const INTENT = '009bed88a1d1991f7d3f94928425d1cfcf88455d4cd9d2d1c2284399ef71526d';
export const HISTORICAL_CATALOG = Object.freeze([
  {phase:'phase2',variant:'A',directory:'phase2/renders/A-attempt2',metadata:'result.v2.json',image:'image.png',bytes:465382,sha256:'6e07512ad8b86d879d9250ba79ce8e67e29994930b409becfdc3ffc48bf65b7b',comparison:'Baseline full-frame resize; no pose target.'},
  {phase:'phase2',variant:'B',directory:'phase2/renders/B',metadata:'result.v2.json',image:'image.png',bytes:355858,sha256:'75faf9c95f77a1b243287a17e57cbd34e7226c7bb9dc3dcc15013a5fb8a068fd',comparison:'Contain plus padding on a different conditioning canvas; no pose target.'},
  {phase:'phase5',variant:'A',directory:'phase5/renders/A',metadata:'result.json',image:'image.PRIVATE.png',bytes:488112,sha256:'590cbed1fef9ab3f5f0981f4f54c94f711a1238b33faf8f8e17975bff86f5a12',comparison:'Baseline person resize; second reference is P017 pose only.'},
  {phase:'phase5',variant:'B',directory:'phase5/renders/B',metadata:'result.json',image:'image.PRIVATE.png',bytes:486687,sha256:'4a8f9d2985bc6a6e7b0ada0b3dc94887ea629eca737d955df838affbd3ed4376',comparison:'Person contain plus minimal padding on the same canvas; P017 unchanged.'},
]);

export async function prepareHistoricalImports(root,{now=Date.now(),makeThumbnail}={}) {
  if(!Number.isSafeInteger(now)||now<=0||typeof makeThumbnail!=='function')throw Error('historical-import:preparation-options');
  root=await realpath(root);
  // Fixed catalog only. Resolve every file before reading; never follow an escaping junction.
  const local = async relative => {
    const file=await realpath(path.resolve(root,relative)),relativePath=path.relative(root,file);
    if(relativePath.startsWith('..')||path.isAbsolute(relativePath))throw Error('historical-import:outside-root');
    return file;
  };
  const json = async relative => {const file=await local(relative),bytes=await readFile(file);if(bytes.length>131072)throw Error('historical-import:metadata-size');return {file,sha256:sha(bytes),value:JSON.parse(bytes)};};
  const phase2=await json('phase2/manifest.v2.1.json'),phase5=await json('phase5/delivery-manifest.json');
  if(phase2.value.private!==true||phase2.value.synthetic!==false||phase2.value.generated_images!==2||phase5.value.private!==true||phase5.value.synthetic_outputs!==false)throw Error('historical-import:not-genuine');
  const originalPath=await local('phase5/inputs/original.PRIVATE.jpg'),posePath=await local('phase5/full_single_P017_side.png');
  if(sha(await readFile(originalPath))!==ORIGINAL||sha(await readFile(posePath))!==POSE)throw Error('historical-import:input-integrity');
  const prepared=[];
  for(const entry of HISTORICAL_CATALOG){
    const manifest=entry.phase==='phase2'?phase2:phase5,metadata=await json(`${entry.directory}/${entry.metadata}`),source=metadata.value;
    const rawSettings=source.runtime_settings||source.settings,settings=Object.fromEntries(['model','seed','width','height','steps','cfg','denoise','sampler','scheduler','referenceCount','referenceMethod','referencePixels'].filter(key=>rawSettings?.[key]!==undefined).map(key=>[key,rawSettings[key]]));
    const expected=entry.phase==='phase2'?manifest.value.verification?.[entry.variant]:manifest.value.output_hashes?.[entry.variant];
    if(source.status!=='generated'||source.synthetic!==false||source.variant!==entry.variant||source.source_sha256!==ORIGINAL||
      (source.prompt_sha256||source.intent_sha256)!==INTENT||source.output?.sha256!==entry.sha256||source.output.bytes!==entry.bytes||expected?.sha256!==entry.sha256||expected.bytes!==entry.bytes||
      settings?.model!=='flux2-klein-fp8'||settings.seed!==873111462||settings.width!==512||settings.height!==768||settings.steps!==4||settings.referenceCount!==(entry.phase==='phase2'?1:2)||
      (entry.phase==='phase5'&&source.pose_sha256!==POSE)||(entry.phase==='phase2'&&source.pose_target!==null))throw Error('historical-import:provenance-mismatch');
    const file=await local(`${entry.directory}/${entry.image}`),bytes=await readFile(file),payload=imagePayload(bytes);
    if(bytes.length!==entry.bytes||sha(bytes)!==entry.sha256||bytes.readUInt32BE(16)!==512||bytes.readUInt32BE(20)!==768)throw Error('historical-import:output-integrity');
    const id=`history-${entry.phase}-${entry.variant.toLowerCase()}`,recordedAt=Math.trunc((await stat(metadata.file)).mtimeMs),createdAt=now;
    if(recordedAt<=0||recordedAt>now+300000)throw Error('historical-import:timestamp');
    // Thumbnail generation is an injected, CPU-only local operation; no source is overwritten.
    const thumbnail=await makeThumbnail(bytes);
    const thumb=thumbnailPayload(thumbnail.bytes,{id,width:thumbnail.width,height:thumbnail.height,createdAt});
    const record={schemaVersion:4,recordType:'historical-import',importState:'staging',deviceUid:PC_DEVICE_UID,model:settings.model,seed:settings.seed,width:512,height:768,createdAt,importedAt:now,
      result:{...payload.result,localPath:file,settings},
      provenance:{phase:entry.phase,variant:entry.variant,label:`${entry.phase==='phase2'?'Phase2':'Phase5 P017'} ${entry.variant}`,comparison:entry.comparison,
        metadataPath:metadata.file,metadataSha256:metadata.sha256,manifestSha256:manifest.sha256,recordedAt,recordedAtBasis:'local-result-file-mtime',promptSha256:INTENT,
        composedPromptSha256:entry.phase==='phase5'?source.composed_prompt_sha256:'',
        original:{sha256:ORIGINAL,localPath:originalPath,role:entry.phase==='phase2'?'historical source reference; role unresolved in Phase1':'owner-designated person reference'},
        pose:entry.phase==='phase5'?{sha256:POSE,localPath:posePath,role:'P017 standing side-view outline; pose only'}:null,
        quality:{identity:'UNKNOWN',pose:'UNKNOWN',photorealism:'UNKNOWN',winner:'UNKNOWN'}}};
    prepared.push({id,record,chunks:payload.chunks.map((data,index)=>({index,data})),thumbnail:thumb});
  }
  return prepared;
}

// No transport is constructed here. Paths are relative to the existing private workspace.
// Retry immutable documents exactly; conflicting records/chunks fail closed, never overwrite.
export async function transferHistoricalImports(prepared,{assertApproved,read,create,finish}) {
  if(prepared.length!==4)throw Error('historical-import:catalog-incomplete');
  const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  for(const item of prepared){
    const key=`jobs/${item.id}`,staged={...item.record},ready={...staged,importState:'ready'};
    const immutable=async(relative,value)=>{await assertApproved();const existing=await read(relative);if(existing){if(!equal(existing,value))throw Error('historical-import:conflict');}else await create(relative,value);};
    await assertApproved();const existing=await read(key);
    if(existing){
      // importedAt is the first import attempt, never the retry time.
      staged.importedAt=existing.importedAt;ready.importedAt=existing.importedAt;
      staged.createdAt=existing.createdAt;ready.createdAt=existing.createdAt;
      if(!equal(existing,staged)&&!equal(existing,ready))throw Error('historical-import:conflict');
    }else await create(key,staged);
    for(const chunk of item.chunks)await immutable(`${key}/chunks/${chunk.index}`,chunk);
    await immutable(`thumbs/${item.id}`,{...item.thumbnail,createdAt:staged.createdAt});
    await assertApproved();if(existing?.importState!=='ready')await finish(key,{importState:'ready'});
  }
}
function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}
