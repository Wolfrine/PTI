const permissions = ['artifactregistry.repositories.create', 'artifactregistry.repositories.list', 'artifactregistry.repositories.uploadArtifacts', 'run.services.create', 'run.services.update', 'run.services.setIamPolicy', 'iam.serviceAccounts.actAs', 'firebaserules.rulesets.create', 'firebaserules.releases.update', 'firebaseauth.configs.update'];
const r = await fetch('https://cloudresourcemanager.googleapis.com/v1/projects/pti-app-2ab59:testIamPermissions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ permissions }) });
if (!r.ok) throw new Error(`Permission check failed: ${r.status}`);
const allowed = (await r.json()).permissions || [];
console.log(JSON.stringify({ allowed, missing: permissions.filter(p => !allowed.includes(p)) }));
