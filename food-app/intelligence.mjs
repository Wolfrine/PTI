import {clean, entityId, classifyDish, localContext, mealKey, tasteProfile} from './core.mjs';

export const SIGNALS = ['smoky','spicy','tangy','crispy','soft','rich','lighter','paneer','cheese','noodles','rice','bread'];
export const MOOD_SIGNALS = {Comfort:['soft'],Light:['lighter'],Spicy:['spicy'],Indulgent:['rich'],Familiar:[],Explore:[],Quick:[], 'Proper meal':[]};
const unique = xs => [...new Set(xs)];
const age = (date, now) => Math.max(0,(+new Date(now)-+new Date(date))/86400000);
const tokenRules = {
 smoky:/smok|tandoor|tikka|grill|barbecue|bbq/i, spicy:/spic|chilli|chilly|schezwan|heat|fiery|hot\b/i,
 tangy:/tang|bright|chaat|bhel|lemon|sour|refresh/i, crispy:/crisp|crunch|fried|toast|vada|puri|dosa/i,
 soft:/soft|warm|sooth|dal|gravy|idli|cream/i, rich:/rich|heavy|cheese|cream|butter|makhani|indulgen/i,
 lighter:/light|steamed|idli|soup|salad/i, paneer:/paneer/i, cheese:/cheese/i, noodles:/noodle|hakka/i,
 rice:/rice|biryani|pulao|risotto/i, bread:/naan|roti|bread|paratha|kulcha/i
};
export function foodKnowledge(name) {
 const n=clean(name), classified=classifyDish(n);
 const signals=Object.entries(tokenRules).filter(([,re])=>re.test(n)).map(([s])=>s);
 let role='main',family='other';
 if(/ice cream|gulab|jalebi|rasmalai|cake|brownie|shake|barfi/i.test(n)){role='finish';family='dessert'}
 else if(/naan|roti|chapati|kulcha|paratha|garlic bread/i.test(n)){role='accompaniment';family='bread'}
 else if(/rice|biryani|pulao|noodle|hakka|pasta|pizza|dosa|uttapam|idli|burger|frankie|sandwich|thali|pav bhaji|misal/i.test(n))family='complete';
 else if(/masala|makhani|korma|kadhi|dal|sabzi|chole|rajma|palak paneer/i.test(n))family='curry';
 else if(/tikka|kebab|chaat|bhel|puri|fries|spring roll|vada|chill[iy] paneer|paneer chill[iy]/i.test(n)){role='contrast';family='starter'}
 else if(/dal|paneer|sabzi|chole|rajma|korma|kadhi/i.test(n))family='curry';
 else if(/soup|salad/i.test(n))family='complete';
 else if(/ice cream|gulab|jalebi|rasmalai|cake|brownie|shake|barfi/i.test(n)){role='finish';family='dessert'}
 return {signals,role,family,cuisine:classified.cuisine,vegetarian:classified.vegetarian,basis:'Dish-name interpretation; ingredients and sensory qualities need confirmation.'};
}
export function interpretCraving(text='', controls={}) {
 const raw=clean(text).slice(0,500), low=raw.toLowerCase();
 const avoid=[];let positive=low;
 // Negation has precedence; its scope ends at a clause, conjunction or another intent cue.
 positive=positive.replace(/(?:\bno\b|\bnothing\b|\bwithout\b|\bavoid\b|\bnot\b|\bless\b|\bdon't want\b|\bdo not want\b)\s+([^,.;]+?)(?=\s+(?:but|and|for|with|under|tonight)\b|[,.;]|$)/g,(_,phrase)=>{for(const [s,re]of Object.entries(tokenRules))if(re.test(phrase))avoid.push(s);return ' ';});
 const wants=Object.entries(tokenRules).filter(([,re])=>re.test(positive)).map(([s])=>s);
 for(const s of MOOD_SIGNALS[controls.mood]||[])if(!avoid.includes(s))wants.push(s);
 const dinersMatch=/\b(?:for|serves)\s+(one|two|three|four|[1-6])\b/i.exec(low);
 const diners=dinersMatch?({one:1,two:2,three:3,four:4}[dinersMatch[1]]||+dinersMatch[1]):+controls.diners||1;
 const price=/(?:under|below|budget|up to)\s*(?:₹|rs\.?|inr)?\s*(\d{2,5})/i.exec(low);
 const novelty=/different|bored|new|explor|surprise|twist/i.test(positive)||controls.mood==='Explore';
 const mode=/dine|visit|go out|eat out/i.test(low)?'dine-in':/deliver|order in/i.test(low)?'delivery':controls.mode||'delivery';
 const explicit=unique([...wants,...(controls.wants||[])]);
 const resolved=explicit.filter(x=>!avoid.includes(x)&&!(controls.avoid||[]).includes(x)&&!(controls.removedWants||[]).includes(x));
 const exclusions=unique([...avoid,...(controls.avoid||[])]);
 const understood=[...resolved.map(x=>`Want ${x}`),...exclusions.map(x=>`No ${x} today`),`${diners} diner${diners>1?'s':''}`,mode, ...((price?+price[1]:+controls.budget)>0?[`Budget ₹${price?+price[1]:+controls.budget}`]:[])];
 return {raw,wants:resolved,avoid:exclusions,diners:Math.min(6,Math.max(1,diners)),budget:price?+price[1]:+controls.budget||0,mode,novelty,hunger:/very hungry|starving|big meal/i.test(positive)?'High':controls.hunger||'Regular',mood:controls.mood||'Comfort',otherWants:controls.otherWants||[],understood,
  question:!raw||Object.entries(tokenRules).some(([signal,re])=>['crispy','soft','tangy','smoky'].includes(signal)&&re.test(positive))||(controls.wants||[]).some(x=>['crispy','soft','tangy','smoky'].includes(x))?null:{text:'Which direction sounds better?',options:[{label:'Warm & soft',signal:'soft'},{label:'Crisp & bright',signal:'crispy'}]},
  interpretation:'Food-word interpretation. Edit the cues below if I missed your meaning.'};
}
export function interpretNote(note='') {
 const out=[];
 for(const clause of clean(note).toLowerCase().split(/[,.!;]|\band\b|\bbut\b/)){
  const negative=/too|dislike|hate|avoid|not|less|don't/.test(clause),positive=/love|enjoy|like|perfect|more/.test(clause);
  if(!negative&&!positive)continue;
  for(const[s,re]of Object.entries(tokenRules))if(re.test(clause))out.push({signal:s,stance:negative?'avoid':'like'});
 }
 return out.filter((x,i)=>out.findIndex(y=>y.signal===x.signal&&y.stance===x.stance)===i);
}
export function learnedTaste(orders=[], learning=[], preferences=[], now=new Date().toISOString()) {
 const delivered=orders.filter(o=>o.status==='delivered');
 const observations=[];const byDish=new Map();const evidence=[];
 for(const o of delivered)for(const item of o.items){
  const key=item.dishId,entry=byDish.get(key)||{id:key,name:item.name,count:0,restaurants:new Set(),lastAt:o.receivedAt,knowledge:foodKnowledge(item.name)};
  entry.count++;entry.restaurants.add(o.restaurantId);if(o.receivedAt>entry.lastAt)entry.lastAt=o.receivedAt;byDish.set(key,entry);
 }
 for(const row of learning){
  if(row.eaten!==true||row.reason==='other')continue;
  const item=delivered.find(o=>o.id===row.orderId)?.items.find(i=>i.dishId===row.dishId);
  if(!item)continue;
  const weight=(row.reason==='convenience'?.65:1)*({loved:5,good:2,okay:-1,never:-12}[row.reaction]||0)*Math.max(.35,Math.exp(-age(row.createdAt,now)/365));
  evidence.push({...row,receiptContext:delivered.find(o=>o.id===row.orderId).context,name:item.name,weight,signals:foodKnowledge(item.name).signals});
 }
 for(const s of SIGNALS){
  const receipts=delivered.filter(o=>o.items.some(i=>foodKnowledge(i.name).signals.includes(s))).length;
  const confirmed=evidence.filter(e=>e.signals.includes(s));
  const prefs=preferences.filter(p=>p.signal===s&&p.scope==='always').sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
  const explicit=prefs.at(-1);
  const contextual=preferences.filter(p=>p.signal===s&&p.scope!=='always');
  observations.push({signal:s,receipts,confirmed:confirmed.length,score:confirmed.reduce((n,e)=>n+e.weight,0)+(explicit?.stance==='like'?8:explicit?.stance==='avoid'?-20:0),stance:explicit?.stance||'unknown',basis:explicit?'You confirmed this preference':confirmed.length?`${confirmed.length} dish reaction${confirmed.length>1?'s':''}`:`${receipts} receipts · enjoyment unconfirmed`,contextual});
 }
 return {observations,dishes:[...byDish.values()].map(d=>({...d,restaurants:[...d.restaurants]})),confirmedMeals:unique(evidence.map(e=>e.orderId)).length,evidence,questions:observations.filter(s=>s.receipts>=3&&!s.confirmed&&s.stance==='unknown').sort((a,b)=>b.receipts-a.receipts).slice(0,2).map(s=>({signal:s.signal,text:`You often order ${s.signal} dishes. Is that something you enjoy?`}))};
}
export function dishCandidates(orders=[],research=[],now=new Date().toISOString()){
 const map=new Map();
 for(const o of orders.filter(o=>o.status==='delivered'))for(const item of o.items){
  const id=`${o.restaurantId}__${item.dishId}`;const old=map.get(id);
  if(old){old.count++;if(o.receivedAt>old.lastAt)old.lastAt=o.receivedAt;old.orderIds.push(o.id);continue;}
  map.set(id,{id,dishId:item.dishId,name:item.name,restaurantId:o.restaurantId,restaurant:o.restaurantName,outlet:o.outlet,knowledge:foodKnowledge(item.name),vegetarian:item.vegetarian,count:1,lastAt:o.receivedAt,orderIds:[o.id],source:'receipt',sourceUrl:o.source?.url||'',price:null,checkedAt:null,listed:false});
 }
 for(const venue of research){
  if(!venue.id||!venue.url||!venue.checkedAt)continue;
  for(const item of venue.items||[]){
   const dishId=entityId(item.name),id=`${venue.id}__${dishId}`;const prior=map.get(id);
   map.set(id,{...prior,id,dishId,name:item.name,restaurantId:venue.id,restaurant:venue.name,outlet:venue.outlet||'',knowledge:foodKnowledge(item.name),vegetarian:typeof item.vegetarian==='boolean'?item.vegetarian:prior?.vegetarian??null,count:prior?.count||0,lastAt:prior?.lastAt||null,orderIds:prior?.orderIds||[],source:'menu',sourceUrl:venue.url,price:Number.isFinite(item.price)?item.price:null,checkedAt:venue.checkedAt,listed:age(venue.checkedAt,now)<=14,mode:venue.mode||'both',sourceNote:venue.note||''});
  }
 }
 return [...map.values()].map(d=>({...d,price:d.listed?d.price:null}));
}
function compatible(main,side){
 if(main.restaurantId!==side.restaurantId||main.id===side.id)return false;
 if(main.knowledge.family==='curry')return side.knowledge.family==='bread'||/rice/i.test(side.name);
 if(main.knowledge.family==='bread')return side.knowledge.family==='curry';
 return side.knowledge.role==='contrast'&&main.knowledge.cuisine===side.knowledge.cuisine;
}
function dishScore(d,intent,taste,now){
 let score=Math.log2(d.count+1)*.6;
 for(const signal of d.knowledge.signals){
  const p=taste.observations.find(s=>s.signal===signal);
  score+=(p?.score||0)*.5;
  score+=(p?.contextual||[]).filter(p=>p.scope===intent.mood).reduce((n,p)=>n+(p.stance==='like'?4:p.stance==='avoid'?-12:0),0);
  if(intent.wants.includes(signal))score+=4;
  if(intent.otherWants.includes(signal))score+=2;
 }
 const own=taste.evidence.filter(e=>e.dishId===d.dishId&&(e.restaurantId?e.restaurantId===d.restaurantId:true));
 const current=localContext(now);
 score+=own.reduce((n,e)=>n+e.weight*(e.mood===intent.mood?1.3:1)*(e.receiptContext?.dayPart===current.dayPart?1.1:1),0);
 if(d.lastAt&&age(d.lastAt,now)<10)score-=2;
 if(intent.mood==='Quick'&&d.count>0)score+=1.5;
 if(intent.mood==='Proper meal'&&d.knowledge.family==='complete')score+=1;
 if(intent.hunger==='Small'&&d.knowledge.signals.includes('rich'))score-=3;
 if(intent.novelty&&!d.count)score+=2;
 return score;
}
export function mealStudio({orders=[],feedback=[],learning=[],preferences=[],research=[],context={},sessions=[],memories=[],now=new Date().toISOString()}={}){
 const intent=interpretCraving(context.craving,context),taste=learnedTaste(orders,learning,preferences,now);
 const deniedSignals=unique([...intent.avoid,...taste.observations.filter(p=>p.stance==='avoid'||p.contextual.some(q=>q.scope===intent.mood&&q.stance==='avoid')).map(p=>p.signal)]);
 const recentDenied=new Set((context.rejectedDishIds||[]));
 const neverDishes=new Set(learning.filter(l=>l.eaten&&l.reason!=='other'&&l.reaction==='never').map(l=>`${l.restaurantId||''}__${l.dishId}`));
 const blockedBaskets=feedback.filter(f=>f.reaction==='never').map(f=>f.targetKey);
 const available=dishCandidates(orders,research,now).filter(d=>{
  if((context.vegetarian!==false&&d.vegetarian===false)||recentDenied.has(d.dishId)||neverDishes.has(`${d.restaurantId}__${d.dishId}`))return false;
  if(deniedSignals.some(s=>d.knowledge.signals.includes(s)))return false;
  if((intent.mode==='dine-in'&&d.mode==='delivery')||(intent.mode==='delivery'&&d.mode==='dine-in'))return false;
  if(intent.budget&&d.price!==null&&d.price>intent.budget)return false;
  if(context.lighter&&d.knowledge.signals.includes('rich'))return false;
  return true;
 }).map(d=>({...d,score:dishScore(d,intent,taste,now)})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 const recent=orders.filter(o=>o.status==='delivered'&&age(o.receivedAt,now)<=14).sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt)).slice(0,3);
 for(const d of available){const repeats=recent.filter(o=>o.items.some(i=>foodKnowledge(i.name).cuisine===d.knowledge.cuisine)).length;d.score-=repeats*.6;d.recentCuisineOrders=repeats;}
 available.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 const mains=available.filter(d=>!['accompaniment','finish'].includes(d.knowledge.role));
 const compose=(main,mode,anchor=null)=>{
  const sides=available.filter(s=>compatible(main,s));
  const side=sides.find(s=>!intent.budget||main.price===null||s.price===null||main.price+s.price<=intent.budget);
  const useSide=side&&(main.knowledge.family==='curry'||(intent.hunger==='High'||intent.diners>1));
  const items=[{...main,slot:'anchor'},...(useSide?[{...side,slot:side.knowledge.family==='bread'?'accompaniment':'contrast'}]:[])];
  const key=`${main.restaurantId}__${items.map(i=>i.dishId).sort().join('_')}`;
  if(blockedBaskets.includes(key))return null;
  const signals=unique(items.flatMap(i=>i.knowledge.signals));
  const known=items.every(i=>i.count>0),priced=items.every(i=>i.price!==null&&i.listed);
  const total=priced?items.reduce((n,i)=>n+i.price,0):null;
  const shared=anchor?signals.filter(s=>anchor.signals.includes(s)):[];
  const confirmed=items.flatMap(i=>taste.evidence.filter(e=>e.dishId===i.dishId&&(!e.restaurantId||e.restaurantId===i.restaurantId)));
  const companion=intent.otherWants.length?intent.otherWants.filter(s=>signals.includes(s)):[];
  const reasons=[...intent.wants.filter(s=>signals.includes(s)).map(s=>`Keeps the ${s} direction you asked for.`),...(confirmed.length?[`${confirmed.length} confirmed dish reaction${confirmed.length>1?'s':''} informed this meal.`]:known?['Built from dishes in your receipts; enjoyment is still unconfirmed.']:['Uses a sourced menu listing; this is an exploration.']),...(mode==='twist'&&shared.length?[`Preserves ${shared.slice(0,2).join(' + ')} while changing the main dish.`]:[]),...(main.recentCuisineOrders>=2?[`This cuisine appears in ${main.recentCuisineOrders} of your recent receipts; the other directions offer a break.`]:[]),...(intent.diners>1&&companion.length?[`Also includes your companion’s ${companion.join(' + ')} direction.`]:[]),...(useSide?[`Pairs ${main.name} with ${side.name} at the same restaurant.`]:[])];
  const tradeoffs=[...(!priced?['Current basket price needs checking.']:['Listed item prices; taxes, delivery and portion sizes need checking.']),...(!items.every(i=>i.vegetarian===true)?['Confirm vegetarian ingredients.']:[]),...(intent.mode==='dine-in'?['Confirm dine-in service and menu; delivery listings may differ.']:[]),...(intent.diners>1?[`Designed for ${intent.diners} diners; choose quantities after checking portions.`]:[]),...(intent.diners>1&&intent.otherWants.length&&!companion.length?['Your companion’s cue is not covered; swap or add a dish.']:[]),...(main.knowledge.family==='curry'&&!useSide?['An accompaniment is not in the available evidence; add one after checking the menu.']:[]),...(items.some(i=>!i.listed)?['Historical or ageing evidence; check the current menu.']:['Menu listing checked; availability at your address is not confirmed.'])];
  return {id:entityId(mode+key),targetKey:key,mode,restaurant:main.restaurant,restaurantId:main.restaurantId,outlet:main.outlet,items,signals,total,known,reasons,tradeoffs,sourceUrl:main.sourceUrl,checkedAt:main.checkedAt,experiment:mode==='twist'||mode==='explore'?{keep:shared.slice(0,2),change:main.name,question:`Did ${main.name} work for you?`}:null,score:items.reduce((n,i)=>n+i.score,0)};
 };
 const pick=(rows,mode,anchor)=>rows.map(d=>compose(d,mode,anchor)).find(Boolean)||null;
 const familiar=pick([...mains.filter(d=>d.count>0),...mains.filter(d=>!d.count)],'familiar');
 const used=new Set(familiar?.items.map(i=>i.dishId)||[]);
 const twist=pick(mains.filter(d=>!used.has(d.dishId)&&d.knowledge.signals.some(s=>familiar?.signals.includes(s))),'twist',familiar);
 twist?.items.forEach(i=>used.add(i.dishId));
 const remaining=mains.filter(d=>!used.has(d.dishId));
 const explore=pick([...remaining.filter(d=>!d.count),...remaining.filter(d=>d.count)],'explore',familiar);
 const plans=[familiar,twist,explore].filter(Boolean);
 const cues=[];
 const current=localContext(now),matching=orders.filter(o=>o.status==='delivered'&&o.context?.dayPart===current.dayPart);
 if(context.proactive&&matching.length>=4)cues.push({title:`A ${current.dayPart} direction`,text:`${matching.length} receipts arrived around ${current.dayPart}. Use this as a starting point, then tell me what feels right.`});
 const overdue=sessions.filter(s=>s.status==='receipt-linked'&&!learning.some(l=>l.orderId===s.linkedOrderId&&l.eaten));
 if(overdue.length)cues.push({title:'A little feedback goes a long way',text:'A chosen meal has a matching receipt. Tell me which dishes you ate.',orderId:overdue[0].linkedOrderId});
 const ritual=memories.find(m=>m.occasion==='weekend'&&current.dayType==='weekend');if(ritual)cues.push({title:ritual.title,text:ritual.note,orderId:ritual.orderId});
 return {intent,taste,plans,candidates:available,insights:cues,profile:tasteProfile(orders,feedback),note:plans.length?'Food qualities use name hints. Edit your cues and inspect sources.':'No evidence-backed meal fits these exclusions. Try changing one cue; your exclusions remain respected.'};
}
export function swapMeal(plan,candidateId,candidates,intent){
 const candidate=candidates.find(c=>c.id===candidateId);if(!candidate||candidate.restaurantId!==plan.restaurantId)throw new Error('Choose a dish from this restaurant.');
 if(intent.avoid.some(s=>candidate.knowledge.signals.includes(s)))throw new Error('That dish conflicts with your exclusions.');
 const items=[{...candidate,slot:'anchor'},...plan.items.slice(1).filter(i=>compatible(candidate,i))];
 const priced=items.every(i=>i.price!==null&&i.listed),total=priced?items.reduce((n,i)=>n+i.price,0):null;
 if(intent.budget&&total!==null&&total>intent.budget)throw new Error('This combination exceeds your listed-price budget.');
 return {...plan,items,signals:unique(items.flatMap(i=>i.knowledge.signals)),total,targetKey:`${plan.restaurantId}__${items.map(i=>i.dishId).sort().join('_')}`,reasons:[`You chose ${candidate.name} as the anchor.`,...intent.wants.filter(s=>candidate.knowledge.signals.includes(s)).map(s=>`Keeps the ${s} direction you asked for.`)],experiment:{keep:plan.signals.filter(s=>candidate.knowledge.signals.includes(s)),change:candidate.name,question:`Did ${candidate.name} work for you?`}};
}
export function matchingSession(order,sessions){
 const hits=sessions.filter(s=>s.status==='chosen'&&s.restaurantId===order.restaurantId&&s.dishIds?.length&&s.dishIds.every(id=>order.items.some(i=>i.dishId===id))&&+new Date(order.receivedAt)>=+new Date(s.createdAt)&&age(s.createdAt,order.receivedAt)<=2);
 return hits.length===1?hits[0]:null;
}
