import { randomBytes,createHash,timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { atomicJson } from './progress.mjs';
import { AccessError } from './auth.mjs';

/** One explicit local challenge selects a verified owner; anonymous first requests never do. */
export class OwnerBinding {
  constructor({root,clock=()=>Date.now()}={}) {
    if(!path.isAbsolute(root??''))throw new Error('Absolute protected configuration root required');
    this.file=path.join(root,'family-binding.json');this.clock=clock;this.ownerUid=null;this.challenge=null;this.pending=Promise.resolve();
  }
  async initialize() {
    try {
      const value=JSON.parse(await readFile(this.file,'utf8'));
      if(value.version!==1||!/^[A-Za-z0-9_-]{1,128}$/.test(value.ownerUid??''))throw new Error('Invalid immutable family binding');
      this.ownerUid=value.ownerUid;
    } catch(error) {if(error.code!=='ENOENT')throw error;}
    return {setupRequired:!this.ownerUid};
  }
  beginLocalSetup() {
    if(this.ownerUid)throw new AccessError('already-paired',409);
    const code=randomBytes(12).toString('base64url');
    this.challenge={hash:createHash('sha256').update(code).digest(),expiresAt:this.clock()+5*60_000,attempts:0};
    // Bootstrap CLI may show this locally. Never put it in an HTTP response or a URL.
    return {code,expiresAt:this.challenge.expiresAt};
  }
  pair(identity,{code,confirmOwner}={}) {
    const action=this.pending.then(async()=>{
      if(this.ownerUid)throw new AccessError('already-paired',409);
      const challenge=this.challenge;
      if(!challenge||challenge.expiresAt<=this.clock()||challenge.attempts>=5)throw new AccessError('local-setup-expired',403);
      challenge.attempts++;
      if(typeof code!=='string'||code.length>100||confirmOwner!==true||!timingSafeEqual(challenge.hash,createHash('sha256').update(code).digest()))throw new AccessError('invalid-local-setup',403);
      if(!identity?.token||!/^[A-Za-z0-9_-]{1,128}$/.test(identity.uid??''))throw new AccessError('authentication-required');
      await atomicJson(this.file,{version:1,ownerUid:identity.uid,pairedAt:this.clock()});
      this.ownerUid=identity.uid;this.challenge=null;
      return {ownerUid:this.ownerUid,needsWorkspace:true};
    });
    this.pending=action.catch(()=>{});return action;
  }
}
