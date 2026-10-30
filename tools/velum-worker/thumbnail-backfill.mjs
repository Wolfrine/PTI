import {readFile,writeFile} from 'node:fs/promises';

// One finite walk, at most one local original per idle pass. No remote original
// downloads, GPU loading, deletions, full-history subscriptions or repeated scans.
export class ThumbnailBackfill {
 constructor(file,{page,publish,load,hasThumbnail}){this.file=file;this.page=page;this.publish=publish;this.load=load;this.hasThumbnail=hasThumbnail;this.state=null;}
 async save(){await writeFile(this.file,JSON.stringify(this.state));}
 async step(){
  if(!this.state){
   try{this.state=JSON.parse(await readFile(this.file,'utf8'));}
   catch(error){if(error.code!=='ENOENT')throw error;this.state={version:1,cursor:'',pending:[],done:false,unavailableCount:0};}
   if(this.state.version!==1||!Array.isArray(this.state.pending)||typeof this.state.cursor!=='string')throw new Error('invalid-thumbnail-backfill');
  }
  if(this.state.done&&!this.state.pending.length)return;
  if(!this.state.pending.length){
   const page=await this.page(this.state.cursor);
   this.state.pending=page.items.filter(item=>item.job.status==='completed').map(item=>({id:item.id,job:Object.fromEntries(['model','seed','width','height','createdAt','result'].map(key=>[key,item.job[key]]))}));
   this.state.cursor=page.cursor||this.state.cursor;this.state.done=page.count<24;await this.save();
  }
  const item=this.state.pending[0];if(!item)return;
  if(!await this.hasThumbnail(item.id)){
   const output=await this.load(item.id,item.job);
   if(output)await this.publish(item,output);
   else{this.state.unavailableCount++;this.state.lastUnavailable={id:item.id,reason:'local-original-unavailable'};}
  }
  this.state.pending.shift();await this.save();
 }
 async recordError(){if(this.state){this.state.lastError={at:Date.now(),reason:'thumbnail-backfill-unavailable'};await this.save();}}
}
