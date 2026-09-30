import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, localContext, entityId, tasteProfile, recommend, mealKey } from './core.mjs';
const email = { gmailMessageId:'1a0e212c1662d187', from:'Zomato Order <noreply@zomato.com>', subject:'Your Zomato order from Test Veg & Co', receivedAt:'2026-09-27T18:00:00Z', text:'ORDER ID: 123456789\nDelivered\nTest Veg &amp; Co\nKharghar, Navi Mumbai\n2 X Chesse Garlic Naan\n1 X Paneer Chilly\nTotal paid - ₹1,020.36' };
test('Receipt money, quantities, entities and Indian context remain exact', () => {
 const o = normalizeEmail(email); assert.equal(o.total,1020.36); assert.equal(o.items[0].quantity,2); assert.equal(o.items[0].sourceName,'Chesse Garlic Naan'); assert.equal(o.items[0].dishId,entityId('Cheese Garlic Naan')); assert.equal(o.context.date,'2026-09-27'); assert.equal(o.context.hour,23); assert.equal(o.context.mood,null); assert.equal(o.items[1].cuisine,'Indo-Chinese');
});
test('Missing fields and lookalike senders cannot become orders', () => {
 assert.throws(()=>normalizeEmail({...email,from:'noreply@zomato.com.evil.example'})); assert.throws(()=>normalizeEmail({...email,text:'ORDER ID: 123456789\nDelivered'}));
});
test('IST date rollover and weekend are handled', () => {
 assert.equal(localContext('2026-09-25T23:30:00Z').date,'2026-09-26'); assert.equal(localContext('2026-09-25T23:30:00Z').dayType,'weekend');
});
test('Cancelled orders cannot influence taste; quantity does not multiply affinity', () => {
 const o=normalizeEmail(email), p=tasteProfile([o,{...o,id:'cancel',status:'cancelled'}]); assert.equal(p.orderCount,1); assert.equal(p.dishes[0].count,1);
});
test('Never feedback and budget are hard exclusions', () => {
 const o=normalizeEmail(email); assert.equal(recommend([o],[{targetKey:mealKey(o),reaction:'never'}]).choices.length,0); assert.equal(recommend([o],[],{budget:500}).choices.length,0); assert.equal(recommend([],[]).choices.length,0);
});
