import { copyFile, mkdir, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../', import.meta.url));
const assets = ['index.html', 'styles.css', 'app.mjs', 'views.mjs', 'values.mjs', 'history.mjs', 'finance-data.mjs', 'firebase-config.mjs'];
const [flag, target, ...extra] = process.argv.slice(2);
if (flag !== '--out' || !target || extra.length) throw new Error('Usage: node finance-app/scripts/build.mjs --out <dedicated-output-directory>');
const output = path.resolve(target);
const sameDirectory = (left, right) => path.relative(left, right) === '';
const insideSource = path.relative(source, output);
if (insideSource === '' || (!insideSource.startsWith('..') && !path.isAbsolute(insideSource))) {
  throw new Error('Choose a build directory outside Finance source.');
}

if (process.platform === 'win32') {
  const allowed = /^h:\\Workspace\\Builds\\/i;
  if (!allowed.test(output)) throw new Error('Place Finance builds under H:\\Workspace\\Builds.');
  let existing = output;
  for (;;) {
    const actual = await realpath(existing).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (actual) {
      if (!sameDirectory(existing, actual)) throw new Error('Build destination has a redirected ancestor.');
      break;
    }
    const parent = path.dirname(existing);
    if (parent === existing) throw new Error('Finance build volume is unavailable.');
    existing = parent;
  }
}

await mkdir(output, { recursive: true });
if ((await readdir(output, { withFileTypes: true })).some((entry) => !entry.isFile() || !assets.includes(entry.name))) {
  throw new Error('Use a dedicated Finance build directory containing only Finance release assets.');
}

for (const asset of assets) {
  if (!asset.endsWith('.mjs')) continue;
  const checked = spawnSync(process.execPath, ['--check', path.join(source, asset)], { stdio: 'inherit' });
  if (checked.error) throw checked.error;
  if (checked.status !== 0) process.exit(checked.status ?? 1);
}
await Promise.all(assets.map((asset) => copyFile(path.join(source, asset), path.join(output, asset))));
console.log(`Finance build ready: ${output}`);
