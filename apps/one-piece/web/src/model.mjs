import { getSeason, seasonForEpisode } from './seasons.mjs';

export const episodeId = number => `one-piece-${String(number).padStart(4,'0')}`;
export const episodeNumber = id => Number(/^one-piece-(\d{4})$/.exec(id??'')?.[1]);
export const escapeHtml = value => String(value??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function time(seconds) {
 const n=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));
 return n>=3600?`${Math.floor(n/3600)}:${String(Math.floor(n%3600/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`:`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
}
export const bytes = value => !Number.isFinite(value)?'':value>=1000000000?`${(value/1000000000).toFixed(1)} GB`:`${Math.round(value/1000000)} MB`;
export function initialSeason({requestedEpisode,requestedSeason,requestedRange,savedSeason,legacyRange}={}) {
 const integer=value=>typeof value==='number'&&Number.isInteger(value)?value:typeof value==='string'&&/^[1-9]\d*$/.test(value)?Number(value):NaN;
 for(const [kind,value] of [['episode',requestedEpisode],['season',requestedSeason],['episode',requestedRange],['season',savedSeason],['episode',legacyRange]]){
  const number=integer(value);
  if(kind==='season'){if(getSeason(number).number===number)return number;}
  else if(number>=1&&number<=1085){const season=seasonForEpisode(number);if(season)return season.number;}
 }
 return 1;
}
export function selectLibrarySeason(state,number,href) {
 state.season=getSeason(number).number;state.query='';state.requestedEpisode=null;state.requestedSeason=null;state.requestedRange=null;
 const url=new URL(href);
 for(const key of ['episode','range','season'])url.searchParams.delete(key);
 if(url.hash==='#player')url.hash='';
 return url.pathname+url.search+url.hash;
}
export function visibleEpisodes(episodes,{query='',season,range,showTitles=false}={}) {
 const term=query.trim().toLowerCase();
 if(!term){const selected=getSeason(initialSeason({savedSeason:season,legacyRange:range}));return episodes.filter(e=>e.episodeNumber>=selected.start&&e.episodeNumber<=selected.availableEnd);}
 const number=/^(?:episode\s*)?0*(\d{1,4})$/.exec(term)?.[1];
 return episodes.filter(e=>number?e.episodeNumber===Number(number):showTitles&&e.title&&e.titleProvenance&&e.title.toLowerCase().includes(term));
}
export function nextBoundary(number) { return number===589?'missing':number>=1085?'ended':'next'; }
export function latestResume(progress={},lastEpisodeId) {
 if(lastEpisodeId&&progress[lastEpisodeId]&&!progress[lastEpisodeId].watched)return progress[lastEpisodeId];
 return Object.values(progress).filter(p=>p&&typeof p==='object'&&!p.watched&&Number.isFinite(p.positionSeconds)&&p.positionSeconds>0).sort((a,b)=>b.updatedAt-a.updatedAt)[0]??null;
}
export function safeLocalProgress(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 return Object.fromEntries(Object.entries(value).filter(([id,p])=>{
  const number=episodeNumber(id);return number>=1&&number<=1085&&number!==590&&p&&p.episodeId===id&&Number.isFinite(p.positionSeconds)&&Number.isFinite(p.durationSeconds)&&p.durationSeconds>0&&p.durationSeconds<=21600&&p.positionSeconds>=0&&p.positionSeconds<=p.durationSeconds;
 }).slice(0,1084));
}
export const validPendingEvent=e=>e&&typeof e==='object'&&/^one-piece-\d{4}$/.test(e.episodeId??'')&&episodeNumber(e.episodeId)>=1&&episodeNumber(e.episodeId)<=1085&&episodeNumber(e.episodeId)!==590&&Number.isSafeInteger(e.generation)&&e.generation>0&&Number.isSafeInteger(e.authorityEpoch)&&e.authorityEpoch>0&&Number.isFinite(e.positionSeconds)&&e.positionSeconds>=0&&e.positionSeconds<=21600&&['heartbeat','pause','seek','restart','ended','transition','mark-watched'].includes(e.reason)&&(e.revision===undefined||Number.isSafeInteger(e.revision)&&e.revision>0);
export const shouldAutoplayDelivery=({requested,existingPaused}={})=>typeof requested==='boolean'?requested:typeof existingPaused==='boolean'?!existingPaused:true;
export const phaseLabel = state => ({queued:'Waiting for preparation',preparing:'Starting preparation',downloading:'Downloading episode',retrying:'Retrying the source',verifying:'Checking the episode',cached:'Opening prepared episode',inspecting:'Checking audio and subtitles','preparing-subtitles':'Preparing English subtitles','preparing-playback':'Preparing playback',ready:'Ready','storage-paused':'Waiting for space','waiting-for-space':'Waiting for space',error:'Preparation interrupted'}[state]??'Preparing episode');
export function errorCopy(code) {
 const labels={
  'delivery-type-unsupported':['This video format could not be opened','The home PC returned an unsupported video format. Retry playback.'],
  'active-session':['Already watching on another device','Taking over will stop the other session for your account.'],
  'viewer-reauthentication-required':['Reconnect your account','Sign in again to allow your home PC to keep playback working while your phone sleeps.'],
  'viewer-not-paired':['Connect your account to the home PC','A one-time Google confirmation lets the home PC prepare and play your episodes.'],
  'viewer-credential-unavailable':['The account connection could not be checked','The PC could not read its saved account access. Retry shortly; repeated Google confirmation will not fix a temporary PC error.'],
  'viewer-identity-unavailable':['The account service is temporarily unavailable','Your PC could not contact the account service. Retry shortly. Your saved place is kept.'],
  'companion-setup-required':['Set up the home PC','The PC needs to be paired with the family owner before anyone can watch.'],
  'not-invited':['This account has not been invited','Ask the family owner to invite the Google account shown here.'],
  'member-inactive':['Access is paused','Ask the family owner to check this account’s invitation.'],
  'session-replaced-or-expired':['Your viewing session has ended','It may have been replaced on another device. Open the episode again to continue.'],
  'cast-tv-busy':['The TV is already in use','Choose another screen or explicitly take over this TV.'],
  'cast-unavailable':['The TV is not responding','Check that the TV and home PC are on the same home network, then try again.'],
  'SOURCE_RATE_LIMIT':['The source needs a pause','Wait a little, then retry. Your place is saved.'],
  'SOURCE_TIMEOUT':['The source is taking too long','Retry preparation when the connection recovers. Your place is saved.'],
  'CACHE_PRESSURE':['The home PC needs some space','Active episodes are protected. Retry after another viewing session ends.'],
  'PREPARATION_FAILED':['Episode preparation was interrupted','Retry preparation, or return to the library while the connection recovers.'],
  'DISK_PRESSURE':['The home PC is low on space','Preparation paused safely. Retry after space is available.'],
  'episode-missing':['Episode 590 is unavailable','It is missing from the supplied collections. You can choose to continue with episode 591.'],
  'episode-unavailable':['These collections have ended','Episodes after 1085 are outside this library.'],
 };
 return labels[code]??['We could not continue playback','Check the home connection and try again. Your saved place is kept.'];
}
