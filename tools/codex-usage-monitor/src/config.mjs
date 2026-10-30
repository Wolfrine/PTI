import { readFileSync } from 'node:fs';
export const VERSION = '1.0.1';
export const PROJECT = 'pti-app-2ab59';
export const OWNER_UID = '5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
export const DOCUMENT = `users/${OWNER_UID}/codexProjects/codex-usage`;
export function nativeAuthKey(file = new URL('../native-auth.json', import.meta.url)) {
  let value; try { value = JSON.parse(readFileSync(file, 'utf8')); } catch { throw Object.assign(new Error('firebase-auth-config-required'), { code: 'firebase-auth-config-required' }); }
  if (value.projectId !== PROJECT || value.keyResource !== 'projects/185802494856/locations/global/keys/pti-native-firebase-auth' || value.applicationRestrictions !== 'none' || !/^AIza[\w-]{35}$/.test(value.firebaseAuthApiKey || '') || value.apiTargets?.length !== 2 || !['identitytoolkit.googleapis.com', 'securetoken.googleapis.com'].every(service => value.apiTargets.includes(service))) throw Object.assign(new Error('firebase-auth-config-required'), { code: 'firebase-auth-config-required' });
  return value.firebaseAuthApiKey;
}
export const FIREBASE_CONFIG = Object.freeze({
  get apiKey() { return nativeAuthKey(); },
  authDomain: 'pti-app-2ab59.firebaseapp.com',
  projectId: PROJECT,
  appId: '1:185802494856:web:5e9777771492528c6e203d',
});
export const DEFAULT_ROOT = 'F:\\Workspace\\Support\\PTI\\codex-usage-monitor';
export const STATES = ['ok', 'error', 'unavailable', 'unsupported'];
