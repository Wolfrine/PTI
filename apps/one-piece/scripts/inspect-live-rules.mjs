// Read-only release preflight. Uses the existing CI identity; never exports it.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const {app}=createRequire(new URL('../../../personal-functions/runtime.cjs',import.meta.url))('./runtime.cjs');
const project='pti-app-2ab59',base='https://firebaserules.googleapis.com/v1';
const token=(await app.options.credential.getAccessToken()).access_token;
async function get(url){
 const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!response.ok){await response.body?.cancel();throw new Error(`Read-only rules preflight HTTP ${response.status}`);}
 const text=await response.text();if(text.length>1024*1024)throw new Error('Rules response exceeds bound');return JSON.parse(text);
}
const release=await get(`${base}/projects/${project}/releases/cloud.firestore`);
const ruleset=await get(`${base}/${release.rulesetName}`);
const files=ruleset.source?.files;if(files?.length!==1)throw new Error('Unexpected multi-file rules; review required');
const sourceHash=createHash('sha256').update(files[0].content).digest('hex');
const reviewedHash=process.env.APPROVED_PREVIOUS_RULES_FILE
 ?createHash('sha256').update(await readFile(process.env.APPROVED_PREVIOUS_RULES_FILE)).digest('hex')
 :'4dadb9232ddfa27ca6f09bae844adb8cff3d3a4854a6d034a9f221d1d1525c0b';
// Retain the actual complete-site Hosting predecessor for a Hosting-only rollback.
// Omit deployer identity and all configuration; this remains a read-only preflight.
const channel=await get(`https://firebasehosting.googleapis.com/v1beta1/projects/${project}/sites/${project}/channels/live`);
const hostingRelease={name:channel.release?.name??null,versionName:channel.release?.version?.name??null,releaseTime:channel.release?.releaseTime??null};
if(typeof hostingRelease.versionName!=='string'||!new RegExp(`^(?:projects/[A-Za-z0-9-]+/)?sites/${project}/versions/[A-Za-z0-9-]+$`).test(hostingRelease.versionName))throw new Error('No verified default Hosting predecessor');
const report={kind:'read-only-one-piece-rules-preflight',project,checkedAt:new Date().toISOString(),rulesetName:release.rulesetName,sourceHash,
 hostingRelease,
 matchesReviewedBase:sourceHash===reviewedHash,
 databaseDataRead:false,writesPerformed:false};
console.log(JSON.stringify(report,null,2));
if(!report.matchesReviewedBase)process.exitCode=2;
