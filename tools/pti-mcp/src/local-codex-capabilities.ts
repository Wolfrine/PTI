import {z} from 'zod';

export const HOST_VERSION='0.5.0';
// Helper diagnostics are not a native browser authorization decision.
export const browserContextSchema=z.object({
  executionContext:z.literal('standalone-app-server'),status:z.enum(['unavailable','unverified']),
  reason:z.enum(['missing-app-session-context','incomplete-app-session-context','app-session-context-unverified','official-tool-discovery-required']),verified:z.literal(false),
}).strict();
export function transportCapabilities(worker:{version:string;at:number;dispatchReady?:boolean;nativeControls?:boolean;nativePlan?:boolean}|undefined,now:number) {
  const online=!!worker&&worker.dispatchReady!==false&&now>=worker.at&&now-worker.at<=60000;
  return {hostVersion:HOST_VERSION,workerVersion:worker?.version||null,
    online,nativeControls:online&&worker?.nativeControls===true,
    nativePlan:online&&worker?.nativeControls===true&&worker.nativePlan===true,
    transport:'authenticated-request-and-observation',nativeExecution:'Codex owns sessions, tools, approvals, concurrency and scheduling.',
    browserAuthorization:'Use official tools in the current native conversation. Helper diagnostics do not grant or deny browser access.',
    delivery:'Each request generation is offered once. Ambiguous dispatch is observed and never automatically replayed.'};
}
