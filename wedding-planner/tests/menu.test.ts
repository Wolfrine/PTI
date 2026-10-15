import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMenu,splitMenuItems,filterMenu} from '../src/menu';
import {foodArt} from '../src/food-art';
import {menuMarkup} from '../src/presentation';
import {recordFixture} from './fixtures.mjs';

test('explicit separators preserve compound foods and annotation semicolons',()=>{
  assert.deepEqual(splitMenuItems('Idli-vada with sambar, coconut chutney and red chutney; Red- and white-sauce pasta; third item resembling “Shahi Patam” (unreadable; verify)'),['Idli-vada with sambar, coconut chutney and red chutney','Red- and white-sauce pasta','third item resembling “Shahi Patam” (unreadable; verify)']);
});
test('derived sections retain literal uncertain names and canonical source',()=>{
  const source='Main course: Dal fry; dal lapeta (verify exact name)\nOpen question: “Guest tiffin box?” — contents, recipients and need not established';
  const parsed=parseMenu(source);
  assert.equal(parsed.source,source);
  assert.equal(parsed.sections.length,2);
  assert.equal(parsed.sections[0].items[1].text,'dal lapeta (verify exact name)');
  assert.equal(parsed.sections[0].items[1].uncertain,true);
  assert.equal(parsed.sections[1].note,true);
  assert.equal(parsed.sections[1].items[0].text,'“Guest tiffin box?” — contents, recipients and need not established');
});
test('wrapped compounds remain one entry and category search keeps its full section',()=>{
  const parsed=parseMenu('Dessert: Brownie with vanilla ice cream\nand chocolate sauce; moong halwa\nSides: Dry, roasted and fried papad');
  assert.equal(parsed.sections[0].items[0].text,'Brownie with vanilla ice cream\nand chocolate sauce');
  assert.equal(filterMenu(parsed,'dessert')[0].items.length,2);
  assert.equal(filterMenu(parsed,'halwa')[0].items.length,1);
  assert.equal(filterMenu(parsed,'absent').length,0);
});
test('legacy blank-line heading blocks retain their headings and complete compound lines',()=>{
  const source='Welcome drinks\nHot kesar milk; Blue Lagoon\n\nDessert\nBrownie with vanilla ice cream\nand chocolate sauce; moong halwa';
  const parsed=parseMenu(source);
  assert.equal(parsed.source,source);
  assert.deepEqual(parsed.sections.map(section=>section.title),['Welcome drinks','Dessert']);
  assert.deepEqual(parsed.sections[0].items.map(item=>item.text),['Hot kesar milk','Blue Lagoon']);
  assert.equal(parsed.sections[1].items[0].text,'Brownie with vanilla ice cream\nand chocolate sauce');
});
test('uncertain names always use neutral art, without treating the category as dish evidence',()=>{
  assert.equal(foodArt('additional item resembling “Itala” (verify)','South Indian counter').key,'setting');
  assert.equal(foodArt('mystery name').key,'setting');
  assert.equal(foodArt('mystery name','Soups').key,'setting');
  assert.equal(foodArt('Sweet corn','Soups').key,'soup');
  assert.equal(foodArt('Tender coconut','Ice cream').key,'sweets');
  assert.equal(foodArt('dal fry').key,'curry');
  assert.equal(foodArt('Red- and white-sauce pasta').key,'pasta');
});
test('complete documented proposals preserve verification notes and compound offerings',async()=>{
  const fixture=await recordFixture();
  assert.equal(fixture.events.length,10);
  for(const event of fixture.events)assert.equal(parseMenu(event.menuText).source,event.menuText);
  const reception=fixture.events.find(event=>event.id==='reception-undated')!;
  const items=parseMenu(reception.menuText).sections.flatMap(section=>section.items);
  assert.ok(items.some(item=>item.text==='Red- and white-sauce pasta'));
  assert.ok(items.some(item=>item.text.includes('Shahi Patam')&&item.text.includes('unreadable; verify')&&item.uncertain));
  assert.ok(items.some(item=>item.text.includes('moong dal chilla')&&item.text.includes('confirm whether a separate offering')));
  assert.ok(items.some(item=>item.text==='Dry, roasted and fried papad'));
});
test('editable menu names stay escaped and the read-only projection cannot introduce HTML',()=>{
  const html=menuMarkup('Notes: <script>alert(1)</script>; Plain & familiar');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('Plain &amp; familiar'));
  assert.equal(html.includes('<script>'),false);
});
