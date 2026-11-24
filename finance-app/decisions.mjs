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
 return hero+snapshot+panel('Latest from the Finance project',cards(published(m),m.now,3),'publication-panel')+'<div class="decision-grid">'+panel('What needs attention',priorities(m))+panel('Actual bank cash movement',statementPanel(m))+'</div><div class="decision-grid">'+panel('Where to look for savings',ranks)+panel('Goals and next bills',plan)+'</div>'+note('Only the connected household evidence is shown; other accounts, investments and credit cards may be missing. '+(!m.ctx?'Planning connection is unavailable.':'Planning assumptions are separate from verified money movements.'));
}

const safe=(v,f='Not available')=>typeof v==='string'&&v.trim()?e(v):f;
function published(m){
 const docs=(Array.isArray(m.ctx?.publications)?m.ctx.publications:[]).filter(x=>x&&typeof x.id==='string'&&typeof x.title==='string'&&typeof x.summary==='string');
 const superseded=new Set(docs.map(x=>x.supersedes).filter(Boolean));return docs.filter(x=>!superseded.has(x.id));
}
const url=(p,month)=>href('library',month)+'&doc='+encodeURIComponent(p.id);
function cards(items,month,limit=10){
 if(!items.length)return '<div class="empty"><p><strong>No confirmed publication yet.</strong></p><p>We prepare reports and decisions in this Finance project and publish them here after reviewing the evidence.</p></div>';
 return '<div class="publication-list">'+items.slice(0,limit).map(p=>'<article class="publication-card"><div class="publication-meta"><span>'+safe(pretty(p.kind))+'</span><span>'+safe(pretty(p.status))+' · '+e(date(p.asOf))+'</span></div><h3><a href="'+url(p,month)+'">'+e(p.title)+'</a></h3><p>'+e(p.summary)+'</p><a class="text-link" href="'+url(p,month)+'">Read record ↗</a></article>').join('')+'</div>';
}
function readOnlyDecisions(m){
 const p=m.p,rows=[];
 for(const g of (Array.isArray(p.goals)?p.goals:[]))rows.push('<article class="read-only-record"><strong>'+safe(g.title,'Goal')+'</strong><p>'+e(money(g.savedPaisa))+' saved toward '+e(money(g.targetPaisa))+' · due '+e(date(g.due))+'</p></article>');
 for(const b of (Array.isArray(p.bills)?p.bills:[]))rows.push('<article class="read-only-record"><strong>'+safe(b.title,'Payment')+'</strong><p>'+e(money(b.amountPaisa))+' · '+e(date(b.due))+' · '+safe(pretty(b.state))+'</p></article>');
 for(const v of (Array.isArray(p.scenarios)?p.scenarios:[]))rows.push('<article class="read-only-record"><strong>'+safe(v.title,'Decision')+'</strong><p>'+e(money(v.pricePaisa))+' · '+safe(pretty(v.state))+'</p></article>');
 return '<p class="decision-intro">We examine financial decisions, plans and goals in this project. PTI Finance is the permanent, read-only record.</p>'+
 panel('Published decisions and plans',cards(published(m).filter(v=>['decision','plan','tracking'].includes(v.kind)),m.now,30))+
 panel('Previously recorded commitments',rows.join('')||'<p class="muted">No additional commitments have been confirmed in the plan yet. We can discuss and publish them from the Finance project.</p>');
}
function evidence(s){
 if(s.type==='ledger_month')return '<a class="text-link" href="'+href('reports',s.id)+'">'+safe(s.label,'Ledger month')+' · '+e(s.id)+'</a>';
 if(s.type==='statement_window')return '<span>'+safe(s.label,'Statement source')+' · recorded in Finance</span>';
 return '<span>'+safe(s.label,'Finance discussion')+(s.date?' · '+e(date(s.date)):'')+'</span>';
}
function library(route,m){
 const all=published(m),p=route.publication?all.find(v=>v.id===route.publication):null;
 if(route.publication&&!p)return panel('Publication unavailable','<p class="muted">This record is not in the most recent publications; it may have been superseded.</p><a class="text-link" href="'+href('library',m.now)+'">Back to library</a>');
 if(p)return '<p class="publication-return"><a class="text-link" href="'+href('library',m.now)+'">All publications ↗</a></p>'+
 '<article class="surface publication-document"><span class="publication-type">'+safe(pretty(p.kind))+' · '+safe(pretty(p.status))+'</span><h2>'+e(p.title)+'</h2>'+
 '<p class="muted">As of '+e(date(p.asOf))+' · Published '+e(date(p.publishedAt,true))+'</p><p class="publication-summary">'+e(p.summary)+'</p>'+
 (Array.isArray(p.points)?p.points:[]).map(x=>'<section class="publication-section"><h3>'+safe(x.heading,'Finding')+'</h3><p>'+safe(x.text,'No details recorded.')+'</p></section>').join('')+
 '<section class="publication-evidence"><h3>Source and provenance</h3><ul>'+(Array.isArray(p.sources)?p.sources:[]).map(s=>'<li>'+evidence(s)+'</li>').join('')+'</ul></section></article>';
 const categories=[['report','Reports'],['decision','Decisions'],['plan','Plans'],['insight','Insights'],['tracking','Tracking']];
 const sections=categories.map(([kind,name])=>{const items=all.filter(p=>p.kind===kind);return items.length?panel(name,cards(items,m.now,40)):'';}).join('');
 return '<p class="decision-intro">A permanent reference of reports, decisions and financial intelligence prepared and published from this Finance project.</p>'+
 (sections||panel('Awaiting the first publication',cards([],m.now)))+
 '<p class="muted decision-note">No financial data entry on this website. Reports are private to your verified PTI account.</p>';
}
export function renderDecisionWorkspace(route,result){
 const m=decisionModel(result);
 return route.view==='library'?library(route,m):route.view==='decisions'?readOnlyDecisions(m):todayPage(m);
}
