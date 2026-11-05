// Audit operation metadata, never duplicate private Studio instructions/media.
const velumPath = (path: unknown): path is string => typeof path === 'string' && /^users\/[^/]+\/velumStudio\/workspace(?:\/|$)/.test(path);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const summary = (value: unknown) => value == null ? null : {redacted: true, fields: record(value) ? Object.keys(value) : []};

export function redactVelumAudit(target: string, before: unknown, after: unknown, input: unknown) {
  const paths = target.split(', ');
  if (!paths.some(velumPath)) return {before, after, input};
  const single = paths.length === 1 && velumPath(paths[0]);
  const snapshots = (value: unknown): unknown => {
    if (single) return summary(value);
    if (!record(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([path, data]) => [path, velumPath(path) ? summary(data) : data]));
  };
  let safeInput: unknown;
  if (record(input) && Array.isArray(input.writes)) {
    safeInput = {writes: input.writes.map(item => {
      if (!record(item) || !velumPath(item.path)) return item;
      return {operation: item.operation, path: item.path, data: summary(item.data)};
    })};
  } else if (record(input) && velumPath(input.path)) {
    safeInput = {path: input.path, data: summary(input.data)};
  } else safeInput = summary(input);
  return {before: snapshots(before), after: snapshots(after), input: safeInput, payloadRedactionVersion: 1};
}

export function belongsToExactVelumJob(target: unknown, jobRoot: string): boolean {
  if (typeof target !== 'string' || !/^users\/[^/]+\/velumStudio\/workspace\/jobs\/[A-Za-z0-9_-]{1,80}$/.test(jobRoot)) return false;
  return target.split(', ').every(path => path === jobRoot || path.startsWith(jobRoot + '/'));
}
