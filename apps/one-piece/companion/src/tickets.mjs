import { randomBytes, createHash } from 'node:crypto';
import { AccessError } from './auth.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
export function encodeResource(value) {
  if (typeof value !== 'string' || value.length > 8192 || !value.startsWith('/') || /[\x00-\x1f\\]/.test(value)) throw new AccessError('invalid-resource',400);
  return Buffer.from(value).toString('base64url');
}
export function decodeResource(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,11000}$/.test(value)) throw new AccessError('media-not-found',404);
  const decoded=Buffer.from(value,'base64url').toString('utf8');
  if (encodeResource(decoded)!==value) throw new AccessError('media-not-found',404);
  return decoded;
}
/** Capability values never persist; only hashes are indexed in memory. */
export class TicketStore {
  constructor({clock=()=>Date.now(),maximumTickets=512,maximumPerSession=8,ttlMs=2*3600_000}={}) {
    this.clock=clock;this.maximumTickets=maximumTickets;this.maximumPerSession=maximumPerSession;this.ttlMs=ttlMs;this.entries=new Map();
  }
  prune() {for(const [hash,value] of this.entries)if(value.expiresAt<=this.clock())this.entries.delete(hash);}
  mint({sessionId,generation,authorityEpoch,uid,episodeId,destination,resources,ttlMs=this.ttlMs}) {
    this.prune();
    if(typeof sessionId!=='string'||!sessionId||!Number.isSafeInteger(generation)||generation<1
      ||!Number.isSafeInteger(authorityEpoch)||authorityEpoch<1||typeof uid!=='string'||!uid
      ||!/^one-piece-\d{4}$/.test(episodeId??'')||!['local','cast','hdmi'].includes(destination)
      ||!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>2*3600_000
      ||!Array.isArray(resources)||resources.length<1||resources.length>1000)throw new AccessError('invalid-media-delegation',400);
    const allowed=new Set(resources.map(value=>{encodeResource(value);return value;}));
    const existing=[...this.entries.values()].filter(x=>x.sessionId===sessionId).length;
    if(this.entries.size>=this.maximumTickets||existing>=this.maximumPerSession)throw new AccessError('media-delegation-limit',429);
    const token=randomBytes(24).toString('base64url');
    this.entries.set(digest(token),{sessionId,generation,authorityEpoch,uid,episodeId,destination,resources:allowed,expiresAt:this.clock()+ttlMs});
    return {token,expiresAt:this.clock()+ttlMs};
  }
  authorize(token,episodeId,resource) {
    if(typeof token!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(token))throw new AccessError('media-not-found',404);
    const entry=this.entries.get(digest(token));
    if(!entry||entry.expiresAt<=this.clock()) {if(entry)this.entries.delete(digest(token));throw new AccessError('media-not-found',404);}
    if(entry.episodeId!==episodeId||!entry.resources.has(resource))throw new AccessError('media-not-found',404);
    return entry;
  }
  extendResources(entry,resources) {
    if(!Array.isArray(resources)||entry.resources.size+resources.length>5000)throw new AccessError('invalid-media-manifest',502);
    // Call only with resources returned by the media coordinator's authenticated URI graph.
    for(const resource of resources){encodeResource(resource);entry.resources.add(resource);}
  }
  revokeSession(sessionId) {for(const [hash,value]of this.entries)if(value.sessionId===sessionId)this.entries.delete(hash);}
  revokeProfile(uid) {for(const [hash,value]of this.entries)if(value.uid===uid)this.entries.delete(hash);}
  revokeEpisode(sessionId,episodeId) {for(const [hash,value]of this.entries)if(value.sessionId===sessionId&&value.episodeId===episodeId)this.entries.delete(hash);}
}
export function mediaUrl(origin,token,episodeId,resource) {
  const base=new URL(origin);
  if(!['https:','http:'].includes(base.protocol)||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('Invalid configured media origin');
  return `${base.origin}/m/${token}/${episodeId}/${encodeResource(resource)}`;
}
