import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserContextPreflight,browserContextInstructions,browserContextReport} from '../src/browser-context.mjs';

test('broker metadata cannot turn independent context into authorization or remove the browser stop',()=>{
  for(const extra of [{DESKTOP_AUTHORIZED:'true'},{provider:'official-desktop',verified:true},{BROWSER_USE_ACCESS_PIPE_PATH:'synthetic-pipe',BROWSER_USE_ACCESS_VERIFYING_IDENTITY:'synthetic-identity'}]){
    const context=browserContextPreflight(extra);
    assert.equal(context.verified,false);
    assert.notEqual(context.status,'authorized');
    assert.match(browserContextInstructions(context),/Do not copy, forge, recover or inject browser identities\/pipes/);
    if(context.status==='unavailable')assert.match(browserContextInstructions(context),/Do not initialize browser tools/);
    assert(!JSON.stringify(context).includes('synthetic-pipe'));
  }
});

test('heartbeat wire contract exposes neither private environment nor caller-supplied authorization',()=>{
  const report=browserContextReport({BROWSER_USE_ACCESS_PIPE_PATH:'synthetic-secret-pipe',BROWSER_USE_ACCESS_VERIFYING_IDENTITY:'synthetic-secret-identity',OTHER_PRIVATE:'synthetic-other',verified:true});
  assert.deepEqual(report,{executionContext:'standalone-app-server',status:'unverified',reason:'app-session-context-unverified',verified:false});
  assert(!JSON.stringify(report).includes('synthetic'));
  assert.equal(browserContextReport({}).status,'unavailable');
});
