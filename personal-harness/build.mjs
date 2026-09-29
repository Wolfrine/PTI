import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const dist=path.join(root,'.personal-dist');await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const f of ['index.html','style.css','boot.mjs','app.mjs','views.mjs','demo.mjs','sw.js','manifest.webmanifest','icon.svg'])await cp(path.join(root,'personal-app',f),path.join(dist,f));
await cp(path.join(root,'personal-harness/core.mjs'),path.join(dist,'core.mjs'));
await cp(path.join(root,'personal-harness/core.mjs'),path.join(root,'personal-functions/core.mjs'));
// Dependency-free PNG generation: same semantic mark as icon.svg; no font assets.
function crc32(buf){let crc=-1;for(const b of buf){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^-1)>>>0;}
function chunk(type,data){const t=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([length,t,data,crc]);}
for(const size of [192,512]){const row=size*4+1,raw=Buffer.alloc(row*size);for(let y=0;y<size;y++){raw[y*row]=0;for(let x=0;x<size;x++){const px=x*192/size,py=y*192/size;let color=[246,244,238];if(px>=72&&px<=122&&py>=72&&py<=122)color=[180,191,163];for(const [a,b]of [[44,122],[72,150]])if(((Math.abs(px-a)<3.5||Math.abs(px-b)<3.5)&&py>=a-3.5&&py<=b+3.5)||((Math.abs(py-a)<3.5||Math.abs(py-b)<3.5)&&px>=a-3.5&&px<=b+3.5))color=[36,41,35];raw.set([...color,255],y*row+1+x*4);}}const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;await writeFile(path.join(dist,`icon-${size}.png`),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}
JSON.parse(await readFile(path.join(dist,'manifest.webmanifest'),'utf8'));
console.log('Built isolated Personal PWA; no existing application output modified.');
await writeFile(path.join(dist,'runtime-status.json'),JSON.stringify({cloudReady:false,reason:'Cloud activation has not been verified.'}));
