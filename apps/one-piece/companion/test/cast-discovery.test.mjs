import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('repeated discovery preserves live/reconnecting sockets, replaces stopped threads, and retains the resolver until close',t=>{
const script=String.raw`
import importlib.util,sys,threading
from types import SimpleNamespace
from uuid import UUID
spec=importlib.util.spec_from_file_location('cast_worker',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
clock=[100.0];module.time.monotonic=lambda:clock[0];module.time.sleep=lambda seconds:clock.__setitem__(0,clock[0]+seconds)
worker=module.Worker.__new__(module.Worker);worker.devices={};worker.bindings={};worker.platform_receipts={};worker.discovery_browser=None;worker.discovery_started=0
worker.backdrop='BACKDROP';worker.receiver_app='RECEIVER';events=[];created=[]
identifier=UUID('7bca3240-e383-4cb0-a18b-24eaa6aa1591');info=SimpleNamespace(uuid=identifier)
browser=SimpleNamespace(devices={identifier:info},zc=object(),start_discovery=lambda:events.append('start'),stop_discovery=lambda:events.append('close resolver'))
worker.browser_factory=lambda:browser
class Socket:
    def __init__(self): self.is_stopped=False;self.is_connected=True;self.alive=True
    def disconnect(self): self.is_stopped=True;events.append('disconnect socket')
    def is_alive(self): return self.alive
def make(info,resolver,**options):
    assert resolver is browser.zc and 'close resolver' not in events
    cast=SimpleNamespace(uuid=info.uuid,name='Fixture TV',cast_info=SimpleNamespace(model_name='Fixture'),socket_client=Socket(),status=SimpleNamespace(app_id=None),wait=lambda **_:None,join=lambda **_:events.append('bounded join'))
    created.append(cast);return cast
worker.pc=SimpleNamespace(get_chromecast_from_cast_info=make)
worker.observe_media=lambda *_:events.append('new observation')
# This lifecycle-only fixture supplies the idle proof from a successful refresh;
# transport fixtures exercise real raw parsing and GET_STATUS correlation.
def refresh(cast,**_):
    worker.platform_receipts[str(cast.uuid)]={'version':1,'receivedAt':clock[0],'uncertain':False,'applicationsEmpty':True}
worker.refresh=refresh
first=worker.discover();assert first[0]['busy'] is False and len(created)==1
original=created[0];binding={'receiverSession':'same','media':{},'context':{}};worker.bindings[str(identifier)]=binding
worker.discover();assert len(created)==1 and 'disconnect socket' not in events
original.socket_client.is_connected=False # transient Wi-Fi gap: do not destroy a recovering socket/binding
worker.discover(str(identifier));assert len(created)==1 and worker.bindings[str(identifier)] is binding
original.socket_client.is_stopped=True;original.socket_client.alive=False
worker.device(str(identifier));assert len(created)==2 and worker.devices[str(identifier)] is created[1]
assert worker.bindings[str(identifier)] is binding and 'close resolver' not in events
# Actual Python Thread behavior: joining an unstarted discovery result is invalid.
thread=threading.Thread(target=lambda:None)
try: thread.join(timeout=0);raise AssertionError('Python should reject unstarted join')
except RuntimeError: pass
module.Worker.release_device(SimpleNamespace(socket_client=SimpleNamespace(disconnect=lambda:events.append('stop unstarted'),is_alive=thread.is_alive),join=thread.join))
assert 'stop unstarted' in events
worker.close();assert events.count('start')==1 and events.count('close resolver')==1
assert events.index('bounded join') < events.index('close resolver')
print('Cast discovery lifecycle regression passed')
`;
 const result=spawnSync('python',['-c',script,fileURLToPath(new URL('../src/cast-bridge.py',import.meta.url))],{encoding:'utf8',windowsHide:true,timeout:10000});
 if(result.error?.code==='ENOENT'){t.skip('Python unavailable');return;}
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/regression passed/);
});
