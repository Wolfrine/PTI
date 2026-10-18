/** Native video controls own their overlapping keys, including retargeted UA shadow events. */
export function handleWatchKeyboard(event,{route,dialog,destination,cast,player,command}) {
 if(event.defaultPrevented||event.ctrlKey||event.altKey||event.metaKey||dialog||route!=='watch'||/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(event.target?.tagName??''))return false;
 const space=event.code==='Space'||event.key===' ';
 const arrow=event.key==='ArrowLeft'||event.key==='ArrowRight';
 // Let the native timeline/play button act once. K/F remain app shortcuts.
 if(event.target?.tagName==='VIDEO'&&(space||arrow))return false;
 if(space||event.key==='k'){
  event.preventDefault();
  if(destination==='cast')void command(cast?.state==='PLAYING'?'pause':'play');
  else if(player){if(player.video.paused)void player.play();else player.pause();}
  return true;
 }
 if(arrow){
  event.preventDefault();const delta=event.key==='ArrowRight'?10:-10;
  if(destination==='cast'&&cast)void command('seek',Math.max(0,Math.min(cast.durationSeconds-.1,cast.positionSeconds+delta)));
  else player?.seek(player.position+delta);
  return true;
 }
 if(event.key==='f'&&destination!=='cast'){void player?.fullscreen();return true;}
 return false;
}
