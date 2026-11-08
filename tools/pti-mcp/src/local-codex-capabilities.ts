import {z} from 'zod';

// This is evidence about an independent worker, never a desktop-session grant.
export const browserContextSchema=z.object({
  executionContext:z.literal('standalone-app-server'),
  status:z.enum(['unavailable','unverified']),
  reason:z.enum(['missing-app-session-context','incomplete-app-session-context','app-session-context-unverified']),
  verified:z.literal(false),
}).strict();
export const HOST_VERSION='0.4.9';
export function desktopQueueWorker(version:string){const [major,minor,patch]=version.split('.').map(Number);return major>0||minor>4||minor===4&&patch>=12;}
export const desktopHandoff='This report describes only the standalone relay process, not a denial of desktop-owned Chrome. For owner-authorized browser work with worker 0.4.12 or later, call continue_desktop_chat with the exact existing module parent, its catalog project and the authorized prompt. It opens the existing desktop chat through the supported app link and official Codex queue. Poll its handoff operation, then read_codex_thread for the exact native turn and actual completed outcome. The existing chat keeps its model, permissions and official tool checks. No new chat, PTI Owner Chrome grant or QA broker is needed. Never copy browser identities or bypass an actual tool denial.';

export function interactiveCapabilities(worker:{version:string;at:number;dispatchReady?:boolean;browser_context?:z.infer<typeof browserContextSchema>}|undefined,now:number) {
  const online=!!worker&&worker.dispatchReady!==false&&now>=worker.at&&now-worker.at<=60000;
  const reportsContext=!!worker&&/^0\.4\.(?:[89]|[1-9]\d+)$/.test(worker.version);
  const context=browserContextSchema.safeParse(reportsContext?worker?.browser_context:undefined);
  const reason=!online?'worker-offline-or-stale':!context.success?'worker-context-not-reported':context.data.reason;
  const observedAt=worker?new Date(worker.at).toISOString():null;
  const queueSupported=online&&desktopQueueWorker(worker!.version);
  const capability=(state:string,reason:string,route='manual-desktop-session')=>({
    scope:'standalone-relay-process-only',
    state,provider:route==='none'?'none':'official-desktop-manual',authorizationProofKind:'none',authorized:false,
    route,reason,observedAt,nextStep:desktopHandoff,
    limits:{automaticActivation:false,foregroundOperators:1,policyBypass:false},
  });
  const queuedDesktop={scope:'existing-desktop-chat-handoff',state:'available',provider:'official-codex-desktop',authorizationProofKind:'native-tool-checks',authorized:null,
    route:'continue_desktop_chat',reason:'official-queue-and-app-link-supported',observedAt,nextStep:desktopHandoff,
    limits:{automaticActivation:true,createsChat:false,policyBypass:false},authorizationNotice:'Dispatch is supported; the existing desktop chat enforces its own permissions. Authorization for a specific action is not inferred from this health report.'};
  return {schemaVersion:1,hostVersion:HOST_VERSION,workerVersion:worker?.version||null,online,
    scope:'relay-and-existing-desktop-chat-handoff',
    interpretation:'Desktop/browser availability describes the automatic handoff route when installed. authorized:null means the destination chat performs the actual native permission checks, not that owner consent is missing. Standalone relay and audio flags do not deny the desktop chat.',
    callerSession:{state:'not-observed',authorized:null,automaticActivation:null,verification:'Use the actual official tools available in the calling chat.'},
    desktopHandoff:{supported:queueSupported,tool:'continue_desktop_chat',provider:'official-codex-queue-and-desktop-link',automaticDispatch:queueSupported,createsChat:false,requiresExistingChat:true,nativePermissions:'preserved',completion:'Read the exact native turn; a handoff receipt is not work completion.'},
    historyScope:'Bridge task summaries cover bridge generations only. Read current native chat history before comparing them with later app-owned work.',
    evaluatedAt:new Date(now).toISOString(),observedAt,executionContext:'standalone-app-server',
    officialProgrammaticSessionProviderSupported:queueSupported,createsNewDesktopSession:false,canPlayWithAudio:false,
    desktop:queueSupported?queuedDesktop:capability('requires_handoff','upgrade-worker-for-automatic-handoff'),
    browser:{...(queueSupported?queuedDesktop:capability('requires_handoff',reason)),workerContextState:context.success?context.data.status:'unverified'},
    audio:{playback:capability('unverified','speaker-output-not-observed'),
      capture:capability('unsupported','no-authorized-audio-capture-provider','none'),
      analysis:capability('unsupported','no-audio-perception-provider','none')},
    nextStep:desktopHandoff,
  };
}
