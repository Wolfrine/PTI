import fs from 'node:fs';

// A latched wakeup cannot lose an event received while an API call is in flight.
export function eventWakeup(){
  let pending=false,resolve;
  return {
    wake(){pending=true;resolve?.();},
    async wait(ms){if(pending){pending=false;return;}let timer;await new Promise(done=>{resolve=done;timer=setTimeout(done,Math.max(0,ms));});clearTimeout(timer);resolve=undefined;pending=false;},
  };
}
export function watchTask(directory,changed,failed){
  const watcher=fs.watch(directory,(_event,file)=>{if(!file||file.toString()==='task.json')changed();});
  watcher.on('error',failed);
  return ()=>watcher.close();
}
