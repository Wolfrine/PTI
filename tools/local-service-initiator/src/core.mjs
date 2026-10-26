import path from 'node:path';

export const VERSION = '1.1.0';
export const FAILURES = new Set(['start_failed','model_unavailable','port_in_use','configuration_invalid','worker_start_timeout','companion_start_timeout']);
export function validateSettings(value) {
  if (value?.workerId !== 'sachit-windows') throw Error('configuration_invalid');
  const url = new URL(value.gateway);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !['https://gtop-question-papers.web.app/api','https://us-central1-gtop-app.cloudfunctions.net/gtopAssistantGateway'].includes(url.href.replace(/\/$/,''))) throw Error('configuration_invalid');
  for (const name of ['workerConfig','controllerRoot','ollamaExecutable','modelDirectory','stateDirectory','helperExecutable','workerNodeExecutable']) {
    if (typeof value[name] !== 'string' || !path.win32.isAbsolute(value[name]) || /[\r\n\0]/.test(value[name])) throw Error('configuration_invalid');
  }
  if (path.win32.resolve(value.stateDirectory).toLowerCase() !== 'f:\\workspace\\support\\pti\\local-service-initiator\\data') throw Error('configuration_invalid');
  if (path.win32.resolve(value.workerNodeExecutable).toLowerCase() !== 'f:\\workspace\\support\\pti\\local-service-initiator\\runtime\\node.exe' || !path.win32.resolve(value.helperExecutable).toLowerCase().startsWith('f:\\workspace\\support\\pti\\local-service-initiator\\releases\\')) throw Error('configuration_invalid');
  if (value.onePieceEnabled !== undefined && typeof value.onePieceEnabled !== 'boolean') throw Error('configuration_invalid');
  return value;
}

/** Remote input selects one fixed capability. It never supplies an executable or arguments. */
export class Initiator {
  constructor({api,read,write,start,workerRunning,now=()=>Date.now()}) { Object.assign(this,{api,read,write,start,workerRunning,now}); }
  async tick() {
    const prior = await this.read() || {};
    const result = await this.api({version:VERSION,workerRunning:await this.workerRunning(),...(prior.result?{lastStartResult:prior.result}:{})});
    const request = result.request;
    if (!request) return result.service;
    if (request.action !== 'start' || !/^[A-Za-z0-9_-]{1,160}$/.test(request.id || '') || !Number.isFinite(Date.parse(request.expiresAt)) || Date.parse(request.expiresAt) <= this.now()) return result.service;
    if (prior.requestId === request.id) {
      // A crash after recording the attempt must not issue a second launch.
      if (!prior.result) {
        const running = await this.workerRunning(true);
        await this.write({requestId:request.id,result:{requestId:request.id,state:running?'started':'failed',...(!running?{errorCode:'worker_start_timeout'}:{})}});
      }
      return result.service;
    }
    await this.write({requestId:request.id,attemptedAt:new Date(this.now()).toISOString()});
    let outcome;
    try { await this.start(); outcome={requestId:request.id,state:'started'}; }
    catch(error) { outcome={requestId:request.id,state:'failed',errorCode:FAILURES.has(error.message)?error.message:'start_failed'}; }
    await this.write({requestId:request.id,result:outcome});
    // Report promptly, but retain the acknowledgement until a later successful poll.
    return (await this.api({version:VERSION,workerRunning:await this.workerRunning(),lastStartResult:outcome})).service;
  }
}
