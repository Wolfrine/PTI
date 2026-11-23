import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const bridge='H:/LocalCodexBridge';
const [release, revision]=process.argv.slice(2);
const expected=path.win32.resolve(bridge,'approved-tab','releases','0.2.0-'+revision.slice(0,10));
if(!/^[a-f0-9]{40}$/.test(revision)||path.win32.resolve(release)!==expected)throw Error('Unexpected release directory.');
const settings=path.join(bridge,'config.json');
const pointer=JSON.parse(fs.readFileSync(path.join(bridge,'active.json'),'utf8').replace(/^\uFEFF/,''));
const prefix='mcp_servers.pti_owner_tab.';
const slash=s=>s.replaceAll('\\','/');
const flags=[prefix+'command='+JSON.stringify(slash(pointer.nodePath)),
  prefix+'args='+JSON.stringify([slash(path.join(release,'mcp.mjs'))]),
  prefix+'enabled=true',prefix+'tool_timeout_sec=60'];
const original=fs.readFileSync(settings);
const data=JSON.parse(original.toString('utf8').replace(/^\uFEFF/,''));
const kept=[];
for(let i=0;i<(data.codexArgs||[]).length;i++){
  if(data.codexArgs[i]==='-c' && data.codexArgs[i+1]?.startsWith(prefix)){i++;continue;}
  kept.push(data.codexArgs[i]);
}
const args=kept.concat(flags.flatMap(flag=>['-c',flag]));
if(JSON.stringify(data.codexArgs)!==JSON.stringify(args)){
  const dir=path.join(bridge,'approved-tab');
  const backup=path.join(dir,'config-before-'+randomUUID()+'.json');
  fs.copyFileSync(settings,backup,fs.constants.COPYFILE_EXCL);
  const temp=path.join(dir,'config-'+randomUUID()+'.tmp');
  fs.writeFileSync(temp,JSON.stringify({...data,codexArgs:args},null,2),{flag:'wx',flush:true});
  if(!fs.readFileSync(settings).equals(original))throw Error('Worker settings changed during installation.');
  fs.renameSync(temp,settings);
}
const check=JSON.parse(fs.readFileSync(settings,'utf8').replace(/^\uFEFF/,''));
if(JSON.stringify(check.codexArgs)!==JSON.stringify(args))throw Error('Worker registration readback failed.');
for(const [key,value] of Object.entries(data))if(key!=='codexArgs'&&JSON.stringify(check[key])!==JSON.stringify(value))throw Error('Unexpected configuration change.');
console.log('Registered approved-tab tools for new Local Codex worker invocations.');
