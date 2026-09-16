import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import express, { NextFunction, Request, Response } from 'express';
import { GoogleAuth } from 'google-auth-library';
import { Readable } from 'node:stream';

const PRIVATE_FOLDER_ID = '1AedezVcOlOB-cdv00j1HQ7Sy-EZntHgA';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

const driveAuth = new GoogleAuth({ scopes: [DRIVE_SCOPE] });
const velumApp = express();
velumApp.disable('x-powered-by');

velumApp.use((req, _res, next) => {
  if (req.url === '/velum-api') req.url = '/';
  else if (req.url.startsWith('/velum-api/')) req.url = req.url.slice('/velum-api'.length);
  next();
});

velumApp.get('/identity', async (_req, res) => {
  try {
    const serviceAccountEmail = await getRuntimeServiceAccountEmail();
    res.set('Cache-Control', 'no-store');
    res.json({
      serviceAccountEmail,
      folderId: PRIVATE_FOLDER_ID,
      readyForFolderShare: Boolean(serviceAccountEmail),
    });
  } catch (error) {
    res.status(500).json({ error: 'Could not determine Velum runtime identity.', detail: String((error as Error).message) });
  }
});

velumApp.use(requireFirebaseUser);

velumApp.get('/list', async (_req, res) => {
  try {
    const token = await getDriveToken();
    const files: Array<Record<string, unknown>> = [];
    let pageToken = '';

    do {
      const params = new URLSearchParams({
        q: `'${PRIVATE_FOLDER_ID}' in parents and trashed=false`,
        spaces: 'drive',
        pageSize: '1000',
        orderBy: 'createdTime desc',
        fields: 'nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,size,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis))',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const response = await fetch(`${DRIVE_API}/files?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Drive list failed (${response.status}): ${await response.text()}`);
      const data = await response.json() as { nextPageToken?: string; files?: Array<Record<string, unknown>> };
      files.push(...(data.files ?? []).filter(file => {
        const mime = typeof file.mimeType === 'string' ? file.mimeType : '';
        return mime.startsWith('image/') || mime.startsWith('video/');
      }));
      pageToken = data.nextPageToken ?? '';
    } while (pageToken);

    res.set('Cache-Control', 'private, no-store');
    res.json({ files });
  } catch (error) {
    sendDriveError(res, error);
  }
});

velumApp.get('/file/:id', async (req, res) => {
  try {
    const token = await getDriveToken();
    const id = req.params.id;
    const metadata = await getPrivateFileMetadata(id, token);
    if (!metadata) {
      res.status(404).json({ error: 'File is not in the configured Private folder.' });
      return;
    }

    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    const range = req.get('range');
    if (range) headers.Range = range;

    const driveResponse = await fetch(`${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media`, { headers });
    if (!driveResponse.ok && driveResponse.status !== 206) {
      throw new Error(`Drive media failed (${driveResponse.status}): ${await driveResponse.text()}`);
    }

    const passHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'];
    for (const header of passHeaders) {
      const value = driveResponse.headers.get(header);
      if (value) res.set(header, value);
    }
    res.set('Cache-Control', 'private, max-age=300');
    res.status(driveResponse.status);

    if (!driveResponse.body) {
      res.end();
      return;
    }

    const nodeStream = (Readable as typeof Readable & { fromWeb(stream: unknown): Readable }).fromWeb(driveResponse.body as unknown);
    nodeStream.on('error', error => {
      console.error('Velum Drive stream error', error);
      if (!res.headersSent) res.status(502);
      res.end();
    });
    nodeStream.pipe(res);
  } catch (error) {
    sendDriveError(res, error);
  }
});

async function requireFirebaseUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: 'Firebase authentication required.' });
    return;
  }

  try {
    await admin.auth().verifyIdToken(match[1]);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired Firebase authentication.' });
  }
}

async function getDriveToken(): Promise<string> {
  const client = await driveAuth.getClient();
  const token = await client.getAccessToken();
  const value = typeof token === 'string' ? token : token?.token;
  if (!value) throw new Error('Could not obtain Drive token for Velum service account.');
  return value;
}

async function getPrivateFileMetadata(id: string, token: string): Promise<Record<string, unknown> | null> {
  const params = new URLSearchParams({ fields: 'id,name,mimeType,parents,trashed,size' });
  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(id)}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Drive metadata failed (${response.status}): ${await response.text()}`);
  const metadata = await response.json() as { parents?: string[]; trashed?: boolean } & Record<string, unknown>;
  if (metadata.trashed || !metadata.parents?.includes(PRIVATE_FOLDER_ID)) return null;
  return metadata;
}

async function getRuntimeServiceAccountEmail(): Promise<string | null> {
  try {
    const response = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',
      { headers: { 'Metadata-Flavor': 'Google' } },
    );
    if (response.ok) {
      const value = (await response.text()).trim();
      if (value) return value;
    }
  } catch {
    // Fall through to ADC credentials.
  }

  try {
    const credentials = await driveAuth.getCredentials();
    return credentials.client_email ?? null;
  } catch {
    return null;
  }
}

function sendDriveError(res: Response, error: unknown): void {
  const detail = String((error as Error)?.message ?? error);
  const accessMissing = /insufficient|permission|not found|404|403/i.test(detail);
  res.status(accessMissing ? 503 : 500).json({
    error: accessMissing
      ? 'Velum backend cannot access the Private Drive folder yet.'
      : 'Velum backend Drive request failed.',
    detail,
  });
}

export const velumMedia = functions.https.onRequest(velumApp);
