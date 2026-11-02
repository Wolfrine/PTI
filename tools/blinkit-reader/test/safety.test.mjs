import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('production browser keeps sandbox, only enables documented WebMCP and never extracts credentials',async()=>{
 const source=await readFile(new URL('../src/browser.mjs',import.meta.url),'utf8');
 assert(source.includes('chromiumSandbox:true'));assert(source.includes('--enable-features=WebMCP'));
 for(const forbidden of ['--no-sandbox','--disable-web-security','AutomationControlled','storageState(','.cookies(','.localStorage','routeFromHAR','request.post('])assert(!source.includes(forbidden));
 assert(source.includes("blinkit:['get_session','list_orders','get_order']"));
});
test('windowless launcher waits for child and uses explicit F runtime/task roots',async()=>{
 const vbs=await readFile(new URL('../run-hidden.vbs',import.meta.url),'utf8'),runner=await readFile(new URL('../run.ps1',import.meta.url),'utf8'),installer=await readFile(new URL('../install.ps1',import.meta.url),'utf8');
 assert(vbs.includes('shell.Run(command,0,True)'));assert(runner.includes('$info.CreateNoWindow=$true'));assert(installer.includes("'PTI Blinkit Reader'"));assert(installer.includes('-MultipleInstances IgnoreNew'));
 assert(installer.includes("('*'+$sid+':(OI)(CI)F')"));assert(installer.includes("'*S-1-5-18:(OI)(CI)F'"));
});
