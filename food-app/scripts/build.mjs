import {cp,mkdir,readFile,rm} from 'node:fs/promises';
const files=['index.html','styles.css','app.mjs','core.mjs','sample.mjs','icon.svg','sw.js','manifest.webmanifest'];
const manifest=JSON.parse(await readFile('food-app/manifest.webmanifest','utf8'));
if(manifest.start_url!=='./'||manifest.scope!=='./')throw new Error('Standalone PWA scope required.');
await rm('.morsel-dist',{recursive:true,force:true});await mkdir('.morsel-dist');
for(const file of files)await cp('food-app/'+file,'.morsel-dist/'+file);
await cp('food-app/assets','.morsel-dist/assets',{recursive:true});
console.log('Standalone Morsel bundle ready. Private data and developer files are excluded.');
