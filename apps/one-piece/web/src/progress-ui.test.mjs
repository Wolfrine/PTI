import test from 'node:test';
import assert from 'node:assert/strict';
import {progressRecoveryNotice,dialogContent} from './views.mjs';

test('queued progress offers a real save/check action without claiming cloud loss',()=>{
 const online=progressRecoveryNotice({pendingProgressCount:1,network:'online'});
 assert.match(online,/saved on this device/);assert.match(online,/data-action="retry-progress"/);assert.match(online,/Retry save/);
 assert.doesNotMatch(online,/Reconnect|Google|Firestore|stuck|last position is still syncing/);
 const offline=progressRecoveryNotice({pendingProgressCount:1,network:'offline'});
 assert.match(offline,/Check connection/);assert.match(offline,/Buffered video can keep playing/);assert.match(offline,/new episodes need the PC/);
 assert.match(progressRecoveryNotice({pendingProgressCount:1,network:'online',progressRetrying:true}),/data-action="retry-progress" disabled/);
 assert.equal(progressRecoveryNotice({pendingProgressCount:0,resumeConflicts:[]}), '');
 const check=progressRecoveryNotice({progressRetryError:true,network:'online'});
 assert.match(check,/could not be checked/);assert.match(check,/Check saved place/);assert.doesNotMatch(check,/need review|Retry save/);
 const storage=progressRecoveryNotice({pendingProgressCount:1,progressRetryError:'device-storage-unavailable',network:'online'});
 assert.match(storage,/Keep this page open/);assert.doesNotMatch(storage,/place is saved on this device/);
});

test('saved-place recovery identifies the episode and keeps conflicting positions explicit',()=>{
 const entries=[{id:'old',episodeId:'one-piece-0050',positionSeconds:1400,savedPosition:1391},{id:'latest<&"',episodeId:'one-piece-0050',positionSeconds:20,savedPosition:1391}];
 const html=progressRecoveryNotice({resumeConflicts:entries,network:'online'});
 assert.match(html,/Episode 50/);assert.match(html,/Review episode 50/);assert.equal((html.match(/data-action="review-progress"/g)??[]).length,1);
 assert.match(html,/data-id="latest&lt;&amp;&quot;"/);assert.match(html,/open other episodes/);
 const dialog=dialogContent({dialog:'resume-conflict',resumeConflict:entries[1]});
 assert.match(dialog,/Use this device · 0:20/);assert.match(dialog,/Use home PC · 23:11/);
 assert.match(dialog,/Keep for later/);assert.match(dialog,/data-action="retry-progress"/);
 assert.doesNotMatch(dialogContent({dialog:'resume-conflict',resumeConflict:{episodeId:'one-piece-0050',positionSeconds:20}}),/Use home PC/);
});
