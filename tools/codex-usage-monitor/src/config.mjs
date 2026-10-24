import path from 'node:path';
export const VERSION = '1.0.0';
export const PROJECT = 'pti-app-2ab59';
export const OWNER_UID = '5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
export const DOCUMENT = `users/${OWNER_UID}/codexProjects/codex-usage`;
export const FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs',
  authDomain: 'pti-app-2ab59.firebaseapp.com',
  projectId: PROJECT,
  appId: '1:185802494856:web:5e9777771492528c6e203d',
});
export const DEFAULT_ROOT = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local'), 'PTI', 'codex-usage-monitor');
export const STATES = ['ok', 'error', 'unavailable', 'unsupported'];
