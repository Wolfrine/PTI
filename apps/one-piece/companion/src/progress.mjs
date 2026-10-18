import { randomUUID, createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { canonicalEpisodeId } from './sources/archive.mjs';
import { AccessError } from './auth.mjs';

export async function atomicJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    try { await handle.writeFile(JSON.stringify(data)); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, file);
  }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}
const safeUid = uid => typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid);
const reasons = new Set(['heartbeat','pause','seek','restart','ended','transition','mark-watched']);

/** One PC serializes lease generations. Client wall clocks and max(position) never decide ordering. */
export class ProgressStore {
  constructor({ root, catalog, clock = () => Date.now(), leaseMs = 120_000, onRevoke = () => {}, onAuthorityChange = () => {} }) {
    this.root = path.resolve(root); this.catalog = catalog; this.clock = clock; this.leaseMs = leaseMs;
    this.onRevoke = onRevoke; this.onAuthorityChange = onAuthorityChange; this.users = new Map(); this.active = new Set(); this.queue = Promise.resolve();
  }
  async serialized(action) {
    const result = this.queue.then(action); this.queue = result.catch(() => {}); return result;
  }
  async load(uid) {
    if (!safeUid(uid)) throw new AccessError('invalid-profile', 400);
    if (!this.users.has(uid)) {
      let value;
      try { value = JSON.parse(await readFile(this.fileFor(uid), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw new AccessError('progress-unavailable', 503); }
      if (value && (value.version !== 1 || value.uid !== uid || typeof value.progress !== 'object')) throw new AccessError('progress-unavailable', 503);
      this.users.set(uid, value ?? { version:1, uid, generation:0, lease:null, progress:{}, outbox:{} });
    }
    return this.users.get(uid);
  }
  async save(uid, value) {
    await atomicJson(this.fileFor(uid), value);
    this.users.set(uid, value);
  }
  fileFor(uid) { return path.join(this.root, `${createHash('sha256').update(uid).digest('hex')}.json`); }
  episode(episodeId) {
    const number = /^one-piece-(\d{4})$/.exec(episodeId ?? '')?.[1];
    const episode = this.catalog.episodes.find(e => e.episodeNumber === Number(number));
    if (!episode || episode.availability !== 'listed' || canonicalEpisodeId(episode.episodeNumber) !== episodeId) throw new AccessError(Number(number) === 590 ? 'episode-missing' : 'episode-unavailable', 404);
    return episode;
  }
  async claim({ uid, deviceId, destination = 'local', takeover = false }) {
    if (typeof deviceId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(deviceId) || !['local','cast','hdmi'].includes(destination)) throw new AccessError('invalid-session',400);
    return this.serialized(async () => {
      const current = await this.load(uid); const now = this.clock(); const old = current.lease;
      if (old && this.active.has(old.sessionId) && old.expiresAt > now) {
        if (old.deviceId === deviceId && !takeover) return structuredClone(old);
        if (!takeover) { const error = new AccessError('active-session',409); error.detail = { destination: old.destination, updatedAt:old.updatedAt, generation:old.generation }; throw error; }
      }
      const lease = { sessionId:randomUUID(), deviceId, destination, generation:current.generation+1, authorityEpoch:1, revision:0, expiresAt:now+this.leaseMs, updatedAt:now };
      await this.save(uid, {...current,generation:lease.generation,lease});
      if (old) { this.active.delete(old.sessionId); await this.onRevoke(old.sessionId); }
      this.active.add(lease.sessionId); return structuredClone(lease);
    });
  }
  requireLease(state, sessionId) {
    if (!state.lease || state.lease.sessionId !== sessionId || !this.active.has(sessionId) || state.lease.expiresAt <= this.clock()) throw new AccessError('session-replaced-or-expired',409);
    return state.lease;
  }
  async renew(uid, sessionId) {
    return this.serialized(async () => {
      const current = await this.load(uid); const lease = this.requireLease(current,sessionId);
      const next = {...lease, expiresAt:this.clock()+this.leaseMs,updatedAt:this.clock()};
      await this.save(uid,{...current,lease:next}); return structuredClone(next);
    });
  }
  async record(uid, sessionId, event, { durationSeconds, authority = 'local' } = {}) {
    this.episode(event.episodeId);
    if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 4*3600
        || !Number.isFinite(event.positionSeconds) || event.positionSeconds < 0 || event.positionSeconds > durationSeconds+1
        || !Number.isSafeInteger(event.revision) || event.revision < 1 || !Number.isSafeInteger(event.generation) || !Number.isSafeInteger(event.authorityEpoch)
        || !reasons.has(event.reason) || !['local','receiver'].includes(authority)) throw new AccessError('invalid-progress',400);
    return this.serialized(async () => {
      const current = await this.load(uid); const lease = this.requireLease(current,sessionId);
      if (event.generation !== lease.generation || event.authorityEpoch !== lease.authorityEpoch
          || authority !== (lease.destination === 'cast' ? 'receiver' : 'local')) throw new AccessError('stale-progress-authority',409);
      const hash = createHash('sha256').update(JSON.stringify({episodeId:event.episodeId,positionSeconds:event.positionSeconds,reason:event.reason,revision:event.revision,generation:event.generation,authorityEpoch:event.authorityEpoch})).digest('hex');
      if (event.revision === lease.revision && hash === lease.lastEventHash) return {duplicate:true,progress:structuredClone(current.progress[event.episodeId])};
      if (event.revision <= lease.revision) throw new AccessError('stale-progress',409);
      const value = {episodeId:event.episodeId,sessionId,generation:lease.generation,revision:event.revision,
        positionSeconds:Math.min(event.positionSeconds,durationSeconds),durationSeconds,
        watched:event.reason==='mark-watched'||event.reason==='ended'||event.positionSeconds>=durationSeconds-30,
        reason:event.reason,authorityEpoch:lease.authorityEpoch,updatedAt:this.clock()};
      const next = {...current,lease:{...lease,revision:event.revision,lastEventHash:hash,updatedAt:this.clock(),expiresAt:this.clock()+this.leaseMs},
        progress:{...current.progress,[event.episodeId]:value},outbox:{...current.outbox,[event.episodeId]:value},lastEpisodeId:event.episodeId};
      await this.save(uid,next); return {duplicate:false,progress:structuredClone(value)};
    });
  }
  async setDestination(uid,sessionId,destination,{renewAuthority=false}={}) {
    if (!['local','cast','hdmi'].includes(destination)) throw new AccessError('invalid-destination',400);
    return this.serialized(async () => {
      const current=await this.load(uid); const lease=this.requireLease(current,sessionId);
      if (lease.destination === destination && !renewAuthority) return structuredClone(lease);
      const updated={...lease,destination,authorityEpoch:lease.authorityEpoch+1,updatedAt:this.clock()};
      await this.save(uid,{...current,lease:updated});
      await this.onAuthorityChange(sessionId,updated.authorityEpoch);
      return structuredClone(updated);
    });
  }
  async close(uid,sessionId) {
    return this.serialized(async () => {
      const current=await this.load(uid);
      if (current.lease?.sessionId!==sessionId) throw new AccessError('not-your-session',403);
      await this.save(uid,{...current,closedLease:current.lease,lease:null}); this.active.delete(sessionId); await this.onRevoke(sessionId);
    });
  }
  async snapshot(uid,{forSync=false}={}) {
    return this.serialized(async () => {const state=await this.load(uid);const lease=state.lease&&this.active.has(state.lease.sessionId)?state.lease:null;
      return structuredClone({progress:state.progress,lastEpisodeId:state.lastEpisodeId??null,lease,...(forSync?{closedLease:!lease?(state.closedLease??state.lease):null}:{})});});
  }
  async restorePendingProfiles(){
    await mkdir(this.root,{recursive:true,mode:0o700});
    const files=(await readdir(this.root)).filter(name=>/^[a-f0-9]{64}\.json$/.test(name));
    if(files.length>64)throw new AccessError('progress-profile-limit',503);
    for(const name of files){
      const file=path.join(this.root,name),info=await lstat(file);
      if(!info.isFile()||info.isSymbolicLink()||info.size>4*1024*1024)throw new AccessError('progress-unavailable',503);
      const state=JSON.parse(await readFile(file,'utf8'));
      if(!safeUid(state.uid)||this.fileFor(state.uid)!==file)throw new AccessError('progress-unavailable',503);
      await this.load(state.uid);
    }
    return [...this.users.keys()];
  }
  async hydrate(uid, {lease=null,progress={}}={}) {
    return this.serialized(async()=>{
      const state=await this.load(uid);
      if(state.lease&&this.active.has(state.lease.sessionId))return;
      const merged={...state.progress};
      for(const [id,value]of Object.entries(progress)){
        this.episode(id);
        if(value.episodeId!==id||!Number.isFinite(value.positionSeconds)||!Number.isFinite(value.durationSeconds)
          ||value.positionSeconds<0||value.positionSeconds>value.durationSeconds||!Number.isSafeInteger(value.generation)||!Number.isSafeInteger(value.revision))throw new AccessError('invalid-cloud-progress',503);
        const local=merged[id];
        if(!local||value.generation>local.generation||(value.generation===local.generation&&value.authorityEpoch>=local.authorityEpoch&&value.revision>local.revision))merged[id]=value;
      }
      const generation=Math.max(state.generation,Number.isSafeInteger(lease?.generation)?lease.generation:0);
      const latest=Object.values(merged).sort((a,b)=>b.updatedAt-a.updatedAt)[0];
      await this.save(uid,{...state,generation,progress:merged,lastEpisodeId:state.lastEpisodeId??latest?.episodeId});
    });
  }
  async pending(uid) { return this.serialized(async()=>structuredClone((await this.load(uid)).outbox)); }
  async acknowledge(uid,episodeId,generation,revision) {
    return this.serialized(async()=>{const state=await this.load(uid);const value=state.outbox[episodeId];
      if(value?.generation===generation&&value.revision===revision){const outbox={...state.outbox};delete outbox[episodeId];await this.save(uid,{...state,outbox});}
    });
  }
}
