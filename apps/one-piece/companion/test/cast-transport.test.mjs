import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough,Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CastPythonTransport } from '../src/cast.mjs';

function childFixture(handler){
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.killed=false;
  child.stdin=new Writable({write(chunk,_encoding,done){queueMicrotask(()=>handler(JSON.parse(chunk.toString()),child));done();}});
  child.kill=()=>{if(!child.killed){child.killed=true;child.emit('exit',0);}};
  return child;
}
test('capability URL stays on private stdin and never appears in executable arguments or worker environment',async()=>{
  const marker='https://onepiece.local:8796/m/'+ 'Q'.repeat(32)+'/one-piece-0001/L3ZpZGVv';let invocation,received;
  const child=childFixture((request,worker)=>{received=request;worker.stdout.write(JSON.stringify({id:request.id,ok:true,result:{owned:true}})+'\n');});
  const transport=new CastPythonTransport({mediaOrigins:['https://onepiece.local:8796'],spawnImpl:(...args)=>{invocation=args;return child;}});
  try{
    assert.deepEqual(await transport.request('load',{episode:{mediaUrl:marker}}),{owned:true});
    assert.equal(received.episode.mediaUrl,marker);
    assert.equal(JSON.stringify(invocation).includes('Q'.repeat(32)),false);
    assert.equal(invocation[2].windowsHide,true);assert.deepEqual(invocation[2].stdio,['pipe','pipe','pipe']);
    assert.equal(invocation[2].env.ONE_PIECE_CAST_CONFIG.includes('allowHttpMedia":false'),true);
  }finally{transport.close();}
});
test('malformed worker output terminates the owned subprocess and fails pending work without raw diagnostics',async()=>{
  const child=childFixture((_request,worker)=>worker.stdout.write('not JSON, potentially sensitive\n'));
  const transport=new CastPythonTransport({mediaOrigins:['https://onepiece.local'],spawnImpl:()=>child});
  await assert.rejects(transport.request('status'),{code:'cast-unavailable'});assert.equal(child.killed,true);transport.close();
});
test('arbitrary worker errors containing media URLs are replaced by a safe error code',async()=>{
  const child=childFixture((request,worker)=>worker.stdout.write(JSON.stringify({id:request.id,ok:false,error:'load failed https://onepiece.local/m/private-capability'})+'\n'));
  const transport=new CastPythonTransport({mediaOrigins:['https://onepiece.local'],spawnImpl:()=>child});
  try{await assert.rejects(transport.request('load'),error=>error.code==='cast-unavailable'&&!error.message.includes('http'));}finally{transport.close();}
});
test('Python never auto-launches a media app during foreign status inspection, and session identity gates ownership',t=>{
  const script=String.raw`
import importlib.util, json, sys
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('cast_worker',sys.argv[1]); module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
worker=module.Worker.__new__(module.Worker);worker.receiver_app='CC1AD845';worker.backdrop='E8C28D3C'
class Wait:
    def __init__(self,*_): self.callback=lambda *_args:None
    def wait_response(self): pass
worker.wait_response=Wait
class Media:
    def update_status(self,**_): raise AssertionError('Would auto-launch the media receiver')
foreign=SimpleNamespace(status=SimpleNamespace(app_id='UNRELATED',session_id='foreign'),socket_client=SimpleNamespace(receiver_controller=SimpleNamespace(update_status=lambda **_:None)),media_controller=Media())
worker.devices={};worker.platform_receipts={}
try:worker.refresh(foreign);raise AssertionError('Callback-only receiver status accepted')
except module.CastError as error:assert str(error)=='cast-status-not-fresh'
url='https://onepiece.local/m/'+('A'*32)+'/one-piece-0001/L3ZpZGVv'
entry={'episodeId':'one-piece-0001','mediaUid':'fixture-uid','durationSeconds':1500}
binding={'receiverSession':'ours','media':{module.digest(url):entry},'queued':None}
status=SimpleNamespace(app_id='CC1AD845',session_id='ours',volume_level=0.4,volume_muted=False)
media=SimpleNamespace(content_id=url,current_time=12,player_state='PLAYING',current_subtitle_tracks=[1],idle_reason=None)
cast=SimpleNamespace(status=status,media_controller=SimpleNamespace(status=media))
assert worker.owned(cast,binding)
state=worker.state('fixture',cast,binding);assert state['positionSeconds']==12 and 'http' not in json.dumps(state)
for tracks,enabled in [(None,False),([],False),([1],True)]:
    media.current_subtitle_tracks=tracks
    assert worker.state('fixture',cast,binding)['subtitleEnabled'] is enabled
status.session_id='another';assert not worker.owned(cast,binding)
state=worker.state('fixture',cast,binding);assert state['positionSeconds'] is None and not state['owned']
events=[]
from uuid import UUID
identifier=UUID('7bca3240-e383-4cb0-a18b-24eaa6aa1591')
stale=SimpleNamespace(socket_client=SimpleNamespace(is_stopped=True,is_alive=lambda:False,disconnect=lambda:events.append('old disconnected')))
fresh=SimpleNamespace(uuid=identifier,name='Fixture TV',socket_client=SimpleNamespace(is_stopped=False,is_connected=True,receiver_controller=SimpleNamespace()),status=SimpleNamespace(app_id=None),cast_info=SimpleNamespace(model_name='Fixture'),wait=lambda **_:events.append('wait'))
fresh.media_controller=SimpleNamespace(register_status_listener=lambda _:None)
worker.devices={str(identifier):stale};worker.bindings={};worker.media_receipts={};worker.media_listeners={};worker.raw_media={}
clock=[100.0];module.time.monotonic=lambda:clock[0];module.time.sleep=lambda seconds:clock.__setitem__(0,clock[0]+seconds)
browser=SimpleNamespace(devices={identifier:SimpleNamespace(uuid=identifier)},zc='resolver',start_discovery=lambda:events.append('discovery started'),stop_discovery=lambda:events.append('discovery stopped'))
worker.discovery_browser=None;worker.discovery_started=0;worker.browser_factory=lambda:browser
worker.pc=SimpleNamespace(get_chromecast_from_cast_info=lambda *_args,**_:fresh)
def refreshed(*_args,**_kwargs):
    events.append('refreshed while discovery active')
    worker.platform_receipts[str(identifier)]={'version':1,'receivedAt':clock[0],'uncertain':False,'applicationsEmpty':True}
worker.refresh=refreshed
result=worker.discover();assert result[0]['busy'] is False and worker.devices[str(identifier)] is fresh
assert 'discovery started' in events and 'discovery stopped' not in events
print('Python ownership and foreign-app status fixtures passed')
`;
  const result=spawnSync('python',['-c',script,fileURLToPath(new URL('../src/cast-bridge.py',import.meta.url))],{encoding:'utf8',windowsHide:true,timeout:10000});
  if(result.error?.code==='ENOENT'){t.skip('Python runtime unavailable for isolated worker fixture');return;}
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/fixtures passed/);
});

test('Python accepts fresh unsolicited media status, rejects stale/foreign state, and retries bounded load timeouts with safe cleanup',t=>{
 const script=String.raw`
import ast,importlib.util,pathlib,sys
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('cast_worker',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
clock=[100.0];module.time.monotonic=lambda:clock[0];module.time.sleep=lambda seconds:clock.__setitem__(0,clock[0]+seconds)
class Timeout(Exception): pass
class Disconnected(Exception): pass
class Failed(Exception): pass
url='https://onepiece.local/m/'+('A'*32)+'/one-piece-0001/L3ZpZGVv'
context={'uid':'viewer','sessionId':'session-fixture','generation':1,'authorityEpoch':1}
episode={'episodeId':'one-piece-0001','mediaUid':'00000000-0000-4000-8000-000000000001','durationSeconds':1500,'contentType':'video/mp4','mediaUrl':url,'subtitleUrl':url}
class Wait:
    def __init__(self,*_): self.response=None;self.msg_sent=False;self.callback=self.received
    def received(self,sent,response):self.msg_sent=sent;self.response=response
    def wait_response(self):
        if worker.timeout_next:
            worker.timeout_next=False
            raise Timeout()
        if worker.failed_next or worker.failed_forever:
            worker.failed_next=False
            if worker.failed_foreign:cast.status.app_id='FOREIGN_APP';cast.status.session_id='foreign'
            raise Failed()
class Media:
    def __init__(self):
        self.status=SimpleNamespace(content_id=url,current_time=600,player_state='PLAYING',current_subtitle_tracks=[1],idle_reason=None,media_session_id=5)
        self.mode='fresh';self.updates=0;self.stops=0;self.loads=0;self.listener=None;self.raw=None
    def register_status_listener(self,value): self.listener=value
    def receive_message(self,_message,data):
        rows=data.get('status',[])
        if rows:
            item=rows[0];self.status.content_id=(item.get('media') or {}).get('contentId',self.status.content_id)
            self.status.media_session_id=item.get('mediaSessionId',self.status.media_session_id);self.status.player_state=item.get('playerState',self.status.player_state)
        self.listener.new_media_status(self.status)
    @property
    def is_active(self):return 'urn:x-cast:com.google.cast.media' in cast.socket_client.app_namespaces
    def update_status(self,**_):raise AssertionError('Status must never use an auto-launching controller method')
    def send_message_nocheck(self,data,**_):
        assert data=={'type':'GET_STATUS'}
        self.updates+=1
        if self.mode=='disconnect-notification':
            self.status.content_id=None;self.status.media_session_id=None;self.status.player_state='UNKNOWN';self.listener.new_media_status(self.status)
            return
        if self.mode=='fresh' or (self.mode=='second-fresh' and self.updates>1):
            if self.raw is not None:self.receive_message(None,self.raw)
            else:self.receive_message(None,{'type':'MEDIA_STATUS','status':[{'mediaSessionId':self.status.media_session_id,'playerState':self.status.player_state,'media':{'contentId':self.status.content_id}}]})
    def play_media(self,*_args,**_kwargs):
        self.loads+=1
        if self.mode=='load-rejected':raise Failed()
        cast.status.app_id='CC1AD845';cast.status.session_id='ours'
        if worker.clear_idle_on_load:worker.platform_raw=None;worker.platform_reply=False;cast.status.transport_id='transport-ours'
        if self.mode=='receiver-timeout-once':worker.timeout_next=True;self.mode='fresh'
        if self.mode in ('receiver-failed-once','receiver-failed-forever','receiver-failed-foreign'):
            worker.failed_next=True;worker.failed_forever=self.mode=='receiver-failed-forever';worker.failed_foreign=self.mode=='receiver-failed-foreign';self.mode='fresh'
        if self.mode in ('reconnect-once','reconnect-forever','reconnect-foreign'):
            worker.disconnect_mode=self.mode;self.mode='fresh'
    def stop(self,**_): self.stops+=1
def fixture():
    global worker,cast
    worker=module.Worker.__new__(module.Worker);worker.receiver_app='CC1AD845';worker.backdrop='E8C28D3C';worker.wait_response=Wait;worker.request_timeout=Timeout;worker.status_failed=Failed;worker.connection_errors=(Disconnected,);worker.timeout_next=False;worker.disconnect_mode=None;worker.failed_next=False;worker.failed_forever=False;worker.failed_foreign=False;worker.platform_raw=None;worker.platform_parser=None;worker.platform_reply=False;worker.clear_idle_on_load=False
    worker.devices={};worker.bindings={};worker.media_receipts={};worker.media_listeners={};worker.raw_media={};worker.origins={'https://onepiece.local'}
    def receiver_update(**_):
        mode=worker.disconnect_mode
        if mode:
            if mode!='reconnect-forever':worker.disconnect_mode=None
            if mode=='reconnect-foreign':cast.status.app_id='FOREIGN_APP';cast.status.session_id='foreign'
            raise Disconnected()
        data=worker.platform_raw if worker.platform_raw is not None else {'type':'RECEIVER_STATUS','status':{'applications':[{'appId':cast.status.app_id,'sessionId':cast.status.session_id,'transportId':cast.status.transport_id,'namespaces':[{'name':'urn:x-cast:com.google.cast.media'}]}]}}
        receiver.receive_message(None,data)
        if worker.platform_reply:_['callback_function'](True,data)
    def platform_receive(_message,data):
        if worker.platform_parser:cast.status=worker.platform_parser(data,'cast')
        return True
    media=Media();receiver=SimpleNamespace(update_status=receiver_update,receive_message=platform_receive,send_message=lambda *_args,**_kwargs:None)
    cast=SimpleNamespace(status=SimpleNamespace(app_id='CC1AD845',session_id='ours',transport_id='transport-ours',volume_level=.4,volume_muted=False),socket_client=SimpleNamespace(receiver_controller=receiver,is_connected=True,is_stopped=False,app_namespaces=['urn:x-cast:com.google.cast.media'],destination_id='transport-ours'),media_controller=media)
    worker.devices['fixture']=cast;worker.device=lambda _:cast;worker.observe_media('fixture',cast)
    return media
media=fixture();worker.refresh(cast);assert worker.media_receipts['fixture']['version']==1
# One unanswered query is retried read-only inside the same freshness window.
media=fixture();media.mode='second-fresh';began=clock[0];worker.refresh(cast)
assert media.updates==2 and .75<=clock[0]-began<1
# A new listener receipt works without a request-id callback.
assert worker.state('fixture',cast,{'receiverSession':'ours','media':{module.digest(url):episode},'queued':None})['owned']
media.mode='stale';began=clock[0];before_updates=media.updates
try:worker.refresh(cast);raise AssertionError('Unchanged cached PLAYING was accepted')
except module.CastError as error:assert str(error)=='cast-status-not-fresh'
assert 3 <= clock[0]-began < 3.1
assert media.updates-before_updates==4
media.mode='disconnect-notification'
try:worker.refresh(cast);raise AssertionError('Local channel-reset callback accepted as actual receiver status')
except module.CastError as error:assert str(error)=='cast-status-not-fresh'
media.status.content_id=url;media.status.media_session_id=5;media.status.player_state='PLAYING'
# A fresh status from a different receiver session never grants old ownership.
binding={'receiverSession':'ours','context':context,'media':{module.digest(url):episode},'queued':None};worker.bindings['fixture']=binding
cast.status.session_id='foreign';media.mode='fresh'
try:worker.admitted({'receiverId':'fixture','context':context});raise AssertionError('Foreign session accepted')
except module.CastError as error:assert str(error)=='cast-ownership-lost'
assert media.stops==0
cast.status.app_id='FOREIGN_APP';before=media.updates;worker.refresh(cast);assert media.updates==before
# An absent namespace or disconnected socket cannot trigger an implicit app launch.
for changed_key,changed_value in [('app_namespaces',[]),('is_connected',False),('is_stopped',True)]:
    media=fixture();original=getattr(cast.socket_client,changed_key);setattr(cast.socket_client,changed_key,changed_value)
    before=media.updates
    try:worker.refresh(cast);raise AssertionError('Unavailable media namespace queried')
    except module.CastError as error:assert str(error)=='cast-status-not-fresh'
    assert media.updates==before
    setattr(cast.socket_client,changed_key,original)
# One lost status response is retried inside the finite LOAD window.
for mode in ['second-fresh','receiver-timeout-once','reconnect-once','receiver-failed-once']:
    media=fixture();cast.status.app_id=worker.backdrop;media.mode=mode;began=clock[0]
    state=worker.load({'receiverId':'fixture','context':context,'episode':episode,'positionSeconds':600})
    assert state['owned'] and state['state']=='PLAYING' and clock[0]-began<18
    assert worker.bindings['fixture']['receiverSession']=='ours'
    assert media.loads==1
# A full real-shaped raw status proves the exact loaded media and current session.
valid_raw={'type':'MEDIA_STATUS','status':[{'mediaSessionId':5,'playerState':'PLAYING','currentTime':600,
    'activeTrackIds':[1],'media':{'contentId':url,'contentType':'video/mp4','duration':1500,'streamType':'BUFFERED'}}]}
media=fixture();cast.status.app_id=worker.backdrop;media.raw=valid_raw
state=worker.load({'receiverId':'fixture','context':context,'episode':episode,'positionSeconds':600})
assert state['owned'] and state['state']=='PLAYING' and media.loads==1
assert worker.recent_admitted(cast,worker.bindings['fixture'])
assert worker.execute('status',{'receiverId':'fixture','context':context})['owned']
assert worker.execute('disconnect',{'receiverId':'fixture','context':context})['disconnected'] and media.stops==1
# The parser legitimately preserves cached fields on empty/partial updates. None
# of these NEW raw receipts proves that the cached content is actually playing.
for bad_raw in [
    {'type':'MEDIA_STATUS','status':[]},
    {'type':'MEDIA_STATUS','status':[{'mediaSessionId':999,'playerState':'PLAYING'}]},
    {'type':'MEDIA_STATUS','status':[{'mediaSessionId':5,'playerState':'PLAYING','media':[]}]},
]:
    media=fixture();cast.status.app_id=worker.backdrop;media.raw=bad_raw;began=clock[0]
    try:worker.load({'receiverId':'fixture','context':context,'episode':episode,'positionSeconds':600});raise AssertionError('Cached fields confirmed LOAD')
    except module.CastError as error:assert str(error)=='cast-load-not-confirmed'
    assert 18<=clock[0]-began<18.2 and media.loads==1 and media.stops==0
    for operation in ['status','disconnect']:
        media=fixture();media.raw=bad_raw
        binding={'receiverSession':'ours','context':context,'media':{module.digest(url):episode},'queued':None};worker.bindings['fixture']=binding
        if not bad_raw['status'] and operation=='status':
            assert not worker.execute(operation,{'receiverId':'fixture','context':context})['owned']
        else:
            try:worker.execute(operation,{'receiverId':'fixture','context':context});raise AssertionError('Cached fields admitted '+operation)
            except module.CastError as error:assert str(error)==('cast-ownership-lost' if not bad_raw['status'] else 'cast-status-not-fresh')
        assert media.stops==0
    media=fixture();media.raw=bad_raw
    binding={'receiverSession':'ours','context':context,'media':{module.digest(url):episode},'queued':None};worker.bindings['fixture']=binding
    try:worker.wait_state('fixture',cast,binding,lambda state:state['owned'] and state['state']=='PLAYING');raise AssertionError('Cached fields confirmed a command')
    except module.CastError as error:assert str(error)==('cast-ownership-lost' if not bad_raw['status'] else 'cast-status-not-fresh')
    # Cached old content cannot bypass takeover. Two proven empty observations
    # still permit LOAD, but they cannot confirm its eventual playback.
    media=fixture();media.raw=bad_raw;worker.bindings['fixture']={'receiverSession':'ours','context':context,'media':{module.digest(url):episode},'queued':None}
    try:worker.load({'receiverId':'fixture','context':context,'episode':episode,'positionSeconds':600});raise AssertionError('Cached fields bypassed takeover')
    except module.CastError as error:assert str(error)==('cast-load-not-confirmed' if not bad_raw['status'] else 'cast-tv-busy')
    assert media.loads==(1 if not bad_raw['status'] else 0) and media.stops==0
# A read-only platform rejection stays bounded; a LOAD rejection is not retried.
media=fixture();cast.status.app_id=worker.backdrop;media.mode='receiver-failed-forever';began=clock[0]
try:worker.load({'receiverId':'fixture','context':context,'episode':episode,'positionSeconds':600});raise AssertionError('Failed status accepted')
except module.CastError as error:assert str(error)=='cast-load-not-confirmed'
assert 18<=clock[0]-began<18.2 and media.loads==1
media=fixture();cast.status.app_id=worker.backdrop;media.mode='load-rejected'
try:worker.load({'receiverId':'fixture','context':context,'episode':episode,'positionSeconds':600});raise AssertionError('Rejected LOAD accepted')
except Failed:pass
assert media.loads==1
media=fixture();cast.status.app_id=worker.backdrop;media.mode='receiver-failed-foreign'
try:worker.load({'receiverId':'fixture','context':context,'episode':episode,'positionSeconds':600});raise AssertionError('Foreign app accepted after failed status')
except module.CastError as error:assert str(error)=='cast-ownership-lost'
assert media.loads==1 and media.stops==0
# A callback without a new raw RECEIVER_STATUS is not fresh LOAD admission.
media=fixture();cast.status.app_id=worker.backdrop;cast.socket_client.receiver_controller.receive_message=lambda *_args:True;began=clock[0]
try:worker.load({'receiverId':'fixture','context':context,'episode':episode,'positionSeconds':600});raise AssertionError('Callback-only platform status accepted')
except module.CastError as error:assert str(error)=='cast-status-not-fresh'
assert clock[0]-began<.1 and media.loads==0
# A prolonged disconnected socket is bounded, and reconnecting to foreign content
# never converts old cached PLAYING into ownership or re-sends the original LOAD.
media=fixture();cast.status.app_id=worker.backdrop;media.mode='reconnect-forever';began=clock[0]
try:worker.load({'receiverId':'fixture','context':context,'episode':episode,'positionSeconds':600});raise AssertionError('Disconnected load accepted')
except module.CastError as error:assert str(error)=='cast-load-not-confirmed'
assert 18<=clock[0]-began<18.2
media=fixture();cast.status.app_id=worker.backdrop;media.mode='reconnect-foreign'
try:worker.load({'receiverId':'fixture','context':context,'episode':episode,'positionSeconds':600});raise AssertionError('Foreign app accepted after reconnect')
except module.CastError as error:assert str(error)=='cast-ownership-lost'
assert media.stops==0
# Failure retains the captured receiver session so cleanup can stop ONLY that session.
media=fixture();cast.status.app_id=worker.backdrop;media.mode='stale';began=clock[0]
try:worker.load({'receiverId':'fixture','context':context,'episode':episode,'positionSeconds':600});raise AssertionError('Stale load accepted')
except module.CastError as error:assert str(error)=='cast-load-not-confirmed'
assert 18<=clock[0]-began<21.1
assert worker.bindings['fixture']['receiverSession']=='ours'
media.mode='fresh';result=worker.execute('disconnect',{'receiverId':'fixture','context':context});assert result['disconnected'] and media.stops==1
# Empty Default Receiver admission requires two new raw observations, never cached emptiness.
media=fixture();media.status.content_id=None;media.status.media_session_id=None;media.status.player_state='UNKNOWN';media.raw={'type':'MEDIA_STATUS','status':[]}
assert worker.empty_default(cast)
for item in [
    {'mediaSessionId':7,'playerState':'PLAYING','media':{'contentId':url}},
    {'mediaSessionId':7,'playerState':'PAUSED','media':{'contentId':url}},
    {'playerState':'UNKNOWN','loadingItemId':9},
    {'playerState':'IDLE','items':[{'itemId':3}]},
    {'playerState':'IDLE','extendedStatus':{'playerState':'LOADING'}},
    {'playerState':'IDLE','extendedStatus':[]},
    {'playerState':'IDLE','media':''},
]:
    media.raw={'type':'MEDIA_STATUS','status':[item]};assert not worker.empty_default(cast)
media.raw={'type':'MEDIA_STATUS','status':[]};assert worker.empty_default(cast)
media.mode='stale';assert not worker.empty_default(cast)
media.mode='fresh';cast.status.app_id='FOREIGN_APP';before=media.updates;assert not worker.empty_default(cast);assert media.updates==before
# Recent command proof requires actual raw platform AND media receipt, not just
# a successful callback or unchanged controller PLAYING fields.
media=fixture();binding={'receiverSession':'ours','context':context,'media':{module.digest(url):episode},'queued':None};worker.bindings['fixture']=binding
worker.refresh(cast);worker.platform_receipts['fixture']={'version':0};assert not worker.recent_admitted(cast,binding)
platform={'type':'RECEIVER_STATUS','status':{'applications':[{'appId':'CC1AD845','sessionId':'ours','transportId':'transport-ours','namespaces':[{'name':'urn:x-cast:com.google.cast.media'}]}]}}
cast.socket_client.receiver_controller.receive_message(None,platform)
assert worker.recent_admitted(cast,binding)
before=media.updates;worker.admitted({'receiverId':'fixture','context':context});assert media.updates==before
for container,key,value in [(media.status,'content_id','foreign-content'),(media.status,'media_session_id',999),(media.status,'player_state','UNKNOWN'),(cast.status,'session_id','foreign'),(cast.socket_client,'is_connected',False),(cast.socket_client,'is_stopped',True),(cast.socket_client,'app_namespaces',[]),(cast.socket_client,'destination_id','foreign-transport')]:
    original=getattr(container,key);setattr(container,key,value)
    assert not worker.recent_admitted(cast,binding),(key,value)
    setattr(container,key,original)
changed_context={**context,'authorityEpoch':2}
try:worker.admitted({'receiverId':'fixture','context':changed_context});raise AssertionError('Changed context accepted recent proof')
except module.CastError as error:assert str(error)=='cast-ownership-lost'
worker.raw_media['fixture']['version']+=1;assert not worker.recent_admitted(cast,binding)
worker.raw_media['fixture']['version']-=1
clock[0]+=1.01;assert not worker.recent_admitted(cast,binding)
# A new media receipt does not make old platform proof fresh.
media.send_message_nocheck({'type':'GET_STATUS'});assert not worker.recent_admitted(cast,binding)
# Use the installed parser's actual function body when available, without importing
# pychromecast/zeroconf or requiring those optional packages on CI.
parser_path=pathlib.Path(sys.argv[2]);actual_parser=parser_path.is_file()
def parse_status(data,_cast_type):
    status=data.get('status',{});apps=status.get('applications',[]);app=apps[0] if apps else {}
    return SimpleNamespace(app_id=app.get('appId'),session_id=app.get('sessionId'),transport_id=app.get('transportId'),volume_level=status.get('volume',{}).get('level',1),volume_muted=False)
if actual_parser:
    tree=ast.parse(parser_path.read_text(encoding='utf8'));receiver_class=next(row for row in tree.body if isinstance(row,ast.ClassDef) and row.name=='ReceiverController')
    method=next(row for row in receiver_class.body if isinstance(row,ast.FunctionDef) and row.name=='_parse_status');method.decorator_list=[]
    fields='is_active_input is_stand_by volume_level volume_muted app_id display_name namespaces session_id transport_id status_text icon_url volume_control_type'.split()
    namespace={'CastStatus':lambda *values:SimpleNamespace(**dict(zip(fields,values))),'CAST_TYPE_AUDIO':'audio','CAST_TYPE_GROUP':'group','APP_ID':'appId','SESSION_ID':'sessionId','VOLUME_CONTROL_TYPE_ATTENUATION':'attenuation'}
    exec(compile(ast.Module(body=[method],type_ignores=[]),str(parser_path),'exec'),namespace)
    parse_status=namespace['_parse_status']
full_platform={'type':'RECEIVER_STATUS','status':{'applications':[{'appId':'CC1AD845','sessionId':'ours','transportId':'transport-ours','namespaces':[{'name':'urn:x-cast:com.google.cast.media'}]}]}}
for partial in [{'type':'RECEIVER_STATUS','status':{'volume':{'level':.4,'muted':False}}},{'type':'RECEIVER_STATUS'},{'type':'RECEIVER_STATUS','status':{}}]:
    media=fixture();worker.platform_parser=parse_status;worker.platform_raw=full_platform
    binding={'receiverSession':'ours','context':context,'media':{module.digest(url):episode},'queued':None};worker.bindings['fixture']=binding
    assert worker.execute('status',{'receiverId':'fixture','context':context})['owned']
    worker.platform_raw=partial;clock[0]+=1.1
    for operation in ['status','pause','disconnect']:
        try:worker.execute(operation,{'receiverId':'fixture','context':context});raise AssertionError('Partial receiver status admitted '+operation)
        except module.CastError as error:assert str(error)=='cast-status-not-fresh'
    assert cast.status.app_id is None and cast.status.session_id is None and media.loads==media.stops==0
    worker.platform_raw=full_platform
    assert worker.execute('status',{'receiverId':'fixture','context':context})['owned']
# A matched GET_STATUS with omitted applications is a complete idle response on
# Sony. It permits one intentional LOAD, while the identical unsolicited shape
# above never permits a command or destructive ownership loss.
media=fixture();worker.platform_parser=parse_status
worker.platform_raw={'type':'RECEIVER_STATUS','requestId':42,'status':{'userEq':{},'volume':{'level':.4}}}
worker.platform_reply=True;worker.clear_idle_on_load=True
result=worker.execute('load',{'receiverId':'fixture','context':context,'episode':episode,'positionSeconds':600})
assert result['owned'] and media.loads==1 and media.stops==0
# Explicit foreign/empty app, receiver session, and exact foreign content are loss;
# owned FINISHED still reports the normal completed episode, never UNOWNED.
for kind in ['empty-app','foreign-app','foreign-session','empty-media','foreign-content','finished']:
    media=fixture();worker.platform_parser=parse_status;worker.platform_raw=full_platform
    binding={'receiverSession':'ours','context':context,'media':{module.digest(url):episode},'queued':None};worker.bindings['fixture']=binding
    if kind=='empty-app':worker.platform_raw={'type':'RECEIVER_STATUS','status':{'applications':[]}}
    if kind in ('foreign-app','foreign-session'):
        import copy
        worker.platform_raw=copy.deepcopy(full_platform);app=worker.platform_raw['status']['applications'][0];app['sessionId']='foreign'
        if kind=='foreign-app':app['appId']='FOREIGN_APP'
    if kind=='empty-media':media.raw={'type':'MEDIA_STATUS','status':[]}
    if kind=='foreign-content':media.raw={'type':'MEDIA_STATUS','status':[{'mediaSessionId':6,'playerState':'PLAYING','media':{'contentId':'foreign-content'}}]}
    if kind=='finished':media.status.player_state='IDLE';media.status.idle_reason='FINISHED'
    result=worker.execute('status',{'receiverId':'fixture','context':context})
    assert result['owned']==(kind=='finished'),kind
    assert media.loads==media.stops==0
# A local socket/channel reset with no new raw message remains uncertain even
# when the previous exact proof was less than one second old.
media=fixture();worker.platform_parser=parse_status;worker.platform_raw=full_platform
binding={'receiverSession':'ours','context':context,'media':{module.digest(url):episode},'queued':None};worker.bindings['fixture']=binding
worker.refresh(cast);media.status.content_id=None;media.status.media_session_id=None;media.status.player_state='UNKNOWN';media.listener.new_media_status(media.status)
assert not worker.definite_loss(cast,binding)
for key,value in [('is_connected',False),('is_stopped',True)]:
    previous=getattr(cast.socket_client,key);setattr(cast.socket_client,key,value)
    try:worker.execute('status',{'receiverId':'fixture','context':context});raise AssertionError('Socket reset classified as loss')
    except module.CastError as error:assert str(error)=='cast-status-not-fresh'
    setattr(cast.socket_client,key,previous)
print('Actual installed receiver parser exercised:',actual_parser)
print('Freshness, timeout and owned-cleanup fixtures passed')
`;
 const result=spawnSync('python',['-c',script,fileURLToPath(new URL('../src/cast-bridge.py',import.meta.url)),'H:/PTI-OnePiece/pilot/tools/python/pychromecast/controllers/receiver.py'],{encoding:'utf8',windowsHide:true,timeout:10000});
 if(result.error?.code==='ENOENT'){t.skip('Python runtime unavailable for isolated worker fixture');return;}
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/fixtures passed/);
});

test('Python SEEK preserves pause/play intent, verifies readiness after a lost acknowledgement, and never stops on failure',t=>{
 const script=String.raw`
import importlib.util,sys
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('cast_worker',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
clock=[100.0];module.time.monotonic=lambda:clock[0];module.time.sleep=lambda seconds:clock.__setitem__(0,clock[0]+seconds)
class Timeout(Exception):pass
class Failed(Exception):pass
class Disconnected(Exception):pass
class Wait:
    def __init__(self,timeout,*_):self.timeout=timeout;self.callback=lambda *_:None
    def wait_response(self):
        if worker.ack_timeout:clock[0]+=self.timeout;raise Timeout()
        if worker.ack_failed:raise Failed()
url='https://onepiece.local/m/'+('A'*32)+'/one-piece-0001/L3ZpZGVv'
entry={'episodeId':'one-piece-0001','mediaUid':'fixture-media','durationSeconds':1500}
context={'uid':'viewer','sessionId':'session-fixture','generation':1,'authorityEpoch':1}
def fixture(initial='PAUSED',mode='ready'):
    global worker,cast,binding,messages
    messages=[];worker=module.Worker.__new__(module.Worker);worker.receiver_app='CC1AD845';worker.backdrop='E8C28D3C';worker.wait_response=Wait;worker.request_timeout=Timeout;worker.status_failed=Failed;worker.connection_errors=(Disconnected,);worker.ack_timeout=False;worker.ack_failed=False
    status=SimpleNamespace(content_id=url,current_time=600,player_state=initial,current_subtitle_tracks=[1],idle_reason=None,media_session_id=5)
    def forbidden(*_,**__):raise AssertionError('SEEK must never use an auto-launching control, legacy forced-start seek, or STOP')
    def send(data,**options):
        assert data['type']=='SEEK' and data['mediaSessionId']==5 and data['sessionId']=='ours'
        assert options['inc_session_id'] is False
        messages.append(dict(data))
    controller=SimpleNamespace(status=status,send_message_nocheck=send,send_message=forbidden,seek=forbidden,stop=forbidden)
    cast=SimpleNamespace(status=SimpleNamespace(app_id='CC1AD845',session_id='ours',volume_level=.4,volume_muted=False),media_controller=controller)
    binding={'receiverSession':'ours','context':context,'media':{module.digest(url):entry},'queued':None};worker.bindings={'fixture':binding}
    # Raw platform/media admission is exercised separately above. These isolated
    # command tests control what the next newly proven receiver observation says.
    worker.admitted=lambda *_args,**_kwargs:('fixture',cast,binding)
    worker.recent_admitted=lambda *_args:mode!='stale' and worker.owned(cast,binding)
    worker.definite_loss=lambda *_args:mode=='foreign'
    def refresh(_cast):
        clock[0]+=5.5 if mode=='late-ready' else .05
        if mode=='foreign':cast.status.session_id='foreign';return
        if mode=='disconnected':raise Disconnected()
        if mode=='partial':raise module.CastError('cast-status-not-fresh')
        status.current_time=590 if mode!='wrong-position' else 600
        status.player_state='BUFFERING' if mode=='buffering' else 'PLAYING' if mode=='wrong-state' else initial
    worker.refresh=refresh
    return status
for initial,resume in [('PAUSED','PLAYBACK_PAUSE'),('PLAYING','PLAYBACK_START')]:
    fixture(initial);result=worker.execute('seek',{'receiverId':'fixture','context':context,'value':590})
    assert result['owned'] and result['state']==initial and result['positionSeconds']==590
    assert len(messages)==1 and messages[0]['resumeState']==resume
    assert worker.bindings['fixture'] is binding
# A callback timeout is not proof of receiver loss. Confirm a NEW exact target
# and intended state without issuing a duplicate SEEK or pretending it was fast.
fixture();worker.ack_timeout=True;began=clock[0]
result=worker.execute('seek',{'receiverId':'fixture','context':context,'value':590})
assert result['state']=='PAUSED' and clock[0]-began>=5 and len(messages)==1
for mode,code in [('buffering','cast-seek-not-confirmed'),('wrong-position','cast-seek-not-confirmed'),('wrong-state','cast-seek-not-confirmed'),('late-ready','cast-seek-not-confirmed'),
                  ('foreign','cast-ownership-lost'),('stale','cast-status-not-fresh'),('partial','cast-status-not-fresh'),('disconnected','cast-status-not-fresh')]:
    fixture(mode=mode)
    try:worker.execute('seek',{'receiverId':'fixture','context':context,'value':590});raise AssertionError('Unconfirmed seek accepted: '+mode)
    except module.CastError as error:assert str(error)==code,(mode,str(error))
    assert len(messages)==(0 if mode=='stale' else 1) and worker.bindings['fixture'] is binding
fixture();worker.ack_failed=True
try:worker.execute('seek',{'receiverId':'fixture','context':context,'value':590});raise AssertionError('Rejected seek accepted')
except module.CastError as error:assert str(error)=='cast-seek-not-confirmed'
assert len(messages)==1 and worker.bindings['fixture'] is binding
fixture(initial='BUFFERING')
try:worker.execute('seek',{'receiverId':'fixture','context':context,'value':590});raise AssertionError('Uncertain pre-seek intent accepted')
except module.CastError as error:assert str(error)=='cast-status-not-fresh'
assert not messages
print('Paused/playing seek, delayed acknowledgement and safe failure fixtures passed')
`;
 const result=spawnSync('python',['-c',script,fileURLToPath(new URL('../src/cast-bridge.py',import.meta.url))],{encoding:'utf8',windowsHide:true,timeout:10000});
 if(result.error?.code==='ENOENT'){t.skip('Python runtime unavailable for isolated worker fixture');return;}
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/fixtures passed/);
});
