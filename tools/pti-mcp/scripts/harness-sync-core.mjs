import { createHash } from 'node:crypto';

const CAPTURE_PATH = /^captures\/chatgpt\/(\d{4})\/(\d{2})\/(\d{2})\/([A-Za-z0-9_.-]+)\.json$/;
const OPTOUT = /^(?:harness:\s*off\b|do not save this chat\b|don't save this chat\b)/i;

export function captureDocId(path) {
  const match = CAPTURE_PATH.exec(String(path || ''));
  if (!match) throw new Error('Invalid capture path: ' + path);
  return match[4];
}

export function pathsFromTree(payload) {
  if (payload?.truncated || !Array.isArray(payload?.tree)) {
    throw new Error('GitHub tree unavailable or truncated; do not silently skip captures.');
  }
  return payload.tree.filter(entry => entry.type === 'blob' && CAPTURE_PATH.test(entry.path || ''))
    .map(entry => ({path: entry.path, sha: entry.sha})).sort((a,b) => a.path.localeCompare(b.path));
}

export function pathsFromCompare(payload) {
  if (payload?.status === 'identical') return [];
  if (payload?.status !== 'ahead' || !Array.isArray(payload?.files) ||
      (payload.total_commits || 0) > 250 || payload.files.length >= 300) {
    throw new Error('GitHub compare is not an unambiguous, complete fast-forward; manual resync required.');
  }
  const captures = payload.files.filter(entry => CAPTURE_PATH.test(entry.filename || ''));
  const mutable = captures.filter(entry => entry.status !== 'added');
  if (mutable.length) throw new Error('Immutable capture was edited, deleted or renamed: ' + mutable.map(x => x.filename).join(', '));
  return captures.map(entry => ({path:entry.filename, sha:entry.sha})).sort((a,b) => a.path.localeCompare(b.path));
}

function localDateOf(date) {
  const components = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(date);
  const get = name => components.find(part => part.type === name)?.value;
  return get('year') + '-' + get('month') + '-' + get('day');
}

export function turnFromCapture({path, content, blobSha, indexedAt}) {
  const id = captureDocId(path);
  const input = typeof content === 'string' ? content : content.toString('utf8');
  const record = JSON.parse(input);
  if (record.schema_version !== 1 || record.source !== 'chatgpt_skill_github_presend' ||
      record.session_save_policy !== 'on') throw new Error('Unexpected schema/source/save policy in ' + path);
  if (!Array.isArray(record.messages) || record.messages.length !== 2 ||
      record.messages[0]?.role !== 'user' || record.messages[1]?.role !== 'assistant' ||
      typeof record.messages[0]?.content !== 'string' ||
      typeof record.messages[1]?.content !== 'string') {
    throw new Error('Missing user or assistant text in ' + path);
  }
  if (OPTOUT.test(record.messages[0].content.trim())) throw new Error('Opted-out input must never be mirrored: ' + path);
  const capturedDate = new Date(record.captured_at_utc);
  if (!Number.isFinite(capturedDate.getTime())) throw new Error('Missing/invalid capture time in ' + path);
  const indexedDate = new Date(indexedAt);
  if (!Number.isFinite(indexedDate.getTime())) throw new Error('Invalid indexing time');
  const covered = record.coverage?.assistant_prepared_text_saved === true &&
    !/earlier partial|partial answer.*before|incomplete|could not.*verbatim/i.test(record.notes || '');
  const sha256 = createHash('sha256').update(input, 'utf8').digest('hex');
  const result = {
    id, schemaVersion:1, source:'chatgpt_harness_github', sourceType:record.source,
    sourceRepo:'Wolfrine/chatgpt_harness', sourcePath:path,
    sourceUrl:'https://github.com/Wolfrine/chatgpt_harness/blob/main/' + path,
    sourceBlobSha:blobSha, sourceContentSha256:sha256,
    capturedAt:record.captured_at_utc, localDate:localDateOf(capturedDate),
    conversationId:record.conversation_id ?? null,
    conversationHint:record.conversation_hint ?? null,
    groupingConfidence:record.conversation_id ? 'id' : 'hint-only',
    userPreview:record.messages[0].content.slice(0,260),
    assistantPreview:record.messages[1].content.slice(0,260),
    messages:record.messages,
    coverage:record.coverage || {},
    captureStatus:covered ? 'prepared-complete' : 'partial',
    deliveryVerified:false, originNotes:record.notes || '',
    indexedAt:indexedDate.toISOString()
  };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 800000) {
    throw new Error('Firestore document exceeds the safe size limit; requires external blob storage: ' + path);
  }
  return result;
}
