import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const repo = 'F:/Workspace/Worktrees/PTI/one-piece-family';
const root = 'H:/PTI-OnePiece/home-integration-qa';
const evidence = path.join(repo, 'docs/one-piece/evidence/home-integration');
const files = [
  'pti-app/src/app/components/new-home/new-home.component.ts',
  'pti-app/src/app/components/new-home/new-home.component.html',
  'pti-app/src/app/components/new-home/new-home.component.scss',
  'pti-app/src/styles.scss',
  'pti-app/src/index.html',
  'pti-app/public/assets/styles/pti-home.css',
  'pti-app/public/assets/images/pti-home-lifestyle.webp',
];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceRecords = [];
for (const file of files) {
  const bytes = await fs.readFile(path.join(repo, file));
  const upstream = execFileSync('git', ['show', `origin/main:${file}`], { cwd: repo });
  const textFile = !file.endsWith('.webp');
  const normalized = textFile ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) : bytes;
  const normalizedUpstream = textFile ? Buffer.from(upstream.toString('utf8').replace(/\r\n/g, '\n')) : upstream;
  sourceRecords.push({ path: file, bytes: bytes.length, sha256: sha(bytes), upstreamSha256: sha(upstream), unchangedRawBytesFromUpstream: bytes.equals(upstream), normalizedLfSha256: sha(normalized), upstreamNormalizedLfSha256: sha(normalizedUpstream), unchangedContentFromUpstream: normalized.equals(normalizedUpstream) });
  if (!file.endsWith('/index.html')) {
    const dest = path.join(root, file.replace(/^pti-app\//, ''));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, bytes);
  }
}
const index = await fs.readFile(path.join(repo, 'pti-app/src/index.html'), 'utf8');
await fs.mkdir(path.join(root, 'src'), { recursive: true });
await fs.writeFile(path.join(root, 'src/index.html'), index
  .replace('<title>PtiApp</title>', '<title>PTI Home · isolated integration QA</title>')
  .replace(/\s*<script src="https:\/\/accounts\.google\.com\/gsi\/client" async defer><\/script>/, '')
  .replace(/\s*<link rel="manifest" href="manifest.webmanifest">/, '')
  .replace('<app-root></app-root>', '<app-new-home></app-new-home><output id="qa-router-output" style="display:none"></output>'));
await fs.writeFile(path.join(root, 'src/main.ts'), `import { bootstrapApplication } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { NewHomeComponent } from './app/components/new-home/new-home.component';

// DEV-ONLY isolated bootstrap: exact production component, no Firebase or auth provider.
document.addEventListener('click', recordClick);
document.addEventListener('auxclick', recordClick);
function recordClick(event: MouseEvent) {
  const link = (event.target as Element | null)?.closest('a');
  if (!link || !link.href.includes('/one-piece/')) return;
  queueMicrotask(() => navigator.sendBeacon('/__events', JSON.stringify({ kind: event.type, href: link.getAttribute('href'), ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, button: event.button, defaultPrevented: event.defaultPrevented })));
}
bootstrapApplication(NewHomeComponent, { providers: [{ provide: Router, useValue: {
  navigateByUrl: async (href: string) => {
    const output = document.getElementById('qa-router-output')!;
    output.textContent = 'Router mock received ' + href;
    output.style.display = 'block';
    navigator.sendBeacon('/__events', JSON.stringify({ kind: 'router-mock', href }));
    return true;
  },
} }] }).catch(error => console.error(error));
`);
await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'pti-home-isolated-qa', private: true, type: 'module' }, null, 2));
await fs.copyFile(path.join(repo, 'pti-app/tsconfig.json'), path.join(root, 'tsconfig.json'));
await fs.writeFile(path.join(root, 'tsconfig.app.json'), JSON.stringify({ extends: './tsconfig.json', compilerOptions: { outDir: './out-tsc/app', types: [] }, files: ['src/main.ts'], include: ['src/**/*.d.ts'] }, null, 2));
await fs.writeFile(path.join(root, 'angular.json'), JSON.stringify({ version: 1, projects: { 'home-qa': { projectType: 'application', root: '', sourceRoot: 'src', architect: { build: { builder: '@angular-devkit/build-angular:application', options: { outputPath: 'dist/home-qa', index: 'src/index.html', browser: 'src/main.ts', polyfills: ['zone.js'], tsConfig: 'tsconfig.app.json', inlineStyleLanguage: 'scss', assets: [{ glob: '**/*', input: 'public' }], styles: ['@angular/material/prebuilt-themes/magenta-violet.css', 'src/styles.scss'], optimization: false, sourceMap: false, extractLicenses: false } } } } } }, null, 2));
const deps = path.join(root, 'node_modules');
try { await fs.lstat(deps); } catch { await fs.symlink('H:/PTI-OnePiece/pti-angular-dependencies/node_modules', deps, 'junction'); }
await fs.writeFile(path.join(evidence, 'source-binding.json'), JSON.stringify({ generatedAt: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), upstreamMain: execFileSync('git', ['rev-parse', 'origin/main'], { cwd: repo, encoding: 'utf8' }).trim(), sourceRecords, scope: 'Deterministic One Piece launcher integration into current upstream personal hub; no design acceptance renewal.' }, null, 2));
await fs.writeFile(path.join(evidence, 'upstream-integration.patch'), execFileSync('git', ['diff', 'origin/main', '--', ...files], { cwd: repo }));
console.log(JSON.stringify({ root, sourceRecords: sourceRecords.length, unchangedUpstreamContent: sourceRecords.filter(r => r.unchangedContentFromUpstream).length }));
