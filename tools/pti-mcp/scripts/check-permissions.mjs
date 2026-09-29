import { readFile, appendFile } from 'node:fs/promises';
const repositories = JSON.parse(await readFile(process.argv[2], 'utf8'));
const repository = repositories.find(r => r.name.endsWith('/repositories/firebaseapphosting-images') && r.format === 'DOCKER');
if (!repository) throw new Error('The existing PTI Firebase container repository was not found. No repository was created.');
const match = /^projects\/(pti-app-2ab59)\/locations\/([a-z0-9-]+)\/repositories\/(firebaseapphosting-images)$/.exec(repository.name);
if (!match) throw new Error('Unexpected repository identity.');
const permissions = ['artifactregistry.repositories.uploadArtifacts', 'artifactregistry.repositories.downloadArtifacts', 'artifactregistry.repositories.get'];
const response = await fetch(`https://artifactregistry.googleapis.com/v1/${repository.name}:testIamPermissions`, {
  method: 'POST', headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ permissions }),
});
if (!response.ok) throw new Error(`Repository permission check failed: ${response.status}`);
const allowed = (await response.json()).permissions || [];
const missing = permissions.filter(p => !allowed.includes(p));
console.log(JSON.stringify({ repository: repository.name, allowed, missing }));
if (missing.length) throw new Error(`Grant Artifact Registry Writer to the existing Firebase deployment identity on ${repository.name}. No project-wide administrator role is needed.`);
const host = `${match[2]}-docker.pkg.dev`;
await appendFile(process.env.GITHUB_ENV, `IMAGE_HOST=${host}\nIMAGE_PREFIX=${host}/${match[1]}/${match[3]}\n`);
