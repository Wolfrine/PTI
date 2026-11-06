import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserContextPreflight,browserContextInstructions} from '../src/browser-context.mjs';

test('missing, blank or partial app-session context reports browser unavailability without exposing values',()=>{
  for(const env of [{},{BROWSER_USE_ACCESS_PIPE_PATH:' '},{BROWSER_USE_ACCESS_PIPE_PATH:'SYNTHETIC_PIPE'},{BROWSER_USE_ACCESS_VERIFYING_IDENTITY:'SYNTHETIC_IDENTITY'}]){
    const context=browserContextPreflight(env);
    assert.equal(context.status,'unavailable');assert.equal(context.verified,false);
    assert.equal(context.reason,Object.values(env).some(value=>value.trim())?'incomplete-app-session-context':'missing-app-session-context');
    const instructions=browserContextInstructions(context);
    assert.match(instructions,/Do not initialize browser tools/);
    assert.match(instructions,/Continue independently possible coding, CLI/);
    assert.match(instructions,/@Chrome/);assert.match(instructions,/Remote/);
    assert.match(instructions,/immediately/);assert.match(instructions,/no automatic app-owned session routing/);
    assert(!JSON.stringify({context,instructions}).includes('SYNTHETIC_'));
  }
});

test('both inherited prerequisites remain unverified, never full browser access or policy bypass',()=>{
  const env={BROWSER_USE_ACCESS_PIPE_PATH:'SYNTHETIC_PIPE',BROWSER_USE_ACCESS_VERIFYING_IDENTITY:'SYNTHETIC_IDENTITY'};
  const context=browserContextPreflight(env);
  assert.equal(context.status,'unverified');assert.equal(context.verified,false);
  assert.equal(context.reason,'app-session-context-unverified');
  const instructions=browserContextInstructions(context);
  assert.match(instructions,/Only an available official browser tool/);
  assert.match(instructions,/stop that browser step without retrying/);
  assert.match(instructions,/Do not copy, forge, recover or inject/);
  assert.match(instructions,/raw Playwright\/CDP/);
  assert(!JSON.stringify({context,instructions}).includes('SYNTHETIC_'));
  assert.deepEqual(env,{BROWSER_USE_ACCESS_PIPE_PATH:'SYNTHETIC_PIPE',BROWSER_USE_ACCESS_VERIFYING_IDENTITY:'SYNTHETIC_IDENTITY'});
});
