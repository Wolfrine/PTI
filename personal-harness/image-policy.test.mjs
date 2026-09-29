import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Load the renderer against the canonical contracts without creating a build output.
const source=readFileSync('personal-app/views.mjs','utf8');
const executable=source.replace("from './core.mjs'",`from '${pathToFileURL(resolve('personal-harness/core.mjs')).href}'`);
const {visual}=await import('data:text/javascript;base64,'+Buffer.from(executable).toString('base64'));
const item={id:'synthetic',title:'Synthetic test only',topic:'Business',source:'Test source'};
const render=(image,enabled=true)=>visual({...item,image},0,{loadImages:enabled});
test('renderer contains no code-drawn news art',()=>{assert.doesNotMatch(source,/<svg|<canvas|export function concept\(/);});
test('legacy concept records render an honest missing state',()=>{const html=render({kind:'concept',url:''});assert.match(html,/Image pending/);assert.doesNotMatch(html,/<img|<svg|<canvas|Concept sketch/);});
test('a missing asset is not labelled generated',()=>{const html=render({kind:'generated',url:''});assert.match(html,/Image pending/);assert.doesNotMatch(html,/Image Gen illustration<\/span>/);});
test('actual generated asset keeps provenance and escaped text',()=>{const html=render({kind:'generated',url:'https://example.com/actual.webp?signature=abc',alt:'A <test> illustration',credit:'OpenAI Image Gen'});assert.match(html,/Image Gen illustration/);assert.match(html,/signature=abc/);assert.match(html,/A &lt;test&gt; illustration/);assert.match(html,/<img/);});
test('original source images remain supported',()=>{const html=render({kind:'source',url:'https://example.com/source.png'});assert.match(html,/Source image/);assert.doesNotMatch(html,/Image Gen illustration<\/span>/);});
test('turning images off never synthesizes replacements',()=>{const html=render({kind:'generated',url:'https://example.com/actual.webp'},false);assert.match(html,/Images hidden/);assert.doesNotMatch(html,/<img|<svg|<canvas/);});
test('non-HTTPS and executable images do not render',()=>{for(const url of ['javascript:alert(1)','data:image/svg+xml,x','http://example.com/image.png'])assert.doesNotMatch(render({kind:'generated',url}),/<img/);});
