import {collections} from './model';

type Row={id:string;[key:string]:unknown};
type Read=(name:string)=>Promise<Row[]>;
const fingerprint=(rows:Row[])=>JSON.stringify(rows.map(row=>Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b)))).sort((a,b)=>String(a.id).localeCompare(String(b.id))));

/** Immutable history brackets all record reads, so a concurrent atomic edit triggers a retry. */
export async function readStableExport(read:Read,checkSession:()=>void,isOwner:boolean) {
  const boundary=async()=>({history:await read('history'),...(isOwner?{members:await read('members')}:{})});
  for(let attempt=0;attempt<3;attempt++) {
    checkSession();
    const before=await boundary();
    checkSession();
    const records=Object.fromEntries(await Promise.all(collections.map(async name=>[name,await read(name)])));
    const after=await boundary();
    checkSession();
    if(fingerprint(before.history)===fingerprint(after.history)&&fingerprint(before.members??[])===fingerprint(after.members??[]))return {...records,...after};
  }
  throw Error('Planning changed while exporting. Please try again when the current edits are saved.');
}
