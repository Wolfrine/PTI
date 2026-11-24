import { createHash } from 'node:crypto';
import type { DocumentReference } from 'firebase-admin/firestore';
import { z } from 'zod';
import { FinanceError } from './finance-contract.js';

const slug=z.string().regex(/^[a-z][a-z0-9-]{7,79}$/);
const text=(max:number)=>z.string().trim().min(1).max(max)
  .refine(v=>!/[\p{Cc}\p{Cf}<>]|\b\d{9,}\b/iu.test(v),'Remove credentials, long identifiers and markup.');
const month=z.string().regex(/^20\d\d-(0[1-9]|1[0-2])$/);
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const source=z.discriminatedUnion('type',[
  z.object({type:z.literal('ledger_month'),id:month,label:text(90)}).strict(),
  z.object({type:z.literal('statement_window'),id:digest,label:text(90)}).strict(),
  z.object({type:z.literal('project_discussion'),date:z.iso.date(),label:text(90)}).strict(),
]);
export const publicationInput=z.object({
  id:slug,kind:z.enum(['report','decision','plan','insight','tracking']),
  status:z.enum(['published','provisional','watching','resolved']),
  title:text(100),summary:text(700),
  asOf:z.iso.date(),topic:text(60),
  points:z.array(z.object({heading:text(90),text:text(1700)}).strict()).min(1).max(10),
  sources:z.array(source).min(1).max(12),
  supersedes:slug.optional(),
}).strict().refine(v=>v.supersedes!==v.id);

export type PublicationInput=z.output<typeof publicationInput>;
const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function publishFinancePublication(root:DocumentReference,input:PublicationInput){
  const ref=root.collection('publications').doc(input.id),fp=fingerprint(input);
  return root.firestore.runTransaction(async tx=>{
    const existing=await tx.get(ref);
    if(existing.exists){
      if(existing.get('contentDigest')!==fp)throw new FinanceError('revision_conflict');
      return {ok:true,id:input.id,replay:true,publishedAt:existing.get('publishedAt')};
    }
    // A report may cite a project conversation, but claims of ledger evidence
    // must refer to actual existing owner-scoped Finance records.
    const references=input.sources.filter(s=>s.type!=='project_discussion');
    for(const s of references){
      const where=s.type==='ledger_month'?'months':'sourceWindows';
      const source=await tx.get(root.collection(where).doc(s.id));
      if(!source.exists)throw new FinanceError('not_found');
    }
    if(input.supersedes){
      const prior=await tx.get(root.collection('publications').doc(input.supersedes));
      if(!prior.exists)throw new FinanceError('not_found');
    }
    const publishedAt=new Date().toISOString();
    tx.create(ref,{...input,contentDigest:fp,publishedAt,author:'Finance project',updatedAt:publishedAt});
    return {ok:true,id:input.id,replay:false,publishedAt};
  });
}
