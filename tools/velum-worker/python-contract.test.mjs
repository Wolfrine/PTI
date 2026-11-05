import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('CPU-only Python inference and safety contracts',()=>{
 const result=spawnSync(process.env.VELUM_TEST_PYTHON||(process.platform==='win32'?'python':'python3'),['-B','-m','unittest','qwen_test','qwen_diagnostics_test'],{
  cwd:fileURLToPath(new URL('.',import.meta.url)),windowsHide:true,encoding:'utf8',timeout:30000,
  env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},
 });
 assert.equal(result.error,undefined,result.error?.message);
 assert.equal(result.status,0,result.stderr||result.stdout);
});
