import fs from 'node:fs';
import {StringDecoder} from 'node:string_decoder';

const journals = new Map();
const terminal = new Set(['completed', 'interrupted', 'failed']);

// Read only native event envelopes from the path returned by thread/read. An
// independent app-server can export a live desktop turn as interrupted.
function durableTurns(thread) {
  if (!thread.path) return null;
  const file = fs.realpathSync.native(thread.path);
  const stat = fs.statSync(file);
  let state = journals.get(file);
  if (!state || stat.size < state.offset || stat.ino !== state.ino) {
    state = {ino: stat.ino, offset: 0, tail: '', decoder: new StringDecoder('utf8'), threadId: null, activeTurn: null, turns: new Map()};
    journals.set(file, state);
  }
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(65536);
    while (state.offset < stat.size) {
      const count = fs.readSync(fd, buffer, 0, Math.min(buffer.length, stat.size - state.offset), state.offset);
      if (!count) break;
      state.offset += count;
      const lines = (state.tail + state.decoder.write(buffer.subarray(0, count))).split('\n');
      state.tail = lines.pop();
      for (const line of lines) {
        let entry;
        try { entry = JSON.parse(line); } catch { continue; }
        const value = entry.payload || {};
        if (entry.type === 'session_meta') state.threadId = value.id;
        if (entry.type !== 'event_msg') continue;
        if (value.type === 'task_started') state.activeTurn = value.turn_id;
        const id = value.turn_id || state.activeTurn;
        if (!id) continue;
        const turn = state.turns.get(id) || {};
        turn.lastActivityAt = entry.timestamp;
        if (value.type === 'task_started') {
          turn.startedAt = entry.timestamp;
          delete turn.status;
          delete turn.completedAt;
        } else if (['task_complete', 'turn_aborted'].includes(value.type)) {
          turn.status = value.type === 'task_complete' ? 'completed' : 'interrupted';
          turn.completedAt = entry.timestamp;
          if (state.activeTurn === id) state.activeTurn = null;
        }
        state.turns.set(id, turn);
      }
    }
  } finally { fs.closeSync(fd); }
  return state.threadId === thread.id ? state.turns : null;
}

export function observeNativeTurn(thread, turn) {
  let durable;
  try { durable = durableTurns(thread)?.get(turn.id); } catch { /* Missing evidence remains unknown. */ }
  const persisted = terminal.has(turn.status) && (turn.status === 'completed' || turn.completedAt != null) ? turn.status : null;
  const confirmed = persisted || durable?.status;
  return {
    id: turn.id,
    status: confirmed || (turn.status === 'inProgress' ? 'inProgress' : 'unknown'),
    stored_status: turn.status,
    terminal_observed: terminal.has(confirmed),
    observation: durable?.status && (!persisted || persisted === durable.status) ? 'native-terminal-event' : confirmed ? 'persisted-native-turn' : 'stored-history-only',
    ...(persisted && durable?.status && persisted !== durable.status ? {native_terminal_status: durable.status,terminal_conflict: true} : {}),
    live_status_observed: false,
    last_activity_at: durable?.lastActivityAt || null,
    started_at: durable?.startedAt || (turn.startedAt ? new Date(turn.startedAt * 1000).toISOString() : null),
    completed_at: durable?.completedAt || (turn.completedAt ? new Date(turn.completedAt * 1000).toISOString() : null),
  };
}
