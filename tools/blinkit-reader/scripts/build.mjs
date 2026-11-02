import {mkdir,copyFile} from 'node:fs/promises';
const target=new URL('../src/canonical/',import.meta.url);await mkdir(target,{recursive:true});
for(const file of ['model.mjs','connector.mjs','payment-match.mjs'])await copyFile(new URL('../../pti-mcp/blinkit/'+file,import.meta.url),new URL(file,target));
await copyFile(new URL('../../../food-app/blinkit-projection.mjs',import.meta.url),new URL('projection.mjs',target));
console.log('Canonical first-party projection/matching modules bundled; no source data.');
