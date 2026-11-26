const libraryUrl = new URL('./drive-library.mjs', import.meta.url);
libraryUrl.search = new URL(import.meta.url).search;
const { PRIVATE_FOLDER_ID, REFERENCES_FOLDER_ID, driveResponseError } = await import(libraryUrl.href);

const API = 'https://www.googleapis.com/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';
const FIELDS = 'id,name,mimeType,parents,ownedByMe,shared,trashed,size,version,sha256Checksum,appProperties,capabilities(canAddChildren,canRemoveChildren,canMoveItemWithinDrive)';
const STAGING_NAME = 'Review staging';
const validId = value => typeof value === 'string' && /^[\w-]{8,160}$/.test(value);
const onlyParent = (file, parent) => file.parents?.length === 1 && file.parents[0] === parent;
const isPrivate = file => validId(file?.id) && file.trashed === false && file.shared === false && file.ownedByMe === true;

export function createAutoReviewDrive({ readRequest, manageRequest, getOperationGuard, readBoundedImage, verifyOriginal, save, listReferences }) {
  function operation(request, signal) {
    // Keep the owner/lock guard with the operation across every await, even if
    // Drive authorization changes between a metadata read and the write.
    const active = getOperationGuard();
    return async (path, options = {}, label = 'Drive verification failed') => {
      signal?.throwIfAborted();
      active();
      const deadline = AbortSignal.timeout(25000);
      const response = await request(`${API}/${path}`, {
        ...options, signal: signal ? AbortSignal.any([signal, deadline]) : deadline
      });
      signal?.throwIfAborted();
      active();
      if (!response.ok) throw driveResponseError(response, label);
      return response;
    };
  }

  async function get(send, id) {
    if (!validId(id)) throw new Error('Invalid private Drive item.');
    const response = await send(`files/${id}?fields=${FIELDS}`);
    return { file: await response.json(), etag: response.headers.get('etag') };
  }

  async function privateFolder(send) {
    const parent = (await get(send, PRIVATE_FOLDER_ID)).file;
    if (parent.id !== PRIVATE_FOLDER_ID || !isPrivate(parent) || parent.mimeType !== FOLDER || !parent.capabilities?.canAddChildren) {
      throw new Error('The configured Private Drive folder could not be verified as unshared and owner-controlled.');
    }
  }

  async function stageFolder(signal, expected) {
    const send = operation(readRequest, signal);
    await privateFolder(send);
    const query = new URLSearchParams({ q: `'${PRIVATE_FOLDER_ID}' in parents and trashed=false and name='${STAGING_NAME}'`,
      fields: `nextPageToken,incompleteSearch,files(${FIELDS})`, pageSize: '2', spaces: 'drive' });
    const list = await (await send(`files?${query}`)).json();
    if (list.nextPageToken || list.incompleteSearch) throw new Error('The Private folder lookup is ambiguous.');
    const matches = list.files || [];
    const [file] = matches;
    if (matches.length !== 1 || !isPrivate(file) || file.name !== STAGING_NAME || file.mimeType !== FOLDER ||
      !onlyParent(file, PRIVATE_FOLDER_ID) || !file.capabilities?.canAddChildren || !file.capabilities?.canRemoveChildren) {
      throw new Error(`Auto Review needs one unshared, owner-controlled folder at Private/${STAGING_NAME}.`);
    }
    if (expected && expected !== file.id) throw new Error('The private staging folder no longer matches this run. Restore the original folder before retrying.');
    return file.id;
  }

  async function sourceMetadata(send, id) {
    const { file } = await get(send, id);
    if (file.id !== id || !isPrivate(file) || !onlyParent(file, REFERENCES_FOLDER_ID) ||
      !['image/png', 'image/jpeg'].includes(file.mimeType) || !/^\d+$/.test(file.version || '') ||
      !Number.isInteger(Number(file.size)) || Number(file.size) < 24 || Number(file.size) > 16 * 1024 * 1024) {
      throw Object.assign(new Error('The source is no longer an unshared owner image in Private/References.'), {code: 'drive/review-source-ineligible'});
    }
    return file;
  }

  async function verifyReferences(send) {
    const [parent, references] = await Promise.all([get(send, PRIVATE_FOLDER_ID), get(send, REFERENCES_FOLDER_ID)]);
    if (parent.file.id !== PRIVATE_FOLDER_ID || !isPrivate(parent.file) || parent.file.mimeType !== FOLDER ||
      references.file.id !== REFERENCES_FOLDER_ID || !isPrivate(references.file) || references.file.name !== 'References' ||
      references.file.mimeType !== FOLDER || !onlyParent(references.file, PRIVATE_FOLDER_ID)) {
      throw new Error('The exact unshared Private/References folder could not be verified.');
    }
  }

  function checkStaged(file, job, parent, id) {
    if (!isPrivate(file) || file.id !== id || !onlyParent(file, parent) || file.mimeType !== 'image/png' ||
      Number(file.size) !== job.result.bytes || file.appProperties?.velumJobId !== job.id ||
      file.appProperties?.velumSha256 !== job.result.sha256 ||
      (file.sha256Checksum && file.sha256Checksum !== job.result.sha256)) {
      throw new Error('The reserved Drive image does not match this run, its verified PNG, or its expected private folder.');
    }
  }

  async function resultBytes(send, file, job) {
    const blob = await readBoundedImage(await send(`files/${file.id}?alt=media`));
    await verifyOriginal(blob, job);
    return blob;
  }

  return {
    stageFolder,
    async listSources(options) {
      await verifyReferences(operation(readRequest, options.signal));
      return listReferences({ ...options, folder: 'references', privateOnly: true });
    },
    async authorizeSources(ids, signal) {
      const send = operation(readRequest, signal);
      await verifyReferences(send);
      const files = await Promise.all(ids.map(id => sourceMetadata(send, id)));
      return files.map(file => file.id + ':' + file.version);
    },
    async loadSource(id, signal, expectedVersion) {
      const send = operation(readRequest, signal);
      await verifyReferences(send);
      const file = await sourceMetadata(send, id);
      if (expectedVersion && file.version !== expectedVersion) {
        throw Object.assign(new Error('The approved source version changed.'), {code: 'drive/review-source-ineligible'});
      }
      const blob = await readBoundedImage(await send(`files/${id}?alt=media`));
      if ((await sourceMetadata(send, id)).version !== file.version) {
        throw Object.assign(new Error('The source changed while loading.'), {code: 'drive/review-source-ineligible'});
      }
      return { blob, version: file.version, source: { kind: 'drive', id, name: (file.name || 'Reference').slice(0, 160) } };
    },
    async checkSource(id, version, signal) {
      const send = operation(readRequest, signal);
      await verifyReferences(send);
      const file = await sourceMetadata(send, id);
      if (file.version !== version) throw new Error('The source changed. Choose it again.');
    },
    async stage({ job, blob, run, onProgress, signal }) {
      const verifyFolder = async () => { await stageFolder(signal, run.stageFolderId); };
      const send = operation(readRequest, signal);
      const saved = await save({ job, blob, onProgress, signal, reviewTarget: {
        id: run.stageFolderId,
        verifyFolder,
        async verifyFile(file, id) {
          checkStaged(file, job, run.stageFolderId, id);
          if (!file.sha256Checksum) await resultBytes(send, file, job);
        }
      } });
      return saved.id;
    },
    async readStaged(run, job, signal) {
      await stageFolder(signal, run.stageFolderId);
      const send = operation(readRequest, signal);
      const { file } = await get(send, run.fileId);
      checkStaged(file, job, run.stageFolderId, run.fileId);
      const blob = await resultBytes(send, file, job);
      const { file: current } = await get(send, run.fileId);
      checkStaged(current, job, run.stageFolderId, run.fileId);
      if (current.version !== file.version) throw new Error('The staged file changed during review. Retry.');
      return blob;
    },
    async accept(run, job, signal) {
      const read = operation(readRequest, signal);
      const manage = operation(manageRequest, signal);
      const verify = async (file, parent) => {
        checkStaged(file, job, parent, run.fileId);
        if (!file.sha256Checksum) await resultBytes(read, file, job);
      };
      await privateFolder(read);
      const first = (await get(read, run.fileId)).file;
      if (onlyParent(first, PRIVATE_FOLDER_ID)) {
        await verify(first, PRIVATE_FOLDER_ID);
        return;
      }
      const stage = await stageFolder(signal, run.stageFolderId);
      await verify(first, stage);
      const { file, etag } = await get(read, run.fileId);
      checkStaged(file, job, stage, run.fileId);
      if (file.version !== first.version || !file.capabilities?.canMoveItemWithinDrive) throw new Error('The staged image changed or is no longer movable. Retry to reconcile its location.');
      const params = new URLSearchParams({ addParents: PRIVATE_FOLDER_ID, removeParents: stage, fields: FIELDS });
      await manage(`files/${file.id}?${params}`, {
        method: 'PATCH', headers: { ...(etag ? { 'If-Match': etag } : {}), 'Content-Type': 'application/json' }, body: '{}'
      }, 'Could not move the staged PNG directly into Private');
      const moved = (await get(read, run.fileId)).file;
      await verify(moved, PRIVATE_FOLDER_ID);
    }
  };
}
