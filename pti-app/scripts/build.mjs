import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {artifactDirectory,ensureArtifactLink,storageEnvironment} from '../../tools/local-codex/src/storage.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
ensureArtifactLink(path.join(root,'dist'),artifactDirectory('Builds','PTI','angular'));
const result=spawnSync(process.execPath,[path.join(root,'node_modules/@angular/cli/bin/ng.js'),'build',...process.argv.slice(2)],{
  cwd:root,stdio:'inherit',env:storageEnvironment()
});
if(result.error)throw result.error;
process.exitCode=result.status??1;
