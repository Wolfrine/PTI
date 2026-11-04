import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {ResourceSampler,readGpu,GPU_TIMEOUT_MS} from './resources.mjs';

test('CPU uses interval deltas and RAM uses actual host byte readings',async()=>{
 let idle=100,total=300;
 const system={cpus:()=>[{times:{idle,user:total-idle}}],totalmem:()=>32000,freemem:()=>12000};
 const sampler=new ResourceSampler({system,now:()=>123,gpu:async()=>({gpuUtilPercent:35,vramUsedMiB:3000,vramTotalMiB:8192,gpuTempC:62})});
 idle+=25;total+=100;
 assert.deepEqual(await sampler.sample(),{sampledAt:123,cpuPercent:75,ramUsedBytes:20000,ramTotalBytes:32000,gpuUtilPercent:35,vramUsedMiB:3000,vramTotalMiB:8192,gpuTempC:62});
 const unchanged=await sampler.sample();assert.equal(unchanged.cpuPercent,null);
 idle=0;total=0;assert.equal((await sampler.sample()).cpuPercent,null);
});

test('missing OS/GPU metrics stay null and never fail an image attempt',async()=>{
 const sampler=new ResourceSampler({system:{cpus(){throw Error('unavailable');},totalmem(){throw Error('unavailable');}},gpu:async()=>{throw Error('missing');},now:()=>456});
 const metrics=await sampler.sample();assert.equal(metrics.sampledAt,456);
 for(const [key,value] of Object.entries(metrics))if(key!=='sampledAt')assert.equal(value,null,key);
});

test('nvidia-smi is fixed-argument, hidden, shell-free, bounded and tolerant of unsupported fields',async()=>{
 const execute=(file,args,options,callback)=>{
  assert.equal(file,'nvidia-smi');assert.deepEqual(args,['--id=0','--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu','--format=csv,noheader,nounits']);
  assert.equal(options.windowsHide,true);assert.equal(options.shell,false);assert.equal(options.timeout,GPU_TIMEOUT_MS);assert.equal(options.maxBuffer,4096);
  callback(null,'12, 4096, 8192, 61\n');
 };
 assert.deepEqual(await readGpu({execute}),{gpuUtilPercent:12,vramUsedMiB:4096,vramTotalMiB:8192,gpuTempC:61});
 for(const output of ['N/A, [Not Supported], 8192, N/A','101, 9000, 8192, -1','bad output','']){
  const metrics=await readGpu({execute:(_,__,___,callback)=>callback(null,output)});
  assert.equal(metrics.gpuUtilPercent,null);assert.equal(metrics.vramUsedMiB,null);assert.equal(metrics.gpuTempC,null);
 }
 const failure=await readGpu({execute:(_,__,___,callback)=>callback(Error('not installed'))});
 assert.deepEqual(failure,{gpuUtilPercent:null,vramUsedMiB:null,vramTotalMiB:null,gpuTempC:null});
});

test('a hung GPU command is killed by the real execFile timeout without rejecting metrics',{timeout:10000},async()=>{
 let killed=false;
 const execute=(_,__,options,callback)=>execFile(process.execPath,['-e','setInterval(()=>{},1000)'],options,(error,stdout)=>{killed=Boolean(error?.killed);callback(error,stdout);});
 const start=Date.now(),metrics=await readGpu({execute,timeoutMs:120});
 assert.equal(killed,true);assert.equal(metrics.gpuUtilPercent,null);assert.ok(Date.now()-start<5000);
});
