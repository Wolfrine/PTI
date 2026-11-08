import {z} from 'zod';

// This is evidence about an independent worker, never a desktop-session grant.
export const browserContextSchema=z.object({
  executionContext:z.literal('standalone-app-server'),
  status:z.enum(['unavailable','unverified']),
  reason:z.enum(['missing-app-session-context','incomplete-app-session-context','app-session-context-unverified']),
  verified:z.literal(false),
}).strict();
export const HOST_VERSION='0.4.8';
export const desktopHandoff='This report describes only the standalone relay process. It does not observe or deny the calling chat or any desktop-owned session. First inspect the current callable official browser tools and use their normal permission checks. For owner-authorized work, use an available app-native continuation tool to continue the SAME existing project/module chat after its bridge writer finishes. The relay itself cannot activate an app-owned session; an ordinary mobile plugin chat is not proven to have that continuation tool. If it is absent, identify that exact missing route without claiming the whole PC lacks Chrome control. PTI Owner Chrome and interactive-QA records are not prerequisites. Never copy browser pipes/identities or bypass an actual tool denial.';

export function interactiveCapabilities(worker:{version:string;at:number;dispatchReady?:boolean;browser_context?:z.infer<typeof browserContextSchema>}|undefined,now:number) {
  const online=!!worker&&worker.dispatchReady!==false&&now>=worker.at&&now-worker.at<=60000;
  const reportsContext=!!worker&&/^0\.4\.(?:[89]|[1-9]\d+)$/.test(worker.version);
  const context=browserContextSchema.safeParse(reportsContext?worker?.browser_context:undefined);
  const reason=!online?'worker-offline-or-stale':!context.success?'worker-context-not-reported':context.data.reason;
  const observedAt=worker?new Date(worker.at).toISOString():null;
  const capability=(state:string,reason:string,route='manual-desktop-session')=>({
    scope:'standalone-relay-process-only',
    state,provider:route==='none'?'none':'official-desktop-manual',authorizationProofKind:'none',authorized:false,
    route,reason,observedAt,nextStep:desktopHandoff,
    limits:{automaticActivation:false,foregroundOperators:1,policyBypass:false},
  });
  return {schemaVersion:1,hostVersion:HOST_VERSION,workerVersion:worker?.version||null,online,
    scope:'standalone-relay-process-only',
    interpretation:'authorized=false and automaticActivation=false describe this relay process only. They are not a global Chrome/Desktop denial, a missing owner permission, or proof that an app-owned continuation failed. Legacy provider/route labels below describe the relay handoff, not a required manual navigation step.',
    callerSession:{state:'not-observed',authorized:null,automaticActivation:null,verification:'Use the actual official tools available in the calling chat.'},
    historyScope:'Bridge task summaries cover bridge generations only. Read current native chat history before comparing them with later app-owned work.',
    evaluatedAt:new Date(now).toISOString(),observedAt,executionContext:'standalone-app-server',
    officialProgrammaticSessionProviderSupported:false,canPlayWithAudio:false,
    desktop:capability('requires_handoff','no-verified-desktop-session-provider'),
    browser:{...capability('requires_handoff',reason),workerContextState:context.success?context.data.status:'unverified'},
    audio:{playback:capability('unverified','speaker-output-not-observed'),
      capture:capability('unsupported','no-authorized-audio-capture-provider','none'),
      analysis:capability('unsupported','no-audio-perception-provider','none')},
    nextStep:desktopHandoff,
  };
}
