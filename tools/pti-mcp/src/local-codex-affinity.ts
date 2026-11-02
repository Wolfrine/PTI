import {digest} from './auth-store.js';
import {resourcePath} from './local-codex-admission.js';

// One owner-scoped document per physical project/checkout and explicit module.
// Task records retain the audit; this pointer never stores conversation text.
export type ChatAffinity = {
  id:string;moduleKey:string;projectPath:string;resourcePath:string;
  revision:number;lastTaskId:string;updatedAt:number;threadId?:string;
};
export type ChatRouting = {
  affinity_id:string;module_key:string;selection:'new'|'affinity'|'explicit'|'rotate';
  previous_thread_id?:string;reason?:string;
};
export function affinityIdentity(target:{path:string;resourcePath?:string},moduleKey:string) {
  const projectPath=resourcePath(target.path),checkout=resourcePath(target.resourcePath||target.path);
  return {id:digest(JSON.stringify([projectPath,checkout,moduleKey])),moduleKey,projectPath,resourcePath:checkout};
}
export function affinityWorker(version:string) {
  const [major,minor,patch=0]=version.split('.').map(Number);
  return major>0||minor>4||minor===4&&patch>=4;
}
