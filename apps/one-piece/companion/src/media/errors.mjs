export class MediaError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'MediaError';
    this.code = code;
    this.retryable = Boolean(options.retryable);
    this.status = options.status ?? 400;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

export function abortReason(signal) {
  if (signal?.aborted) throw signal.reason ?? new MediaError('CANCELLED', 'Preparation cancelled');
}

export function safeProgress(callback, value) {
  try { callback?.(Object.freeze({ ...value })); } catch { /* A disconnected observer must not corrupt a shared job. */ }
}
