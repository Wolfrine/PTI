import test from 'node:test';
import assert from 'node:assert/strict';
import { readTheme, applyTheme, THEME_KEY } from '../web/src/theme.mjs';
import { episodeArtwork, heroArtwork, previewVisible, withArtwork, safeArtworkUrl } from '../web/src/artwork.mjs';

test('appearance changes only device storage, theme attributes and the switch, without replacing the player',()=>{
 const saved=new Map(),glyph={},attributes={},button={setAttribute:(k,v)=>attributes[k]=v,querySelector:()=>glyph};
 const document={documentElement:{dataset:{},style:{}},querySelector:()=>({setAttribute(){}}),querySelectorAll:()=>[button]};
 const storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};
 assert.equal(readTheme(storage),'light');
 applyTheme('dark',{document,storage});
 assert.equal(readTheme(storage),'dark');assert.equal(saved.get(THEME_KEY),'dark');
 assert.equal(document.documentElement.dataset.theme,'dark');assert.equal(attributes['aria-label'],'Switch to light theme');assert.equal(glyph.textContent,'☀');
 applyTheme('light',{document,storage});assert.equal(document.documentElement.style.colorScheme,'light');assert.equal(glyph.textContent,'☾');
 assert.equal(readTheme({getItem(){throw Error();}}),'light');
 assert.equal(applyTheme('bad',{document,storage}),'light');
});
test('future previews stay hidden until enabled or reached; missing 590 never gets artwork',()=>{
 const s={profile:{showTitles:false},progress:{},session:null};
 assert.equal(previewVisible(s,2),false);assert.equal(episodeArtwork(s,2),heroArtwork());
 assert.equal(episodeArtwork(s,590),null);assert.equal(episodeArtwork(s,1086),null);
 const advanced={...s,progress:{'one-piece-0500':{episodeId:'one-piece-0500',positionSeconds:10}}};
 assert.equal(previewVisible(advanced,500),true);assert.equal(previewVisible(advanced,501),false);
 assert.equal(previewVisible({...s,profile:{showTitles:true}},1085),true);
 assert.notEqual(episodeArtwork({...s,profile:{showTitles:true}},1001),heroArtwork());
});
test('artwork accepts only the pinned image CDN and metadata cannot invent available episodes',()=>{
 for(const value of ['https://evil.example/x.jpg','http://static.tvmaze.com/uploads/images/medium_landscape/1/1.jpg','javascript:alert(1)','https://static.tvmaze.com@evil.example/uploads/images/medium_landscape/1/1.jpg'])assert.equal(safeArtworkUrl(value),null);
 const catalog={episodes:[{id:'one-piece-0001',episodeNumber:1,availability:'listed'},{id:'one-piece-0590',episodeNumber:590,availability:'missing'}]};
 const merged=withArtwork(catalog);assert.equal(merged.episodes.length,2);assert.ok(merged.episodes[0].title);assert.match(merged.episodes[0].titleProvenance,/tvmaze\.com/);assert.equal(merged.episodes[1].title,undefined);assert.equal(merged.episodes[1].availability,'missing');
});
