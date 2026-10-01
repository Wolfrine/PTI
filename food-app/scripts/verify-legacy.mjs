import {readFile} from 'node:fs/promises';
const old='https://pti-app-2ab59.web.app/food',next='https://pti-app-2ab59-morsel.web.app/';
for(const url of [old,old+'/']){
 const response=await fetch(url,{redirect:'manual',headers:{'Cache-Control':'no-cache'}});
 if(response.status!==302||response.headers.get('location')!==next)throw new Error('Former Morsel link must redirect to its standalone app.');
}
for(const [url,file] of [[old+'/index.html','legacy-index.html'],[old+'/sw.js','legacy-sw.js']]){
 const response=await fetch(url+'?release='+process.env.GITHUB_SHA,{headers:{'Cache-Control':'no-cache'}});
 if(!response.ok||await response.text()!==await readFile('food-app/'+file,'utf8'))throw new Error('Former app shell migration did not deploy: '+file);
}
console.log('PASS: former food links redirect and the old app shell can retire safely.');
