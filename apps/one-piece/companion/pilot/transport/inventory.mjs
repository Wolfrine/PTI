import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ARCHIVE_ITEMS, buildCatalog, sanitizeMetadata, sha256 } from '../../src/sources/archive.mjs';
import { createArchiveTransport, USER_AGENT } from '../../src/sources/transport.mjs';

const out = fileURLToPath(new URL('../../../../../docs/one-piece/evidence/sources/', import.meta.url));
await mkdir(out, { recursive: true });
const transport = createArchiveTransport();
const inventories = [];
const requests = [];
for (const itemId of ARCHIVE_ITEMS) {
  const result = await transport.metadata(itemId);
  if (result.status !== 200) throw new Error(`Metadata unavailable: ${itemId} HTTP ${result.status}`);
  const fetchedAt = new Date().toISOString();
  const inventory = sanitizeMetadata(itemId, JSON.parse(result.bytes), fetchedAt, sha256(result.bytes));
  inventories.push(inventory);
  await writeFile(`${out}/${itemId}.json`, `${JSON.stringify(inventory, null, 2)}\n`);
  const { bytes, ...evidence } = result;
  requests.push({ itemId, fetchedAt, ...evidence });
}
const catalog = buildCatalog(inventories);
const serialized = `${JSON.stringify(catalog, null, 2)}\n`;
await writeFile(`${out}/catalog.json`, serialized);
await writeFile(`${out}/inventory-run.json`, `${JSON.stringify({ completedAt: new Date().toISOString(), userAgent: USER_AGENT,
  command: 'node apps/one-piece/companion/pilot/transport/inventory.mjs',
  requests, summary: catalog.summary, catalogSha256: sha256(serialized),
  mediaBytesDownloaded: 0, findingsAre: 'File inventories only; no codec/language/subtitle/playback verification.',
}, null, 2)}\n`);
console.log(JSON.stringify({ out, ...catalog.summary, catalogSha256: sha256(serialized) }, null, 2));
