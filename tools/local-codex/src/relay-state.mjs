import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {read,write} from './common.mjs';

const taskId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;

function checkpoint(file) {
  let state;
  try {
    state = read(file);
  } catch (error) {
    if (error.code === 'ENOENT') return {file};
    if (error instanceof SyntaxError) return {file, damaged:true};
    throw error;
  }
  const valid = typeof state?.instanceId === 'string' &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(state.instanceId) &&
    (state.checkpoint === undefined || positiveInteger(state.checkpoint)) &&
    Array.isArray(state.active) && state.active.every(job =>
      taskId(job?.id) && positiveInteger(job.nativeGeneration ?? job.generation) &&
      (job.localId == null || taskId(job.localId)) &&
      (job.localDelivery === undefined || taskId(job.localDelivery?.localId))) &&
    (state.localTasks === undefined || (state.localTasks && typeof state.localTasks === 'object' &&
      !Array.isArray(state.localTasks) && Object.entries(state.localTasks).every(([remote,local]) =>
        taskId(remote) && taskId(local))));
  return valid ? {file, state, revision:state.checkpoint ?? 0} : {file, damaged:true};
}

export function openRelayState(file) {
  const backup = file + '.backup';
  const copies = [checkpoint(file), checkpoint(backup)];
  const [latest, previous] = copies.filter(copy => copy.state).sort((a,b) => b.revision - a.revision);
  if (!latest && copies.some(copy => copy.damaged)) {
    throw Error('No valid relay checkpoint. Preserve both files and restore a verified journal.');
  }
  if (previous && previous.revision === latest.revision &&
      JSON.stringify(previous.state) !== JSON.stringify(latest.state)) {
    throw Error('Relay checkpoints disagree at the same revision.');
  }
  for (const copy of copies.filter(copy => copy.damaged)) {
    fs.renameSync(copy.file, copy.file + '.corrupt-' + randomUUID());
  }

  const {checkpoint:revision = 0, ...state} = latest?.state ?? {instanceId:randomUUID(),active:[]};
  let saved;
  let sequence = revision;
  const persist = () => {
    const content = JSON.stringify(state);
    if (content === saved) return;
    const next = {...state, checkpoint:++sequence};
    // Flush each copy before renaming it. A partial save leaves at least the
    // preceding checkpoint available. Delivery waits for both writes.
    write(backup,next,{durable:true});
    write(file,next,{durable:true});
    saved = content;
  };

  return {state,persist,restoredFromBackup:latest?.file === backup};
}
