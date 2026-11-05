import {describe,expect,it} from 'vitest';
import {belongsToExactVelumJob,redactVelumAudit} from './velum-audit.js';
const root='users/owner/velumStudio/workspace/jobs/diagnostic';
const privateFixture={prompt:'DO-NOT-RETAIN-INSTRUCTION',references:[{source:{name:'DO-NOT-RETAIN-FILENAME'}}]};
const media={index:0,data:'DO-NOT-RETAIN-MEDIA'};

describe('Velum audit privacy',()=>{
  it('redacts single before/after/input values without changing the actual data',()=>{
    const before=structuredClone(privateFixture),after={...privateFixture,status:'failed'};
    const out=redactVelumAudit(root,before,after,{path:root,data:privateFixture});
    const text=JSON.stringify(out);
    expect(text).not.toContain('DO-NOT-RETAIN');
    expect(out).toMatchObject({payloadRedactionVersion:1,before:{redacted:true},after:{redacted:true}});
    expect(before).toEqual(privateFixture);
    expect(after.prompt).toBe(privateFixture.prompt);
  });
  it('redacts batches and snapshots while preserving unrelated audit payloads',()=>{
    const chunk=root+'/inputs/0/chunks/0',other='users/owner/activities/example';
    const before={[root]:privateFixture,[chunk]:media,[other]:{name:'retained ordinary audit'}};
    const input={writes:[{operation:'create',path:root,data:privateFixture},{operation:'create',path:chunk,data:media},
      {operation:'update',path:other,data:{name:'retained ordinary audit'}}]};
    const out=redactVelumAudit([root,chunk,other].join(', '),before,null,input);
    expect(JSON.stringify(out)).not.toContain('DO-NOT-RETAIN');
    expect((out.before as any)[other]).toEqual(before[other]);
    expect((out.input as any).writes[2]).toEqual(input.writes[2]);
    expect((out.input as any).writes[1]).toMatchObject({operation:'create',path:chunk,data:{redacted:true,fields:['index','data']}});
  });
  it('keeps non-Velum audit behavior unchanged',()=>{
    const input={path:'users/owner/domains/example',data:{name:'ordinary'}};
    const before={name:'previous'},after={name:'ordinary'};
    expect(redactVelumAudit(input.path,before,after,input)).toEqual({before,after,input});
  });
  it('legacy repair matches only the exact requested job and its descendants',()=>{
    expect(belongsToExactVelumJob([root,root+'/inputs/0',root+'/inputs/0/chunks/0'].join(', '),root)).toBe(true);
    for(const target of [root+'-other',root+', users/owner/activities/example','users/other/velumStudio/workspace/jobs/diagnostic'])
      expect(belongsToExactVelumJob(target,root)).toBe(false);
    expect(belongsToExactVelumJob(root,'mcpAuditLog/example')).toBe(false);
  });
});
