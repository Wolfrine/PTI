import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEmail,entityId} from './core.mjs';
import {dishIdentity,foodKnowledge,interpretCraving,interpretNote,learnedTaste,dishCandidates,mealStudio,swapMeal,restoreMealSession,matchingSession} from './intelligence.mjs';
const now='2026-10-01T12:00:00Z';
const receipt=(id,name,items,receivedAt='2026-09-20T15:00:00Z')=>normalizeEmail({gmailMessageId:'abcdef'+id,from:'noreply@zomato.com',subject:'Your Zomato order from '+name,receivedAt,text:`ORDER ID: ${id}\nDelivered\n${name}\nKharghar\n${items.map(n=>'1 X '+n).join('\n')}\nTotal paid - ₹600`});
const order=receipt('1234567','Veg Table',['Dal Tadka','Roti','Paneer Tikka','Butter Naan']);
const menu=(name,items,checkedAt=now)=>({id:entityId(name),name,url:'https://example.com/menu',checkedAt,items:items.map(([name,price])=>({name,price,vegetarian:true}))});
const research=[menu('Veg Table',[['Dal Tadka',190],['Roti',30],['Paneer Tikka',260],['Butter Naan',65],['Hara Bhara Kebab',220]]),menu('New Table',[['Masala Dosa',150],['Schezwan Noodles',210]])];
const learn=(reaction,extra={})=>({orderId:order.id,dishId:entityId('Paneer Tikka'),restaurantId:order.restaurantId,eaten:true,reason:'taste',reaction,mood:'Comfort',createdAt:now,...extra});
test('Receipt presentation aliases merge without changing stored dish IDs or losing feedback',()=>{
 const a=receipt('11111111','Bhel Table',['Geela Bhel Puri (1 Plate)']);
 const b=receipt('22222222','Bhel Table',['Geela Bhel Puri [1 Plate]']);
 const other=receipt('33333333','Bhel Table',['Geela Bhel Puri (2 Plates)','Schezwan Noodles']);
 const candidates=dishCandidates([a,b,other],[],now),aliases=candidates.find(d=>d.name==='Geela Bhel Puri (1 Plate)');
 assert.equal(candidates.length,3);assert.equal(aliases.count,2);assert.equal(aliases.dishId,a.items[0].dishId);assert(aliases.aliases.includes(b.items[0].dishId));
 assert.notEqual(dishIdentity('Paneer Tikka (150g)'),dishIdentity('Paneer Tikka (300g)'));
 const evidence={orderId:b.id,dishId:b.items[0].dishId,restaurantId:b.restaurantId,eaten:true,reason:'taste',reaction:'loved',mood:'Comfort',createdAt:now};
 const liked=mealStudio({orders:[a,b,other],learning:[evidence],now});assert.equal(liked.plans[0].items[0].identity,dishIdentity(b.items[0].name));
 assert(liked.plans[0].reasons.some(r=>r===`You loved ${b.items[0].name}.`));
 const avoided=mealStudio({orders:[a,b,other],learning:[{...evidence,reaction:'never'}],now});assert(!avoided.candidates.some(d=>d.identity===aliases.identity));
 const rejected=mealStudio({orders:[a,b,other],context:{rejectedDishIds:[b.items[0].dishId]},now});assert(!rejected.candidates.some(d=>d.identity===aliases.identity));
 assert.equal(new Set(liked.plans.map(p=>p.items[0].identity)).size,liked.plans.length);
 const blocked=mealStudio({orders:[a,b,other],feedback:[{reaction:'never',targetKey:`${b.restaurantId}__${b.items[0].dishId}`}],now});
 assert(blocked.plans.every(p=>p.items[0].identity!==aliases.identity));
});
test('Saved direction editing preserves exact dishes and aliases while honoring current constraints',()=>{
 const base={orders:[order],research,now},studio=mealStudio(base),p=studio.plans.find(p=>p.items[0].name==='Dal Tadka');
 const session={id:'saved-direction',status:'chosen',restaurantId:p.restaurantId,dishIds:p.items.map(i=>i.dishId),itemNames:p.items.map(i=>i.name),experiment:null};
 const restored=restoreMealSession(session,studio);assert(restored.plan);assert.deepEqual(restored.plan.items.map(i=>i.dishId),session.dishIds);assert.deepEqual(restored.plan.items.map(i=>i.name),session.itemNames);assert.equal(restored.plan.total,p.total);
 const tight=mealStudio({...base,context:{budget:200}});assert.equal(restoreMealSession(session,tight).plan,null);
 assert.equal(restoreMealSession(session,studio,[{reaction:'never',targetKey:p.targetKey}]).plan,null);
 assert.equal(restoreMealSession({...session,dishIds:[session.dishIds[0],'missing']},studio).plan,null);
 assert.equal(restoreMealSession({...session,status:'receipt-linked'},studio).plan,null);
 const paneer=studio.candidates.find(d=>d.name==='Paneer Tikka'),excluded=mealStudio({...base,context:{craving:'No paneer'}});
 const naan=studio.candidates.find(d=>d.name==='Butter Naan');
 const manual=restoreMealSession({...session,dishIds:[paneer.dishId,naan.dishId],itemNames:[paneer.name,naan.name]},studio);
 assert(manual.plan);assert.deepEqual(manual.plan.items.map(i=>i.name),[paneer.name,naan.name]);
 assert.equal(restoreMealSession({...session,dishIds:[paneer.dishId],itemNames:[paneer.name]},excluded).plan,null);
 const a=receipt('77777777','Bhel Table',['Bhel Puri (1 Plate)']),b=receipt('88888888','Bhel Table',['Bhel Puri [1 Plate]']);
 const aliases=mealStudio({orders:[a,b],now}),aliasSession={...session,restaurantId:b.restaurantId,dishIds:[b.items[0].dishId],itemNames:[b.items[0].name]};
 const exact=restoreMealSession(aliasSession,aliases);assert(exact.plan);assert.equal(exact.plan.items[0].dishId,b.items[0].dishId);assert.equal(exact.plan.items[0].name,b.items[0].name);
 assert.equal(restoreMealSession(aliasSession,aliases,[{reaction:'never',targetKey:`${a.restaurantId}__${a.items[0].dishId}`}]).plan,null);
});
test('Craving parser gives negatives precedence and preserves price, sharing and sensory intent',()=>{
 const p=interpretCraving('Smoky and crispy, no paneer and not too heavy, for two under ₹700, something different',{mood:'Comfort'});
 assert(p.wants.includes('smoky'));assert(p.wants.includes('crispy'));assert(p.avoid.includes('paneer'));assert(p.avoid.includes('rich'));assert(!p.wants.includes('paneer'));assert.equal(p.budget,700);assert.equal(p.diners,2);assert(p.novelty);
 assert(interpretCraving('Hungry but I do not know what I want').question);
 assert(!interpretCraving('Warm and soft, no spicy').question);
 assert(!interpretCraving('',{}).question);
 assert(!interpretCraving('soft',{removedWants:['soft']}).wants.includes('soft'));
});
test('A deliberate twist prefers a different food format with a familiar sensory bridge',()=>{
 const a=receipt('44444444','Chaat Table',['Bhel Puri']);
 const b=receipt('55555555','Chaat Table',['Bhel Puri (Dry)']);
 const c=receipt('66666666','Dosa Table',['Masala Dosa']);
 const learning=[{orderId:a.id,dishId:a.items[0].dishId,restaurantId:a.restaurantId,eaten:true,reason:'taste',reaction:'loved',mood:'Comfort',createdAt:now}];
 const m=mealStudio({orders:[a,b,c],learning,now});
 assert.equal(m.plans[0].items[0].name,'Bhel Puri');
 const twist=m.plans.find(p=>p.mode==='twist');assert.equal(twist.items[0].name,'Masala Dosa');assert(twist.experiment.keep.includes('crispy'));
});
test('A discovery selection focuses the exact dish without bypassing exclusions, sharing or budget',()=>{
 const seed=mealStudio({orders:[order],research,now});const dosa=seed.candidates.find(d=>d.name==='Masala Dosa'),paneer=seed.candidates.find(d=>d.name==='Paneer Tikka');
 const m=mealStudio({orders:[order],research,now,context:{focusDishId:dosa.id,craving:'No paneer, for two under ₹700'}});
 assert.equal(m.focusedPlan.items[0].name,'Masala Dosa');assert.equal(m.intent.diners,2);assert.equal(m.intent.budget,700);assert(m.intent.avoid.includes('paneer'));
 assert(m.focusedPlan.items.every(d=>d.restaurantId===dosa.restaurantId));
 assert.equal(mealStudio({orders:[order],research,now,context:{focusDishId:paneer.id,craving:'No paneer'}}).focusedPlan,null);
 assert.equal(mealStudio({orders:[order],research,now,context:{focusDishId:dosa.id,budget:100}}).focusedPlan,null);
});
test('Note interpretations are proposals with negation precedence',()=>{assert.deepEqual(interpretNote('Loved the spice, but too rich'),[{signal:'spicy',stance:'like'},{signal:'rich',stance:'avoid'}]);assert.deepEqual(interpretNote('Nice evening'),[])});
test('Dish relationships distinguish a curry from grilled starters and desserts',()=>{assert.equal(foodKnowledge('Paneer Tikka Masala').family,'curry');assert.equal(foodKnowledge('Paneer Tikka').family,'starter');assert.equal(foodKnowledge('Ice Cream').role,'finish');assert.equal(foodKnowledge('Chapati').family,'bread')});
test('Shared, unconfirmed and unmatched dishes cannot learn personal enjoyment',()=>{
 for(const l of [learn('loved',{eaten:false}),learn('loved',{reason:'other'}),learn('loved',{dishId:'absent'})])assert.equal(learnedTaste([order],[l],[],now).confirmedMeals,0);
 assert.equal(learnedTaste([order],[],[],now).observations.find(p=>p.signal==='smoky').score,0);
 const personal=learnedTaste([order],[learn('loved')],[],now),convenience=learnedTaste([order],[learn('loved',{reason:'convenience'})],[],now);
 assert(personal.observations.find(p=>p.signal==='smoky').score>convenience.observations.find(p=>p.signal==='smoky').score);
});
test('Explicit dislikes and mood-specific exclusions override repeat clues',()=>{
 const state={orders:[order],research,now};
 for(const scope of ['always','Comfort']){
  const m=mealStudio({...state,context:{mood:'Comfort'},preferences:[{signal:'paneer',stance:'avoid',scope}]});
  assert(m.candidates.every(d=>!d.knowledge.signals.includes('paneer')));
 }
 const m=mealStudio({...state,context:{mood:'Spicy'},preferences:[{signal:'paneer',stance:'avoid',scope:'Comfort'}]});assert(m.candidates.some(d=>d.knowledge.signals.includes('paneer')));
});
test('Confirmed enjoyment changes the next ranking; avoid feedback removes that restaurant dish',()=>{
 const a=mealStudio({orders:[order],research,now,learning:[learn('loved')]}),b=mealStudio({orders:[order],research,now,learning:[learn('never')]});
 assert.equal(a.plans[0].items[0].name,'Paneer Tikka');assert(!b.candidates.some(d=>d.restaurantId===order.restaurantId&&d.dishId===learn('never').dishId));
 const others=mealStudio({orders:[order],research,now,learning:[learn('never',{reason:'other'})]});assert(others.candidates.some(d=>d.dishId===learn('never').dishId));
});
test('Composition stays at one restaurant, pairs curry and bread, and respects listed basket budgets',()=>{
 const m=mealStudio({orders:[order],research,context:{budget:250,mood:'Comfort'},now});assert(m.plans.length);
 const p=m.plans.find(p=>p.items[0].name==='Dal Tadka');assert(p);assert(p.items.some(i=>i.name==='Roti'));assert(p.items.every(i=>i.restaurantId===p.restaurantId));assert.equal(p.total,220);
 assert(m.plans.every(p=>p.total===null||p.total<=250));
});
test('Unknown and ageing prices remain unknown rather than invented budget fits',()=>{
 const stale=menu('Old Place',[['Dal Tadka',80]],'2026-08-01T12:00:00Z');assert.equal(dishCandidates([],[stale],now)[0].price,null);
 const m=mealStudio({orders:[order],context:{budget:100},now});assert(m.plans.every(p=>p.total===null));assert(m.plans.every(p=>p.tradeoffs.includes('Current basket price needs checking.')));
});
test('Temporary rejection changes today while durable memory is untouched',()=>{
 const learning=[learn('loved')],a=mealStudio({orders:[order],research,learning,now}),dish=a.plans[0].items[0].dishId;
 const b=mealStudio({orders:[order],research,learning,context:{rejectedDishIds:[dish]},now});assert(b.candidates.every(d=>d.dishId!==dish));assert.equal(learning[0].reaction,'loved');assert.equal(a.taste.confirmedMeals,b.taste.confirmedMeals);
});
test('A blocked basket falls through to a different valid choice',()=>{
 const a=mealStudio({orders:[order],research,now});const b=mealStudio({orders:[order],research,now,feedback:[{reaction:'never',targetKey:a.plans[0].targetKey}]});assert(b.plans.length);assert(b.plans.every(p=>p.targetKey!==a.plans[0].targetKey));
});
test('Swaps enforce restaurant and exclusions, preserve compatible sides and refresh explanations',()=>{
 const m=mealStudio({orders:[order],research,now}),p=m.plans.find(p=>p.items[0].name==='Dal Tadka'),other=m.candidates.find(d=>d.restaurantId!==p.restaurantId);
 assert.throws(()=>swapMeal(p,other.id,m.candidates,m.intent));
 const anchor=m.candidates.find(d=>d.name==='Paneer Tikka');assert.throws(()=>swapMeal(p,anchor.id,m.candidates,{...m.intent,avoid:['paneer']}));
 const swapped=swapMeal(p,anchor.id,m.candidates,m.intent);assert.equal(swapped.items[0].name,'Paneer Tikka');assert(!swapped.items.some(i=>i.name==='Roti'));assert(swapped.reasons[0].includes('Paneer Tikka'));
});
test('Receipt linkage requires exactly one timely same-restaurant plan with every dish',()=>{
 const s={id:'plan',status:'chosen',restaurantId:order.restaurantId,dishIds:[order.items[0].dishId],createdAt:'2026-09-20T14:00:00Z'};
 assert.equal(matchingSession(order,[s]).id,'plan');assert.equal(matchingSession(order,[s,{...s,id:'other'}]),null);
 for(const change of [{restaurantId:'other'},{dishIds:['absent']},{createdAt:'2026-09-21T00:00:00Z'},{createdAt:'2026-09-01T00:00:00Z'},{status:'dismissed'}])assert.equal(matchingSession(order,[{...s,...change}]),null);
});
