import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SEASONS,getSeason,seasonForEpisode,seasonEpisode} from '../web/src/seasons.mjs';

test('season metadata partitions every available and missing library slot exactly once',async()=>{
 const catalogue=JSON.parse(await readFile(new URL('../../../docs/one-piece/evidence/sources/catalog.json',import.meta.url),'utf8'));
 assert.equal(SEASONS.length,20);assert.equal(SEASONS.reduce((n,s)=>n+s.availableCount,0),1084);
 for(let i=0;i<SEASONS.length;i++){assert.equal(SEASONS[i].number,i+1);if(i)assert.equal(SEASONS[i].start,SEASONS[i-1].end+1);}
 for(const row of catalogue.episodes){const season=seasonForEpisode(row.episodeNumber);assert.ok(season);assert.equal(SEASONS.filter(s=>row.episodeNumber>=s.start&&row.episodeNumber<=s.end).length,1);assert.equal(row.id,`one-piece-${String(row.episodeNumber).padStart(4,'0')}`);}
 assert.equal(catalogue.episodes.filter(e=>e.availability==='listed').length,1084);
 assert.deepEqual(getSeason(16).missing,[590]);assert.equal(getSeason(16).availableCount,49);
 assert.equal(getSeason(20).end,1088);assert.equal(getSeason(20).availableEnd,1085);assert.equal(getSeason(20).availableCount,194);
});

test('season boundaries, cross-source episodes and invalid values preserve absolute identity',()=>{
 for(const season of SEASONS){assert.equal(seasonForEpisode(season.start).number,season.number);assert.equal(seasonEpisode(season.start),1);assert.equal(seasonEpisode(season.end),season.end-season.start+1);}
 assert.equal(seasonForEpisode(590).number,16);assert.equal(seasonForEpisode(944).number,20);
 assert.equal(seasonForEpisode(1000).number,20);assert.equal(seasonForEpisode(1001).number,20);
 assert.equal(seasonEpisode(1000),109);assert.equal(seasonEpisode(1001),110);
 for(const invalid of [0,-1,1089,1.5,'nope',Infinity,null,undefined])assert.equal(seasonForEpisode(invalid),null);
 assert.equal(getSeason('20').number,20);assert.equal(getSeason(-1).number,1);
});
