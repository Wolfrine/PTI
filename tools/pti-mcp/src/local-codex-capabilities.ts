import {z} from 'zod';

// This is evidence about an independent worker, never a desktop-session grant.
export const browserContextSchema=z.object({
  executionContext:z.literal('standalone-app-server'),
  status:z.enum(['unavailable','unverified']),
  reason:z.enum(['missing-app-session-context','incomplete-app-session-context','app-session-context-unverified']),
  verified:z.literal(false),
}).strict();
export const HOST_VERSION='0.4.7';
export const desktopHandoff='Open ChatGPT desktop on this PC with @Chrome or @Browser for the exact QA URL, or @Computer for native interaction. From mobile, open Codex (Remote in older apps) paired to this same host. Enable Computer Use and the Chrome extension as applicable; keep Windows awake and unlocked. Obtain owner consent there, inspect the actual artifact, then report the run and captured evidence through update_interactive_qa. Never copy browser pipes/identities or bypass a URL-policy denial.';

export function interactiveCapabilities(worker:{version:string;at:number;dispatchReady?:boolean;browser_context?:z.infer<typeof browserContextSchema>}|undefined,now:number) {
  const online=!!worker&&worker.dispatchReady!==false&&now>=worker.at&&now-worker.at<=60000;
  const reportsContext=!!worker&&/^0\.4\.(?:[89]|[1-9]\d+)$/.test(worker.version);
  const context=browserContextSchema.safeParse(reportsContext?worker?.browser_context:undefined);
  const reason=!online?'worker-offline-or-stale':!context.success?'worker-context-not-reported':context.data.reason;
  const observedAt=worker?new Date(worker.at).toISOString():null;
  const capability=(state:string,reason:string,route='manual-desktop-session')=>({
    state,provider:route==='none'?'none':'official-desktop-manual',authorizationProofKind:'none',authorized:false,
    route,reason,observedAt,nextStep:desktopHandoff,
    limits:{automaticActivation:false,foregroundOperators:1,policyBypass:false},
  });
  return {schemaVersion:1,hostVersion:HOST_VERSION,workerVersion:worker?.version||null,online,
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
