import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {pageUrl, matchesPage} from './scope.mjs';

const bridge = 'H:/LocalCodexBridge';
const folder = path.join(bridge, 'approved-tab', 'requests');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
function location(id, part) {
  if (!/^[a-f0-9]{32}$/.test(id)) throw Error('Invalid request ID.');
  return path.join(folder, id, part + '.json');
}
function load(id, part) {
  try { return json(location(id, part)); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
// Publish the complete record exactly once, including when two popups respond.
function publish(id, part, value) {
  const file = location(id, part);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temp = file + '.' + randomUUID();
  fs.writeFileSync(temp, JSON.stringify(value), {flag:'wx'});
  try { fs.linkSync(temp, file); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
  finally { fs.unlinkSync(temp); }
  return load(id, part);
}

let ancestors;
export function currentJob() {
  // Only process IDs from our own parent chain are needed to bind this MCP to its relay worker.
  if (!ancestors) {
    const script = '$p=' + process.pid + ';$seen=@{};while($p -gt 0 -and !$seen.ContainsKey($p)){$seen[$p]=$true;Write-Output $p;$proc=Get-CimInstance Win32_Process -Filter ("ProcessId="+$p);if(!$proc){break};$p=[int]$proc.ParentProcessId}';
    const ps = path.join(process.env.SystemRoot || 'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
    const pids = execFileSync(ps, ['-NoProfile','-NonInteractive','-Command',script], {windowsHide:true,encoding:'utf8',timeout:15000});
    ancestors = new Set(pids.trim().split(/\s+/).map(Number));
  }
  const journal = json(path.join(bridge, 'data', 'relay-state.json'));
  for (const claim of journal.active) {
    if (!/^[a-f0-9]{32}$/.test(claim.localId || '') || claim.cancelApplied) continue;
    const job = json(path.join(bridge, 'tasks', claim.localId, 'task.json'));
    if (!ancestors.has(job.workerPid) || !['running','waiting_for_user'].includes(job.status)) continue;
    if (!job.threadId || job.relayGeneration !== (claim.nativeGeneration ?? claim.generation)) continue;
    if (fs.existsSync(path.join(bridge,'tasks',claim.localId,'cancel.json'))) continue;
    return {mode:job.mode, thread:job.threadId, local:claim.localId, remote:claim.id, title:String(job.title || job.project).slice(0,100)};
  }
  throw Error('This tool requires a live, owner-authenticated Local Codex task.');
}

export function requestPage(job, raw, label) {
  const url = pageUrl(raw);
  const linkText = label?.trim() || '';
  if(linkText && job.mode!=='edit') throw Error('Start an authorized edit task to follow a browser link.');
  const id = createHash('sha256').update(JSON.stringify([job.local,url,linkText])).digest('hex').slice(0,32);
  publish(id,'request',{id,job,url,linkText,created:new Date().toISOString()});
  return result(id,job);
}

function view(id) {
  const request = load(id,'request');
  if (!request) throw Error('Unknown browser request.');
  const first = load(id,'source');
  const next = first?.kind === 'follow' ? load(id,'destination') : null;
  const decision = next || first;
  if (decision?.kind === 'declined') return {status:'declined',id};
  if (decision?.kind === 'shared') {
    return {status:'complete',id,source:first.page,...(next ? {link:first.link,destination:next.page} : {})};
  }
  const jobDir = path.join(bridge,'tasks',request.job.local);
  const task = json(path.join(jobDir,'task.json'));
  if (['failed','interrupted'].includes(task.status) || fs.existsSync(path.join(jobDir,'cancel.json'))) return {status:'canceled',id};
  return {status: first ? 'awaiting_destination' : 'awaiting_source',id,
    url:first ? first.link.url : request.url,linkText:first ? '' : request.linkText,
    taskTitle:request.job.title,created:request.created};
}
export function pending() {
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter(id=>/^[a-f0-9]{32}$/.test(id)).flatMap(id=>{
    const state=view(id);
    return state.status.startsWith('awaiting_') ? [state] : [];
  }).sort((a,b)=>b.created.localeCompare(a.created));
}
export function result(id,job) {
  if (load(id,'request')?.job.thread !== job.thread) throw Error('Select the original native conversation for this browser request.');
  return view(id);
}
export async function observe(id,job,waitSeconds) {
  const end=Date.now()+waitSeconds*1000;
  let state=result(id,job);
  while (state.status.startsWith('awaiting_') && Date.now()<end) {
    await delay(Math.min(350, end-Date.now()));
    state=result(id,job);
  }
  return state;
}
export function decide(message) {
  const state=view(message.id);
  if (!state.status.startsWith('awaiting_') || state.status !== message.stage) throw Error('The browser request has already changed.');
  const part=state.status === 'awaiting_source' ? 'source' : 'destination';
  let entry;
  if (message.action==='decline') entry={kind:'declined'};
  else {
    const p=message.page;
    if (!p || !matchesPage(p.url,state.url) || typeof p.title!=='string' ||
        !Array.isArray(p.headings) || p.headings.length>16 || p.headings.some(h=>typeof h!=='string'||h.length>240)) throw Error('This tab does not match the approved request.');
    const page={url:pageUrl(p.url),title:p.title.slice(0,240),headings:p.headings,observedAt:new Date().toISOString()};
    if (state.linkText) {
      const link=message.link;
      if (!link || link.text!==state.linkText || pageUrl(link.url)!==link.url) throw Error('The requested visible link was not available on this page.');
      entry={kind:'follow',page,link:{text:link.text,url:link.url}};
    } else entry={kind:'shared',page};
  }
  entry.decisionId=randomUUID();
  const saved=publish(message.id,part,entry);
  if(saved.decisionId!==entry.decisionId) throw Error('Another popup already handled this request.');
  return view(message.id);
}
