import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { DEFAULT_SETTINGS, selectEdition, canonicalUrl } from './core.mjs';
const require=createRequire(import.meta.url);const {db,now}=require('./runtime.cjs');
const SOURCES=[
 {name:'MIT News · AI',url:'https://news.mit.edu/rss/topic/artificial-intelligence2',topic:'AI & agents',region:'global'},
 {name:'MIT News · Robotics',url:'https://news.mit.edu/rss/topic/robotics',topic:'Robotics',region:'global'},
 {name:'NASA',url:'https://www.nasa.gov/feed/',topic:'Science',region:'global'},
 {name:'ScienceDaily · Robotics',url:'https://www.sciencedaily.com/rss/computers_math/robotics.xml',topic:'Robotics',region:'global'},
 {name:'Indian Express · Technology',url:'https://indianexpress.com/section/technology/feed/',topic:'AI & agents',region:'india'},
 {name:'Indian Express · Science',url:'https://indianexpress.com/section/technology/science/feed/',topic:'Science',region:'india'},
 {name:'Indian Express · Business',url:'https://indianexpress.com/section/business/feed/',topic:'Business',region:'india'},
 {name:'Economic Times · Markets',url:'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',topic:'Business',region:'india'}
];
const text=v=>String(typeof v==='object'?(v?.['#text']||''):v||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const parser=new XMLParser({ignoreAttributes:false,processEntities:true});
async function sourceItems(source){
 const response=await fetch(source.url,{headers:{'User-Agent':'PTI-Personal/0.1 (RSS reader; source links retained)'},signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);
 const raw=await response.text();if(raw.length>3000000)throw new Error('Feed too large.');
 const xml=parser.parse(raw);let items=xml.rss?.channel?.item||xml.feed?.entry||[];if(!Array.isArray(items))items=[items];
 return items.slice(0,40).map(item=>{
 const title=text(item.title);const links=Array.isArray(item.link)?item.link:[item.link];const link=links.find(l=>typeof l==='string'||l?.['@_rel']==='alternate')||links[0];const url=canonicalUrl(typeof link==='string'?link:link?.['@_href']);const publishedAt=new Date(item.pubDate||item.published||item.updated||'invalid');
 if(!title||!url||Number.isNaN(publishedAt.valueOf()))return null;
 if(source.topic==='AI & agents'&&!/\b(ai|artificial intelligence|machine learning|llm|agent|model|neural)\b/i.test(title+' '+text(item.description)))return null;
 // Keep political persuasion/electoral coverage out of this technical/business collector.
 if(/\b(election|vote for|campaign rally|ballot|polling lead)\b/i.test(title))return null;
 const summary=text(item.description||item.summary).slice(0,300)||'Read the linked source for the report. No full-text summary was generated.';
 return{id:createHash('sha256').update(url).digest('hex').slice(0,24),title:title.slice(0,300),url,publishedAt:publishedAt.toISOString(),summary,source:source.name,topic:source.topic,region:source.region,why:`Included in your ${source.topic} allocation. Selected from a ${source.region==='india'?'India-focused':'global'} source; open the report to assess its evidence.`};
 }).filter(Boolean);
}
const settled=await Promise.allSettled(SOURCES.map(sourceItems));const candidates=settled.flatMap(r=>r.status==='fulfilled'?r.value:[]);const failures=settled.flatMap((r,i)=>r.status==='rejected'?[`${SOURCES[i].name}: ${r.reason.message}`]:[]);
console.log(JSON.stringify({sources:SOURCES.length,succeeded:SOURCES.length-failures.length,candidates:candidates.length,sourceFailures:failures}));
const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),runId=`collector-${Date.now()}`;
let catalogPublished=false;
try{const edition=selectEdition(candidates,DEFAULT_SETTINGS);await db.doc('catalog/current').set({...edition,createdAt:now(),sourceFailures:failures});catalogPublished=true;}catch(e){console.error('Shared catalogue retained:',e.message);}
const users=await db.collection('users').get();let published=0,skipped=0,failed=0;
for(const user of users.docs){
 const p=user.data(),root=user.ref;
 if(p.paused){skipped++;continue;}
 const latest=await root.collection('editions').doc(day).get();if(latest.exists&&process.env.FORCE_PERSONAL_RUN!=='true'){skipped++;continue;}
 try{
  const [feedback,recent]=await Promise.all([root.collection('feedback').orderBy('createdAt','desc').limit(200).get(),root.collection('editions').orderBy('createdAt','desc').limit(3).get()]);
  const seen=recent.docs.flatMap(d=>d.data().items.map(x=>x.id));
  const edition=selectEdition(candidates,p.settings,feedback.docs.map(d=>d.data()),seen);
  await db.runTransaction(async tx=>{const current=await tx.get(root),live=current.data();if(!live||live.paused||live.generation!==p.generation||live.preferenceVersion!==p.preferenceVersion)throw new Error('Settings changed, paused, or workspace deleted during the run.');tx.set(root.collection('editions').doc(day),{...edition,createdAt:now(),contextVersion:p.preferenceVersion});tx.set(root.collection('runs').doc(runId),{status:'published',method:'source-ranked',message:`Five items published; ${SOURCES.length-failures.length}/${SOURCES.length} sources responded.`,createdAt:now()});});published++;
 }catch(e){failed++;await db.runTransaction(async tx=>{const current=await tx.get(root);if(current.exists&&current.data().generation===p.generation)tx.set(root.collection('runs').doc(runId),{status:'failed',method:'source-ranked',message:String(e.message).slice(0,350),createdAt:now()});});}
}
console.log(JSON.stringify({catalogPublished,accounts:users.size,published,skipped,failed}));
if(!catalogPublished||failed)process.exitCode=1;
