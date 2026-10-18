import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {openRemote, remuxWindow} from './media-probe.mjs';
const runtime = process.env.ONE_PIECE_BROWSER_RUNTIME || 'H:/PTI-OnePiece/pilot/browser-native';
const require = createRequire(`${runtime}/package.json`);
const LibAV = require('@libav.js/variant-webcodecs');
const catalog = JSON.parse(await readFile(new URL('../../../../../docs/one-piece/evidence/sources/catalog.json', import.meta.url), 'utf8'));
const episode = Number(process.argv[2] || 1);
const sample = catalog.episodes.find(e => e.episodeNumber === episode).candidates.find(c => c.role === 'original');
await mkdir(`${runtime}/evidence`, {recursive: true});
const events = [];
const log = (event, data) => {const item = {event, ...data}; events.push(item); console.log(JSON.stringify(item));};
let remote;
try {
  remote = await openRemote({LibAV, url: `http://127.0.0.1:8793/media/${episode}/original`, size: sample.bytes, log});
  for (const start of process.argv.includes('--probe-only') ? [] : [0, 600]) {
    const result = await remuxWindow(remote, {start, seconds: 22, log});
    await writeFile(`${runtime}/window-${episode}-${start}.mp4`, result.mp4);
    await writeFile(`${runtime}/window-${episode}-${start}.ass`, result.ass);
  }
} catch (error) {log('error', {message: error.message, stack: error.stack}); process.exitCode = 1;}
finally {
  await writeFile(`${runtime}/evidence/node-${episode}-${Date.now()}.json`, JSON.stringify({episode, kind: 'Node technical demux test; not browser audiovisual proof', events, metrics: remote?.metrics, memory: process.memoryUsage()}, null, 2));
  remote?.libav.terminate();
}
