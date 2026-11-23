import {build} from 'esbuild';
import path from 'node:path';

const outdir=path.resolve(process.argv[2]);
if(!outdir.startsWith('H:\\Workspace\\Builds\\PTI\\local-codex\\approved-tab-')) throw Error('Use the release build directory on H:.');
await build({entryPoints:['mcp.mjs','native-host.mjs'],outdir,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',target:'node20',
  banner:{js:"import {createRequire as _require} from 'node:module'; const require=_require(import.meta.url);"}});
