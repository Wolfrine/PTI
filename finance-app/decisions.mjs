import {calendarPeriod,count,currentDate,currentMonth,date,escape,href,monthLabel,pretty} from './values.mjs';
const e=escape,valid=Number.isSafeInteger;
const fmt=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0});
const exact=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2});
const money=v=>valid(v)?fmt.format(v/100):'Not set', precise=v=>valid(v)?exact.format(v/100):'Unavailable';
const signed=v=>valid(v)?(v>0?'+':'')+money(v):'Unknown';
const dateOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v));
const median=a=>{const v=a.filter(valid).sort((x,y)=>x-y);return v.length?Math.round((v[Math.floor((v.length-1)/2)]+v[Math.floor(v.length/2)])/2):null;};
const keys=['incomePaisa','essentialsPaisa','discretionaryPaisa','commitmentsPaisa','reservePaisa','extraCashPaisa','dueBeforeIncomePaisa'];
const defaults={incomePaisa:null,essentialsPaisa:null,discretionaryPaisa:null,commitmentsPaisa:null,reservePaisa:null,extraCashPaisa:null,dueBeforeIncomePaisa:null,nextIncomeOn:null,goals:[],bills:[],scenarios:[]};
const data=r=>r?.ok?r.data:null;
const link=(view,month,label)=>'<a class="text-link" href="'+href(view,month)+'">'+e(label)+' ↗</a>';
const panel=(title,body,cls='')=>'<section class="surface decision-panel '+cls+'"><h2>'+e(title)+'</h2>'+body+'</section>';
const metric=(name,value,detail='')=>'<div class="decision-metric"><span>'+e(name)+'</span><strong>'+e(value)+'</strong>'+(detail?'<small>'+e(detail)+'</small>':'')+'</div>';
const inputValue=v=>valid(v)?String(v/100):'';
const note=t=>'<p class="decision-note muted">'+e(t)+'</p>';
export function parsePaisa(value){const m=String(value??'').trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);if(!m)return null;const p=Number(m[1])*100+Number((m[2]||'').padEnd(2,'0'));return valid(p)&&p>=0&&p<=100000000000000?p:null;}
function goalMonthly(g){
 const a=currentDate().split('-').map(Number),b=g.due.split('-').map(Number);
 const n=Math.max(1,(b[0]-a[0])*12+b[1]-a[1]+(b[2]>=a[2]?1:0));
 return Math.ceil(Math.max(0,g.targetPaisa-g.savedPaisa)/n);
}
function cashBalances(rows){
 const map=new Map();for(const x of rows){if(x.kind!=='cash'||!valid(x.amountPaisa)||!dateOK(x.asOf)||typeof x.account!=='string')continue;
 const old=map.get(x.account);if(!old||x.asOf>old.asOf||(x.asOf===old.asOf&&x.basis==='closing_balance'))map.set(x.account,x);}
 return [...map.values()];
}
export function decisionModel(r){
 const ctx=data(r?.planning),p=ctx?.profile??defaults,now=currentMonth(),today=currentDate();
 const facts=(ctx?.statementFacts||[]).filter(v=>valid(v.openingPaisa)&&valid(v.closingPaisa)&&v.openingPaisa-v.debitPaisa+v.creditPaisa===v.closingPaisa);
 const months=data(r?.decisionMonths)||[],cash=cashBalances(data(r?.balances)?.list||[]);
 const backed=new Set(facts.filter(f=>f.month<now&&f.from===f.month+'-01'&&f.to===calendarPeriod(f.month).to).map(f=>f.month));
 const samples=months.filter(m=>backed.has(m.month)&&m.counts?.transactions>0&&!m.coverage?.inProgressCount).slice(-6);
 const income=median(samples.map(m=>m.earnedIncomePaisa>0?m.earnedIncomePaisa:null));
 const spending=median(samples.map(m=>valid(m.spendPaisa)?m.spendPaisa:null));
 const repayments=median(samples.map(m=>valid(m.loanRepaymentPaisa)&&valid(m.cardSettlementPaisa)?m.loanRepaymentPaisa+m.cardSettlementPaisa:null));
 const cashTotal=cash.length?cash.reduce((s,v)=>s+v.amountPaisa,0):null,oldest=cash.length?cash.map(v=>v.asOf).sort()[0]:null;
 const fresh=!!oldest&&Math.floor((Date.parse(today)-Date.parse(oldest))/86400000)<=7;
 const ready=keys.every(k=>valid(p[k])),incomeDateValid=dateOK(p.nextIncomeOn)&&p.nextIncomeOn>=today;
 const horizon=incomeDateValid?p.nextIncomeOn:today;
 const dueBills=p.bills.filter(b=>b.state==='open'&&b.due<=horizon);
 const billsDue=dueBills.reduce((s,b)=>s+b.amountPaisa,0);
 const goalFunding=p.goals.reduce((s,g)=>s+goalMonthly(g),0);
 const margin=ready?p.incomePaisa-p.essentialsPaisa-p.discretionaryPaisa-p.commitmentsPaisa-goalFunding:null;
 const liquid=ready&&cashTotal!==null?cashTotal+p.extraCashPaisa:null;
 const cushion=liquid!==null&&incomeDateValid?liquid-p.reservePaisa-p.dueBeforeIncomePaisa-billsDue:null;
 const review=months.reduce((s,m)=>s+(m.counts?.review||0),0);
 const totals={};for(const m of samples)for(const [k,v] of Object.entries(m.categories||{}))if(valid(v)&&v>0)totals[k]=(totals[k]||0)+v;
 const categories=Object.entries(totals).map(([k,v])=>({key:k,mean:Math.round(v/samples.length)})).sort((a,b)=>b.mean-a.mean);
 return {ctx,p,now,today,facts,months,cash,cashTotal,oldest,fresh,ready,incomeDateValid,dueBills,billsDue,goalFunding,margin,cushion,income,spending,repayments,sampleCount:samples.length,review,categories};
}
function statementPanel(m){
 const account=m.facts.at(-1)?.account,rows=m.facts.filter(f=>f.account===account).slice(-7);
 if(!rows.length)return note('No complete bank statement roll-forward has been verified. Classified spending cannot replace total bank movements.');
 const max=Math.max(1,...rows.map(v=>Math.max(v.creditPaisa,v.debitPaisa)));
 return '<div class="statement-caption"><span>Bank credits / debits</span><span>Net cash movement</span></div>'+rows.map(v=>'<div class="statement-row"><a href="'+href('sources',v.month)+'">'+e(monthLabel(v.month,true))+(v.to!==calendarPeriod(v.month).to?'*':'')+'</a><div class="statement-bars"><meter class="fin-in" max="'+max+'" value="'+v.creditPaisa+'" aria-label="Credits '+e(precise(v.creditPaisa))+'"></meter><meter class="fin-out" max="'+max+'" value="'+v.debitPaisa+'" aria-label="Debits '+e(precise(v.debitPaisa))+'"></meter></div><div class="statement-amounts"><span>'+e(money(v.creditPaisa))+'</span><span>'+e(money(v.debitPaisa))+'</span></div><strong class="'+(v.closingPaisa<v.openingPaisa?'fin-negative':'fin-positive')+'">'+e(signed(v.closingPaisa-v.openingPaisa))+'</strong></div>').join('')+note('Verified account '+account+'. * Latest partial period through '+date(rows.at(-1).to)+'. Cash movements include transfers, investments and repayments; not all debits are expenses.');
}
function priorities(m){
 const out=[];
 if(m.ready&&m.cushion!==null&&m.cushion<0)out.push(['Protect the cash reserve','Entered bills and reserve exceed the captured cash plus your other entered cash by '+money(-m.cushion)+'.','decisions','Review your plan',m.now]);
 if(m.cashTotal!==null&&m.repayments!==null&&m.cashTotal<m.repayments)out.push(['Check immediate liquidity','Tracked cash is below the typical recorded monthly repayment amount. Verify other cash and actual payment dates before committing to a new expense.','accounts','Check balances',m.now]);
 if(m.ready&&m.margin<0)out.push(['Close the monthly funding gap','Your expected monthly income is '+money(-m.margin)+' below your entered costs and goal funding.','decisions','Adjust assumptions',m.now]);
 if(!m.ready||!m.incomeDateValid)out.push(['Confirm your financial guardrails','Set expected income, obligations, a minimum cash reserve and next pay date. This is necessary for a meaningful affordability result.','decisions','Complete planning assumptions',m.now]);
 if(m.dueBills.length)out.push(['Upcoming payments','You recorded '+count(m.dueBills.length)+' unpaid bills due by '+date(m.incomeDateValid?m.p.nextIncomeOn:m.today)+'; total '+money(m.billsDue)+'.','decisions','Track bills',m.now]);
 if(m.review){const worst=[...m.months].sort((a,b)=>(b.counts?.review||0)-(a.counts?.review||0))[0];out.push(['Resolve '+count(m.review)+' review items','Unclassified and overlapping payments can change the spending picture. Check the highest-backlog month first.','review','Resolve classifications',worst?.month||m.now]);}
 const flexible=m.categories.find(v=>['dining','shopping','subscriptions','entertainment','travel'].includes(v.key));
 if(flexible)out.push(['Identify a repeatable saving','Captured '+pretty(flexible.key).toLowerCase()+' averages '+money(flexible.mean)+' per backed month. Reducing it by 10% would save about '+money(Math.round(flexible.mean*.1))+' monthly, if maintained.','overview','Inspect spending',m.now]);
 if(!out.length)out.push(['Keep the evidence current','No trustworthy decision should be based on an empty or outdated ledger.','sources','Check sources',m.now]);
 return '<div class="priority-list">'+out.slice(0,5).map((v,i)=>'<article><span class="priority-num">'+String(i+1).padStart(2,'0')+'</span><div><h3>'+e(v[0])+'</h3><p>'+e(v[1])+'</p>'+link(v[2],v[4],v[3])+'</div></article>').join('')+'</div>';
}
function todayPage(m){
 const label=m.cash.length===1?'Tracked account · '+m.cash[0].account:'Tracked cash accounts · '+m.cash.length;
 const hero='<section class="finance-hero"><div><span class="finance-eyebrow">Financial position · '+e(date(m.today))+'</span><p class="hero-amount">'+e(precise(m.cashTotal))+'</p><p>'+e(label)+(m.oldest?' · as of '+e(date(m.oldest)):'')+'</p><small>'+e(m.fresh?'Recent recorded balance, not a live bank connection.':'Balance missing or older than seven days; refresh before a decision.')+'</small></div><div class="hero-right"><span class="finance-eyebrow">Cash above planned reserve</span><strong>'+e(m.cushion===null?'Not established':signed(m.cushion))+'</strong><p>'+e(m.cushion===null?'Confirm your budget and next income date.':m.cushion<0?'Below your own planning guardrails.':'Estimate from your entered assumptions.')+'</p><a href="'+href('decisions',m.now)+'" class="hero-button">Make a financial decision →</a></div></section>';
 const snapshot='<div class="decision-metrics">'+metric('Typical captured take-home',money(m.income),m.sampleCount+' statement-backed complete months · median')+metric('Typical classified spending',money(m.spending),'Does not include unresolved movements')+metric('Typical captured repayments',money(m.repayments),'Loan and card settlements · not due dates')+'</div>';
 const ranks=m.categories.length?'<div class="category-ranks">'+m.categories.slice(0,5).map(v=>'<div><span>'+e(pretty(v.key))+'</span><meter class="fin-out" max="'+m.categories[0].mean+'" value="'+v.mean+'" aria-label="'+e(pretty(v.key)+' '+money(v.mean))+'"></meter><strong>'+e(money(v.mean))+'</strong></div>').join('')+'</div>'+note('Average classified amounts across '+m.sampleCount+' completed statement-backed months. This is not the complete household budget.') :note('Categorized financial evidence is not yet sufficient.');
 const plan=m.ctx?'<div class="goal-summary">'+(m.p.goals.length?m.p.goals.map(g=>'<div><span>'+e(g.title)+'</span><strong>'+e(money(goalMonthly(g)))+' / month</strong></div>').join(''):note('No saved goals. Add a target and date so future purchases can be evaluated against it.'))+(m.p.bills.filter(b=>b.state==='open').slice().sort((a,b)=>a.due.localeCompare(b.due)).slice(0,4).map(b=>'<div><span>'+e(b.title)+'<small>'+e(date(b.due))+'</small></span><strong>'+e(money(b.amountPaisa))+'</strong></div>').join(''))+'</div>'+link('decisions',m.now,'Manage your plan, bills and goals'):note('Planning service unavailable; the existing ledger is still accessible.');
 return hero+snapshot+'<div class="decision-grid">'+panel('What needs attention',priorities(m))+panel('Actual bank cash movement',statementPanel(m))+'</div><div class="decision-grid">'+panel('Where to look for savings',ranks)+panel('Goals and next bills',plan)+'</div>'+note('Only the connected household evidence is shown; other accounts, investments and credit cards may be missing. '+(!m.ctx?'Planning connection is unavailable.':'Planning assumptions are separate from verified money movements.'));
}
function field(name,label,value,help='',placeholder=''){return '<label class="decision-field"><span>'+e(label)+'</span><input name="'+name+'" type="number" min="0" max="1000000000000" step=".01" value="'+e(inputValue(value))+'" placeholder="'+e(placeholder)+'" required inputmode="decimal">'+(help?'<small>'+e(help)+'</small>':'')+'</label>';}
function textField(name,label,placeholder=''){return '<label class="decision-field"><span>'+e(label)+'</span><input name="'+name+'" maxlength="72" required placeholder="'+e(placeholder)+'"></label>';}
function dateField(name,label,value='',required=true){return '<label class="decision-field"><span>'+e(label)+'</span><input name="'+name+'" type="date" value="'+e(value||'')+'" '+(required?'required':'')+'></label>';}
function submit(label){return '<button type="submit" class="button primary">'+e(label)+'</button><p class="form-message" role="status"></p>';}
export function scenarioFromForm(form){
 const f=new FormData(form),pricePaisa=parsePaisa(f.get('price')),upfrontPaisa=parsePaisa(f.get('upfront')),ongoingPaisa=parsePaisa(f.get('ongoing')),termMonths=Number(f.get('term')),rate=Number(f.get('rate'));
 if(pricePaisa===null||pricePaisa<=0||upfrontPaisa===null||upfrontPaisa>pricePaisa||ongoingPaisa===null||!Number.isInteger(termMonths)||termMonths<1||termMonths>360||!Number.isFinite(rate)||rate<0||rate>60)return null;
 return {id:'draft-plan',title:String(f.get('title')||'Purchase'),pricePaisa,upfrontPaisa,ongoingPaisa,termMonths,annualRateBps:Math.round(rate*100),state:'considering'};
}
export function compareScenario(m,s){
 if(!s)return '<div class="decision-empty">Enter the purchase price and financing terms to compare both paths. Your saved plan determines whether either path fits.</div>';
 const principal=s.pricePaisa-s.upfrontPaisa,r=s.annualRateBps/120000,n=s.termMonths;
 const emi=principal===0?0:Math.round(r===0?principal/n:principal*r/(-Math.expm1(-n*Math.log1p(r))));
 const interest=Math.max(0,emi*n-principal);
 const cashNow=m.cushion===null?null:m.cushion-s.pricePaisa,financeNow=m.cushion===null?null:m.cushion-s.upfrontPaisa;
 const cashMargin=m.margin===null?null:m.margin-s.ongoingPaisa,financeMargin=m.margin===null?null:m.margin-emi-s.ongoingPaisa;
 const verdict=(cash,margin)=>cash===null||margin===null?'Plan incomplete':!m.fresh?'Refresh bank balance':cash<0||margin<0?'Exceeds guardrails':'Fits entered plan';
 const row=(k,a,b)=>'<div class="compare-row"><span>'+e(k)+'</span><strong>'+e(a)+'</strong><strong>'+e(b)+'</strong></div>';
 return '<div class="compare-table"><div class="compare-row compare-head"><span>Consequence</span><strong>Pay cash</strong><strong>Finance</strong></div>'+
 row('Cash paid now',money(s.pricePaisa),money(s.upfrontPaisa))+row('Added monthly cost',money(s.ongoingPaisa),money(emi+s.ongoingPaisa))+row('Borrowing interest estimate',money(0),money(interest))+row('Cash above reserve after purchase',signed(cashNow),signed(financeNow))+row('Monthly margin after goals',signed(cashMargin),signed(financeMargin))+row('Planning result',verdict(cashNow,cashMargin),verdict(financeNow,financeMargin))+'</div>'+note('Fixed-rate amortizing EMI approximation. Excludes lender fees, taxes, variable rates and unentered costs. This is not a lender offer or guaranteed affordability.');
}
function updateForm(cls,id,fields,buttons){return '<form class="decision-inline '+cls+'" data-id="'+e(id)+'">'+fields+buttons+'<p class="form-message" role="status"></p></form>';}
const buttons=(label,alt='Remove')=>'<button class="button" type="submit" name="intent" value="update">'+e(label)+'</button><button class="button" type="submit" name="intent" value="remove" formnovalidate>'+e(alt)+'</button>';
function planPage(m){
 if(!m.ctx)return panel('Planning service unavailable',note('Your existing ledger has not been changed. Retry this connection before saving.')+'<button type="button" class="button" data-refresh>Retry</button>');
 const p=m.p;
 const plan='<form id="decision-profile" class="decision-form">'+note('Confirm household-wide amounts. No defaults are assumed; zero is an explicit choice. The historical numbers above are incomplete reference points.')+'<div class="decision-fields">'+
 field('incomePaisa','Expected take-home / month',p.incomePaisa,'Captured median '+money(m.income),inputValue(m.income))+
 field('essentialsPaisa','Essential living costs / month',p.essentialsPaisa,'Rent, groceries, utilities and transport')+
 field('discretionaryPaisa','Flexible spending / month',p.discretionaryPaisa,'Eating out, subscriptions and other optional costs')+
 field('commitmentsPaisa','Debt and fixed obligations / month',p.commitmentsPaisa,'Repayments, card amounts and commitments counted once',inputValue(m.repayments))+
 field('reservePaisa','Minimum liquid reserve',p.reservePaisa,'Do not spend this on purchases')+
 field('extraCashPaisa','Other liquid cash not tracked',p.extraCashPaisa,'Exclude all balances already tracked by PTI')+
 field('dueBeforeIncomePaisa','Other payments before next income',p.dueBeforeIncomePaisa,'Exclude bills listed below to avoid double counting')+
 dateField('nextIncomeOn','Next expected income date',p.nextIncomeOn)+'</div>'+submit('Save guardrails')+'</form>';
 const goalForm='<form id="decision-goal" class="decision-form add-item"><h3>Add a goal</h3><div class="decision-fields">'+textField('title','Goal name','Emergency fund')+field('target','Target amount (₹)',null)+field('saved','Already saved (₹)',0)+dateField('due','Target date')+'</div>'+submit('Add goal')+'</form>';
 const goals=p.goals.map(g=>'<article class="plan-item"><div class="item-head"><div><h3>'+e(g.title)+'</h3><p>'+e(money(g.savedPaisa))+' / '+e(money(g.targetPaisa))+' · '+e(date(g.due))+'</p></div><strong>'+e(money(goalMonthly(g)))+' / mo</strong></div><meter class="fin-in" max="'+g.targetPaisa+'" value="'+Math.min(g.targetPaisa,g.savedPaisa)+'" aria-label="Saved '+e(money(g.savedPaisa))+'"></meter>'+note(money(Math.max(0,g.targetPaisa-g.savedPaisa))+' remaining'+(g.due<m.today&&g.savedPaisa<g.targetPaisa?' · overdue':''))+updateForm('goal-update',g.id,field('saved','Saved so far (₹)',g.savedPaisa),buttons('Update'))+'</article>').join('')||note('No active savings goals.');
 const billForm='<form id="decision-bill" class="decision-form add-item"><h3>Add a payment</h3><div class="decision-fields">'+textField('title','Bill / commitment','Rent or card due')+field('amount','Amount (₹)',null)+dateField('due','Payment due')+'</div>'+submit('Track payment')+'</form>';
 const bills=p.bills.slice().sort((a,b)=>a.due.localeCompare(b.due)).map(b=>'<article class="plan-item"><div class="item-head"><div><h3>'+e(b.title)+'</h3><p>'+e(date(b.due))+' · '+e(b.state==='paid'?'Paid':b.due<m.today?'Overdue':'Upcoming')+'</p></div><strong>'+e(money(b.amountPaisa))+'</strong></div>'+updateForm('bill-update',b.id,'<label class="decision-field"><span>Status</span><select name="state"><option value="open"'+(b.state==='open'?' selected':'')+'>Open</option><option value="paid"'+(b.state==='paid'?' selected':'')+'>Paid</option></select></label>',buttons('Save status'))+'</article>').join('')||note('No confirmed upcoming bills.');
 const simulation='<form id="decision-scenario" class="decision-form">'+note('Compare the same purchase in cash and financed. No payment or borrowing is performed.')+'<div class="decision-fields">'+textField('title','Decision name','Car, trip or home upgrade')+field('price','Purchase price (₹)',null)+field('upfront','Upfront payment if financed (₹)',0)+'<label class="decision-field"><span>Financing term (months)</span><input name="term" type="number" min="1" max="360" value="24" required></label><label class="decision-field"><span>Annual interest rate (%)</span><input name="rate" type="number" min="0" max="60" step=".01" value="10" required></label>'+field('ongoing','Additional monthly cost (₹)',0)+'</div><div id="decision-comparison" aria-live="polite">'+compareScenario(m,null)+'</div>'+submit('Save decision')+'</form>';
 const journal=p.scenarios.map(s=>'<details class="saved-choice"><summary><span><strong>'+e(s.title)+'</strong><small>'+e(pretty(s.state))+'</small></span><strong>'+e(money(s.pricePaisa))+'</strong></summary>'+compareScenario(m,s)+updateForm('scenario-update',s.id,'<label class="decision-field"><span>Decision status</span><select name="state">'+['considering','chosen','declined'].map(v=>'<option value="'+v+'"'+(s.state===v?' selected':'')+'>'+e(pretty(v))+'</option>').join('')+'</select></label>',buttons('Save status'))+'</details>').join('')||note('Saved decisions will be reevaluated against your current financial plan.');
 return '<p class="decision-intro">Compare commitments before money moves. Record your plan and track the choices that matter.</p><div class="decision-metrics">'+metric('Cash above reserve',signed(m.cushion),'After entered near-term bills')+metric('Monthly margin after goals',signed(m.margin),'Based on confirmed assumptions')+metric('Required goal funding',money(m.goalFunding)+'/ month')+'</div>'+
 panel('Compare a purchase or loan',simulation,'decision-simulator')+panel('Financial guardrails',plan)+'<div class="decision-grid">'+panel('Savings goals',goals+goalForm)+panel('Upcoming payments',bills+billForm)+'</div>'+panel('Decision journal',journal)+note('Plans, goals, bills and decisions are private Firestore records. They do not change bank transactions. A marked-paid bill is your planning record, not a payment confirmation.');
}
export function renderDecisionWorkspace(route,result){const model=decisionModel(result);return route.view==='decisions'?planPage(model):todayPage(model);}
function val(f,k){const v=parsePaisa(f.get(k));if(v===null)throw Error('Enter valid non-negative rupee amounts.');return v;}
function safeTitle(f){const t=String(f.get('title')||'').trim();if(!t||t.length>72||/[\p{Cc}\p{Cf}<>@]|\d{6}|https?:/iu.test(t))throw Error('Use a short title without account identifiers or links.');return t;}
export function planningChange(form,submitter,m){
 if(!m.ctx)throw Error('Planning is unavailable. Reload first.');
 const p=structuredClone(m.p),f=new FormData(form),intent=submitter?.value||'update';
 if(form.id==='decision-profile'){for(const k of keys)p[k]=val(f,k);p.nextIncomeOn=String(f.get('nextIncomeOn')||'');if(!dateOK(p.nextIncomeOn)||p.nextIncomeOn<m.today)throw Error('Enter a next income date that is today or later.');return p;}
 if(form.id==='decision-goal'){if(p.goals.length>=12)throw Error('Limit: 12 active goals.');const targetPaisa=val(f,'target'),savedPaisa=val(f,'saved'),due=String(f.get('due'));if(!targetPaisa||!dateOK(due))throw Error('Set a positive target and valid date.');p.goals.push({id:crypto.randomUUID(),title:safeTitle(f),targetPaisa,savedPaisa,due});return p;}
 if(form.id==='decision-bill'){if(p.bills.length>=30)throw Error('Limit: 30 tracked bills.');const amountPaisa=val(f,'amount'),due=String(f.get('due'));if(!amountPaisa||!dateOK(due))throw Error('Set a positive amount and valid date.');p.bills.push({id:crypto.randomUUID(),title:safeTitle(f),amountPaisa,due,state:'open'});return p;}
 if(form.id==='decision-scenario'){if(p.scenarios.length>=12)throw Error('Limit: 12 saved decisions.');const s=scenarioFromForm(form);if(!s)throw Error('Check the purchase price, upfront amount, term and interest rate.');p.scenarios.unshift({...s,id:crypto.randomUUID(),title:safeTitle(f)});return p;}
 for(const [cls,key] of [['goal-update','goals'],['bill-update','bills'],['scenario-update','scenarios']])if(form.classList.contains(cls)){
  const x=p[key].find(v=>v.id===form.dataset.id);if(!x)throw Error('Record changed. Reload before editing.');
  if(intent==='remove')p[key]=p[key].filter(v=>v.id!==x.id);
  else if(key==='goals')x.savedPaisa=val(f,'saved');
  else{const state=String(f.get('state'));if(!(key==='bills'?['open','paid']:['considering','chosen','declined']).includes(state))throw Error('Invalid status.');x.state=state;}
  return p;
 }
 return null;
}
