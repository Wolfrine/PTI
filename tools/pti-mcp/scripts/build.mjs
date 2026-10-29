import {spawnSync} from 'node:child_process';
import {mkdirSync,copyFileSync} from 'node:fs';
const result=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.json'],{stdio:'inherit',windowsHide:true});
if(result.status!==0)process.exit(result.status||1);
mkdirSync('dist/food',{recursive:true});
copyFileSync('../../personal-harness/core.mjs','dist/personal-core.mjs');
copyFileSync('../../food-app/core.mjs','dist/food-core.mjs');
for(const file of ['core.mjs','intelligence.mjs','places.mjs'])copyFileSync(`../../food-app/${file}`,`dist/food/${file}`);
