# PC-managed Cast bridge

`companion/src/cast.mjs` owns a persistent Python JSON-lines worker (`cast-bridge.py`) and the Default Media Receiver. The PTI PWA calls authenticated HTTPS companion routes for discovery/control. It does not need to load the browser Cast sender SDK. The PC keeps checking actual receiver state while a phone sleeps.

This module **does not enable HTTP media**, install CA trust, alter the firewall, install a service, or create an HTTP endpoint. Configured media origins require HTTPS by default. The parent can opt into HTTP only with the owner's explicit approval of the documented home-LAN tradeoff.

## Interface

```javascript
const cast = new CastBridge({
  progressStore, tickets,
  mediaOrigins: ['https://onepiece.local:8796'],
  allowHttpMedia: false,
  pythonExecutable: 'python',
  toolsPath: 'H:/PTI-OnePiece/pilot/tools/python',
  pollMs: 2000,
  onState: async (context, state) => {},
  onEpisodeChanged: async (context, episodeId) => {},
  onDisplaced: async (oldContext) => {},
});

// Server-derived context; never accept these authority values from an
// unauthenticated request or substitute another profile's lease.
const context = {uid, sessionId, generation, authorityEpoch, receiverId};
await cast.discover(); // [{receiverId: UUID, name, model, owned, busy, available}]
await cast.load({
  ...context,
  episode: {episodeId, mediaUrl, subtitleUrl, contentType, durationSeconds},
  positionSeconds: 600,
  takeover: false,
});
await cast.queue(context, {episodes: [nextEpisodeDescriptor]});
await cast.command(context, {action: 'pause'});
await cast.command(context, {action: 'play'});
await cast.command(context, {action: 'seek', value: 120});
await cast.command(context, {action: 'volume', value: 0.4});
await cast.command(context, {action: 'subtitles', value: true});
await cast.command(context, {action: 'next'});
await cast.status(context);
const actual = await cast.disconnect(context); // actual position for local handoff
await cast.revokeSession(sessionId);
await cast.close();
```

`contentType` is `video/mp4`, `application/vnd.apple.mpegurl`, or `application/x-mpegurl`; duration comes from the trusted prepared episode descriptor. The media engine must select Japanese audio and the full-English subtitle source before delegating URLs. The bridge sets English WebVTT track 1 active on every item; it cannot establish source language by looking at an opaque URL.

Only configured `.local` or RFC1918 IPv4 origins are admitted. URL paths must be canonical `/m/<192-bit-base64url-ticket>/<one-piece-NNNN>/<encoded-resource>` with no credentials, query, or fragment. Both media and subtitle capabilities are checked against `TicketStore` for profile UID, session ID, generation, authority epoch, episode, exact resource, and `destination: 'cast'`. A discovered UUID selects the TV; an arbitrary IP or friendly-name input cannot select a target.

## Required server wiring and ownership

1. Authenticate family membership on the HTTPS API. Claim or deliberately hand off the profile lease to `destination: 'cast'`, then mint capabilities carrying the resulting epoch. Call `load` only with that server-derived lease and media descriptor. If Cast admission fails, the API must restore the intended local destination explicitly and mint fresh local capabilities.
2. Wire both `ProgressStore.onRevoke` and `onAuthorityChange` to revoke the old capabilities and call `cast.revokeSession(sessionId)`. The bridge's revocation path deliberately avoids its receiver-operation lock so these callbacks cannot deadlock the progress store's serialized writer.
3. Wire `onDisplaced` to release the displaced viewing session's media/cache resources and settle that old profile's lease. Loading another profile on an occupied TV requires the explicit `takeover: true` owner action. Unrelated apps/media are preserved without that action.
4. `disconnect` reads the receiver again, saves its position as receiver authority, and stops only the captured owned receiver session. Then switch the lease back to local, increment its authority epoch, and mint local media. The PWA resumes from the returned **actual** position. Late receiver frames cannot write through the old epoch.
5. Shut down with `await cast.close()` before ending the companion. A worker crash loses its in-memory ownership; restart must not silently adopt an unknown receiver session. Reconnect reads actual state first and requires renewed explicit admission if ownership was lost.

Ownership requires both the exact receiver session ID and a known opaque media UID/URL digest. A remote user changing apps or media drops ownership; the bridge stops writing receiver progress and rejects further controls. Cleanup targets the captured receiver session ID, not whatever app is currently running. No fixed/default volume is applied on load.

The Python library's `MediaController.update_status()` can auto-launch its supported receiver if a foreign app is active. This implementation checks the actual receiver app first and never invokes that path for unrelated apps. mDNS discovery remains active through initial socket/service resolution, then is closed.

## Progress and queue behavior

Every poll/control acknowledgment revalidates the original generation and authority epoch. It uses actual receiver position and the trusted episode duration, then calls `ProgressStore.record` with `authority: 'receiver'` and the next current lease revision. Acknowledged rewinds remain valid. Polling renews the cast lease through progress records while the sender sleeps. Receiver FINISHED status sometimes reports time zero; the bridge records the known duration and watched state instead of resetting completed progress to zero.

Only one consecutive next episode can be queued. Missing episode 590 and episodes absent from the catalogue are rejected. Queue items explicitly activate English track 1, use `preloadTime: 0`, and do not repeat. The media coordinator must authorize/prepare the next descriptor and transition resources when its master is requested. Actual receiver media identity selects the progress episode after a natural or commanded transition. The previous media identity is pruned from ownership memory. `onEpisodeChanged` lets the parent settle episode transitions; queue admission is not proof of full-length playback or phone-sleep behavior.

Status responses and callbacks contain receiver UUID, canonical episode, playback state, actual position/duration, subtitle state, and volume/mute. They never return capability URLs or internal receiver session IDs. URLs go only over private inherited stdin; they are absent from executable arguments, worker environment, stdout, and logs. The worker does not persist credentials or media. Malformed/oversized IPC and subprocess failure return sanitized error codes.

## Verification and gaps

Thirteen fixture checks passed: origin/path validation; ticket profile/generation/epoch/destination denial; receiver-authoritative rewind; delayed-load handoff; stale poll preserving new local capabilities; explicit busy-TV takeover; consecutive queue/missing episode; foreign ownership; natural-end position; revocation callback deadlock; private IPC/error sanitization; and isolated Python ownership/foreign-app safety. Run:

```powershell
node --test apps/one-piece/companion/test/cast-bridge.test.mjs apps/one-piece/companion/test/cast-transport.test.mjs
python -m py_compile apps/one-piece/companion/src/cast-bridge.py
```

A real **read-only** Node→Python discovery found the Sony Bedroom TV / BRAVIA VU31 available. It did not launch an app, load media, or change volume. Earlier technical pilots proved actual Japanese/English short clips and receiver controls; those are separate from this production bridge.

Production loading, queue transitions, actual control acknowledgments, reconnection after phone sleep, and an end-to-end authenticated PTI flow still need bounded hardware QA after the transport decision is approved. Android tablet/mobile behavior remains a separate end-to-end gate. Python runtime dependencies are the existing isolated `pychromecast==14.0.10` and `zeroconf==0.151.5`; no npm dependency was added for this bridge.
