"""Exercise the real Luminary runtime with isolated Firebase doubles. No production writes."""
import json, os, pathlib, time, re, base64, mimetypes
from datetime import datetime, timezone, timedelta
from playwright.sync_api import sync_playwright

BASE = os.environ.get('LUMINARY_TEST_URL','http://127.0.0.1:8177')
OUT = pathlib.Path(os.environ.get('LUMINARY_EVIDENCE','/mnt/data/luminary-v7-evidence')); OUT.mkdir(parents=True,exist_ok=True)
observations={}
base=datetime(2026,9,24,4,tzinfo=timezone.utc)
texts=['The meeting ended. The room was quiet.', 'I changed rooms and noticed the difference.', 'A pause before starting the next task.', 'Nothing to add. Just a moment.', 'The conversation ended before I expected.']
for i in range(18):
 d=base+timedelta(hours=i*5)
 kind=['mark','voice','text'][i%3]
 observations[f'o{i}']={'sourceType':kind,'rawText':'' if kind=='mark' else texts[i%len(texts)],'clientCreatedAtMs':int(d.timestamp()*1000),'clientCreatedAt':d.isoformat(),'localDate':(d+timedelta(hours=5.5)).strftime('%Y-%m-%d'),'timezone':'Asia/Kolkata','timezoneOffsetMinutes':-330,'uiVersion':'generated-material-v6'}
patterns=[
 {'id':'p1','title':'Transitions recur in the record.','summary':'Several recorded moments mention moving between tasks or environments.','status':'published','supportCount':4,'updatedAtMs':3,'sourceObservationIds':['o1','o3','o4','o8']},
 {'id':'p2','title':'Short marks appear across several days.','summary':'A recurring capture format, not an explanation of the experience.','status':'published','supportCount':4,'updatedAtMs':2,'sourceObservationIds':['o0','o3','o6','o9']},
 {'id':'p3','title':'Source linkage is incomplete.','summary':'This published record includes an unavailable source.','status':'published','supportCount':2,'updatedAtMs':1,'sourceObservationIds':['o3','missing']}
]
APP='export function initializeApp(config){return {config};}'
AUTH='''let cb=null;const user={uid:'test-user',displayName:'Test Observer',email:'observer@example.test'};
export function getAuth(){return {}};export class GoogleAuthProvider{};
export function onAuthStateChanged(a,f){cb=f;queueMicrotask(()=>f(sessionStorage.getItem('mock-auth')?user:null))}
export async function signInWithPopup(){sessionStorage.setItem('mock-auth','1');await cb(user);return {user}};
export async function signOut(){sessionStorage.removeItem('mock-auth');await cb(null)};'''
DB='''const observations=OBS;const patterns=PATS;globalThis.__writes=[];globalThis.__mockObservations=observations;globalThis.__mockPatterns=patterns;
function row(id,data){return {id,data:()=>data,exists:()=>!!data}}
export function getFirestore(){return {}};export async function enableIndexedDbPersistence(){};
export function collection(db,path){return {path}};export function doc(db,path){return {path}};
export async function setDoc(ref,data){globalThis.__writes.push({path:ref.path,data})};
export async function addDoc(ref,data){
 if(ref.path.includes('/observations/')&&globalThis.__failSave){globalThis.__failSave=false;throw Error('Mock save rejected')}
 const id='saved-'+globalThis.__writes.length;globalThis.__writes.push({path:ref.path,data});
 if(ref.path.includes('/observations/'))observations[id]=data;return {id};
}
export function serverTimestamp(){return {mock:true}};export function increment(value){return value};
export function query(ref,...args){return {ref,args}};export function orderBy(key,order){return {type:'order',key,order}};
export function limit(n){return {type:'limit',n}};export function where(key,op,value){return {type:'where',value}};export function documentId(){return '__id__'};
export async function getDoc(ref){const id=ref.path.split('/').at(-1);return row(id,observations[id])};
export async function getDocs(q){
 if(globalThis.__empty)return {docs:[]};
 if(q.ref.path.includes('/patterns/'))return {docs:patterns.map(p=>row(p.id,p))};
 if(q.ref.path.includes('/observations/')){
  const w=q.args.find(x=>x.type==='where'); const l=q.args.find(x=>x.type==='limit');
  let ids=w?w.value.filter(id=>observations[id]):Object.keys(observations).sort((a,b)=>observations[b].clientCreatedAtMs-observations[a].clientCreatedAtMs);
  if(l)ids=ids.slice(0,l.n);return {docs:ids.map(id=>row(id,observations[id]))};
 }return {docs:[]};
}'''.replace('OBS',json.dumps(observations)).replace('PATS',json.dumps(patterns))
SPEECH = """window.SpeechRecognition=class {start(){const r=[{transcript:'A raw voice observation.'}];r.isFinal=true;this.onresult?.({resultIndex:0,results:[r]});}stop(){queueMicrotask(()=>this.onend?.());}};"""

INLINE = os.environ.get('LUMINARY_INLINE') == '1'
ROOT = pathlib.Path(__file__).resolve().parents[1]

def navigate(page, version='motion-archive-v7'):
 if not INLINE:
  page.goto(BASE+'/?ui='+version,wait_until='networkidle')
  return
 def inline_assets(content):
  for asset in (ROOT/'assets').glob('*'):
   mime=mimetypes.guess_type(asset.name)[0] or 'application/octet-stream'
   data='data:'+mime+';base64,'+base64.b64encode(asset.read_bytes()).decode()
   content=content.replace('../assets/'+asset.name,data).replace('./assets/'+asset.name,data)
  return content
 html=(ROOT/'versions'/f'{version}.html').read_text()
 css=(ROOT/'versions'/f'{version}.css').read_text()
 page.set_content(inline_assets('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body>'+html+'</body></html>'))
 versions=(ROOT/'version-loader.js').read_text().split('const LATEST_UI_VERSION')[0].replace('const UI_VERSIONS =','window.__LUMINARY_UI_VERSIONS__ =')
 storage="""const store=new Map();for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{configurable:true,value:{getItem:k=>store.get(key+k)||null,setItem:(k,v)=>store.set(key+k,String(v)),removeItem:k=>store.delete(key+k)}});if(!crypto.randomUUID)crypto.randomUUID=()=>String(Math.random());"""
 page.evaluate(storage)
 page.add_script_tag(content=SPEECH)
 core=(ROOT/'app.js').read_text()
 core=re.sub(r"import[\s\S]*?from [^;]+;",'',core)
 motion=(ROOT/'motion-v7.js').read_text().replace('export function','function')
 mocks='\n'.join([APP,AUTH,DB]).replace('export ','')
 boot=f"window.__LUMINARY_UI_VERSION__='{version}';window.__LUMINARY_LATEST_UI_VERSION__='motion-archive-v7';document.body.dataset.uiVersion='{version}';"
 page.add_script_tag(content=inline_assets('(async()=>{'+storage+versions+boot+mocks+motion+core+'})()'))
 page.wait_for_timeout(60)

results=[]
def check(label, value):
 assert value,label
 results.append(label)

def setup(browser,w=390,h=844,reduced=False,sw=False):
 context=browser.new_context(viewport={'width':w,'height':h},service_workers='allow' if sw else 'block', reduced_motion='reduce' if reduced else 'no-preference')
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script(SPEECH)
 for file,body in [('firebase-app.js',APP),('firebase-auth.js',AUTH),('firebase-firestore.js',DB)]:
  # Playwright supplies both route and request; keep the bound module body separate.
  page.route('https://www.gstatic.com/firebasejs/10.14.1/'+file,lambda route,request,b=body:route.fulfill(status=200,content_type='application/javascript',headers={'access-control-allow-origin':'*'},body=b))
 return context,page,errors

def enter(page,version='motion-archive-v7'):
 navigate(page,version)
 page.wait_for_selector('#signInBtn')
 page.locator('#signInBtn').click();page.wait_for_selector('#appShell:not([hidden])');page.wait_for_timeout(750)

def overflow(page,label):
 check(label+' no page overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))

def choose(page, id):
 if page.locator('#patternPicker').is_visible():page.locator('#patternPicker').select_option(id)
 else:page.locator(f'[data-pattern-id="{id}"]').click()

def screenshot(page,name):
 page.wait_for_timeout(600);page.screenshot(path=str(OUT/(name+'.png')),full_page=True)

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH') or None,args=['--no-sandbox'])
 for w,h,label in [(1440,900,'desktop'),(390,844,'mobile'),(360,640,'small'),(768,1024,'tablet')]:
  ctx,page,errors=setup(browser,w,h)
  navigate(page);screenshot(page,label+'-entry');overflow(page,label+' entry')
  page.locator('#signInBtn').click();page.wait_for_selector('#appShell:not([hidden])');page.wait_for_timeout(800)
  screenshot(page,label+'-observe');overflow(page,label+' observe')
  page.locator('#markBtn').click();page.wait_for_function("__writes.some(w=>w.path.includes('/observations/')&&w.data.uiVersion==='motion-archive-v7')")
  # A source object must physically travel after a successful save.
  check(label+' capture transfer exists',page.locator('.flight-material').count()>0)
  page.wait_for_timeout(700);check(label+' saved material',page.locator('#lastMaterialSlot img').count()==1)
  saved_label=page.locator('#lastCapture').text_content()
  page.evaluate('window.__failSave=true');page.locator('#markBtn').click();page.wait_for_timeout(200)
  check(label+' rejected save retains previous',page.locator('#lastCapture').text_content()==saved_label)
  check(label+' rejected save no transfer',page.locator('.flight-material').count()==0)
  check(label+' rejected save says not saved','Not saved' in page.locator('#markStatus').inner_text())
  page.locator('#textBtn').click();page.locator('#observationText').fill('A raw text observation, without interpretation.');page.locator('#saveTextBtn').click();page.wait_for_timeout(650)
  check(label+' text saved',page.evaluate("__writes.some(w=>w.path.includes('/observations/')&&w.data.sourceType==='text')"))
  check(label+' composer closes',page.locator('#textComposer').is_hidden())
  page.locator('#voiceBtn').focus();page.keyboard.down('Space');page.wait_for_timeout(80);page.keyboard.up('Space');page.wait_for_timeout(650)
  check(label+' voice keyboard save '+page.locator('#voiceState').inner_text()+' '+str(errors)+' '+str(page.evaluate('__writes.filter(w=>w.path.includes("/usageEvents/")).map(w=>w.data.eventName)')),page.evaluate("__writes.some(w=>w.path.includes('/observations/')&&w.data.sourceType==='voice')"))
  page.locator('[data-nav="timeline"]').click();page.wait_for_selector('.timeline-item');screenshot(page,label+'-stream');overflow(page,label+' stream')
  page.locator('[data-filter="mark"]').click();page.wait_for_timeout(400)
  check(label+' marks-only filter',page.locator('.timeline-item:not([data-source="mark"])').count()==0)
  page.locator('[data-filter="all"]').click();page.wait_for_timeout(400)
  page.locator('[data-nav="discover"]').click();page.wait_for_selector('#supportGrid .source-object');screenshot(page,label+'-patterns');overflow(page,label+' patterns')
  check(label+' 4 real supporting sources',page.locator('#supportGrid .source-object').count()==4)
  page.evaluate("window.__sourceIdentity=document.querySelector('[data-key=\"o3\"]')")
  choose(page,'p2');page.wait_for_timeout(100)
  check(label+' identity survives regroup',page.evaluate("__sourceIdentity===document.querySelector('[data-key=\"o3\"]')"))
  check(label+' measured group travel animates',page.evaluate("[...document.querySelectorAll('.source-object')].some(n=>n.getAnimations().length>0)"))
  if label in ['desktop','mobile']:page.screenshot(path=str(OUT/(label+'-gather-in-motion.png')))
  page.wait_for_timeout(650);screenshot(page,label+'-patterns-second')
  choose(page,'p3');page.wait_for_timeout(200)
  check(label+' missing source not fabricated',page.locator('#supportGrid .source-object').count()==1)
  check(label+' missing source explained','unavailable' in page.locator('#missingSourceNote').inner_text())
  page.locator('#supportGrid .source-object').first.click();page.wait_for_selector('#momentDialog[open]');screenshot(page,label+'-moment')
  check(label+' moment exposure written',page.evaluate("__writes.some(w=>w.path.includes('/exposures/')&&w.data.kind==='raw_observation_reviewed')"))
  page.locator('#closeMomentBtn').click();page.locator('#profileBtn').click();screenshot(page,label+'-profile')
  check(label+' latest listed','Motion Archive v7 — Latest' in page.locator('#experienceVersion').inner_text())
  page.locator('#reduceMotionToggle').check();check(label+' motion setting works',page.evaluate('document.body.classList.contains("reduce-motion")'))
  page.locator('#closeProfileBtn').click()
  check(label+' no uncaught JS exceptions',not errors)
  ctx.close()
 # Reduced motion and empty data must work without any animation-only information.
 ctx,page,errors=setup(browser,reduced=True);enter(page)
 page.locator('#markBtn').click();page.wait_for_timeout(80)
 check('OS reduced motion has no traveling clone',page.locator('.flight-material').count()==0)
 check('OS reduced motion has no running animations',page.evaluate('document.getAnimations().length===0'))
 page.evaluate('window.__empty=true');page.locator('[data-nav="timeline"]').click();page.wait_for_timeout(150)
 check('empty stream clear',page.locator('#timelineEmpty').is_visible())
 page.locator('[data-nav="discover"]').click();page.wait_for_timeout(150)
 check('empty patterns no fabricated data',page.locator('.source-object').count()==0)
 screenshot(page,'mobile-empty-patterns');ctx.close()
 # Dense records and a source older than the 120-item stream limit.
 ctx,page,errors=setup(browser,w=390,h=844,reduced=True);enter(page)
 page.evaluate("""()=>{
  for(let i=0;i<160;i++)__mockObservations['dense'+i]={sourceType:['mark','voice','text'][i%3],rawText:'A preserved raw observation '+i,clientCreatedAtMs:1789960000000+i*60000,localDate:'2026-09-21',timezoneOffsetMinutes:-330};
  __mockObservations.old={sourceType:'text',rawText:'Older source outside the loaded stream.',clientCreatedAtMs:1600000000000,localDate:'2020-09-13',timezoneOffsetMinutes:0};
  __mockPatterns.splice(0,__mockPatterns.length,{id:'dense',title:'Many linked sources',supportCount:61,sourceObservationIds:['old',...Array.from({length:60},(_,i)=>'dense'+i)],updatedAtMs:7});
 }""")
 page.locator('[data-nav="timeline"]').click();page.wait_for_selector('.timeline-item')
 check('stream respects 120 record limit',page.locator('.timeline-item').count()==120)
 page.locator('[data-nav="discover"]').click();page.wait_for_selector('#supportGrid .source-object')
 check('dense board bounds visible source count',page.locator('#supportGrid .source-object').count()==24)
 check('dense board discloses truncation','first 24' in page.locator('#missingSourceNote').inner_text())
 overflow(page,'dense evidence')
 page.locator('#supportGrid [data-observation-id="old"]').click();page.wait_for_selector('#momentDialog[open]')
 check('older source opens outside loaded stream','Older source outside' in page.locator('#momentHero').inner_text())
 ctx.close()
 # The installed PWA caches the exact V7 code and visual material; no live Firebase writes.
 if not INLINE:
  ctx,page,errors=setup(browser,sw=True)
  page.goto(BASE+'/',wait_until='networkidle')
  page.wait_for_function("navigator.serviceWorker.controller !== null",timeout=15000)
  cached=page.evaluate("""async()=>{const c=await caches.open('luminary-shell-v11');return Promise.all(['./motion-v7.js','./versions/motion-archive-v7.html','./versions/motion-archive-v7.css','./assets/v6-material-mark.webp'].map(async u=>!!await c.match(u)))}""")
  check('PWA caches V7 code and generated material',all(cached))
  ctx.set_offline(True)
  response=page.evaluate("fetch('./versions/motion-archive-v7.html').then(r=>r.text()).then(t=>t.includes('Mark this moment'))")
  check('offline V7 template is actual HTML',response)
  ctx.close()
 # Retained presentation versions still run with the shared runtime.
 for version in ['trace-register-v2.1','intuitive-capture-v3','meaningful-motion-v4','perceptual-specimens-v5','generated-material-v6']:
  ctx,page,errors=setup(browser,reduced=True);enter(page,version)
  page.locator('#markBtn').click();page.wait_for_timeout(100)
  check(version+' capture preserved',page.evaluate(f"__writes.some(w=>w.path.includes('/observations/')&&w.data.uiVersion==='{version}')"))
  page.locator('.nav-item[data-nav="timeline"]:visible').click();page.wait_for_selector('.timeline-item')
  check(version+' stream available',page.locator('.timeline-item').count()>0)
  check(version+' no uncaught exceptions',not errors);ctx.close()
 browser.close()
(OUT/'results.json').write_text(json.dumps({'passed':len(results),'checks':results},indent=2))
print(json.dumps({'passed':len(results),'evidence':str(OUT)}))
