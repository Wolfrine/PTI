import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOrdering } from '../scripts/refresh-artwork.mjs';

const artwork = JSON.parse(await readFile(new URL('../web/artwork.json',import.meta.url),'utf8'));
const catalog = JSON.parse(await readFile(new URL('../../../docs/one-piece/evidence/sources/catalog.json',import.meta.url),'utf8'));

test('artwork joins the existing playable catalogue without promoting missing episode 590', () => {
  const listed = catalog.episodes.filter(e => e.availability === 'listed');
  assert.equal(listed.length,1084);
  assert.deepEqual(Object.keys(artwork.episodes).sort(),listed.map(e => e.id).sort());
  assert.equal(artwork.episodes['one-piece-0590'],undefined);
  for (const e of listed) assert.equal(artwork.episodes[e.id].episodeNumber,e.episodeNumber);
});

test('artwork URLs and attribution are restricted to the inspected provider', () => {
  for (const e of Object.values(artwork.episodes)) {
    assert.match(e.title,/\S/);
    assert.equal(new URL(e.sourceUrl).hostname,'www.tvmaze.com');
    for (const property of ['image','originalImage']) {
      const url = new URL(e[property]);
      assert.equal(url.protocol,'https:');
      assert.equal(url.hostname,'static.tvmaze.com');
      assert.ok(url.pathname.startsWith('/uploads/images/'));
    }
  }
  assert.equal(new URL(artwork.safeHero).hostname,'static.tvmaze.com');
  assert.equal(artwork.attribution.license,'CC BY-SA');
  assert.equal(artwork.attribution.url,artwork.source);
});

test('representative image checks are actual successful JPEG responses', () => {
  assert.deepEqual(artwork.verification.imageChecks.map(e=>e.episodeNumber),[1,500,944,1000,1001,1044,1085]);
  for (const check of artwork.verification.imageChecks) {
    assert.equal(check.status,200);
    assert.equal(check.contentType,'image/jpeg');
    assert.ok(check.bytes>1000 && check.bytes<2000000);
    assert.deepEqual([check.width,check.height],[250,140]);
  }
  assert.equal(artwork.verification.availableCanonicalImages,1084);
});

test('refresh rejects inserted or reordered upstream episodes rather than shifting artwork', () => {
  const counts=[8,44,42,44,37,39,39,38,45,47,49,49,48,49,48,50,48,46,49,47,49,41,48,41,40];
  let absolute=0;
  const rows=counts.flatMap((count,year)=>Array.from({length:count},(_,index)=> {
    absolute++;
    const record=artwork.episodes[`one-piece-${String(absolute).padStart(4,'0')}`];
    return {id:absolute===590?297502:record.sourceId,name:record?.title || 'Missing source episode',type:'regular',season:1999+year,number:index+1};
  }));
  assert.equal(validateOrdering(rows,catalog).normalizedTitleMatches,60);
  const shifted=rows.slice();
  shifted.splice(589,0,{...rows[589],id:99999999});
  assert.throws(()=>validateOrdering(shifted,catalog),/ordering changed/);
  const swapped=rows.slice();
  [swapped[999],swapped[1000]]=[swapped[1000],swapped[999]];
  assert.throws(()=>validateOrdering(swapped,catalog),/ordering changed/);
});
