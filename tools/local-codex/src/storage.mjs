import fs from 'node:fs';
import path from 'node:path';

// Owner policy, 2026-11-18. These defaults affect artifacts, never credentials,
// project allowlists, native history, or the running bridge's protected state.
export const artifactRoot = 'H:/Workspace';
export const storageDefaults = {
  TEMP: 'H:\\Workspace\\Temp', TMP: 'H:\\Workspace\\Temp',
  NPM_CONFIG_CACHE: 'H:\\Workspace\\Caches\\npm',
  HF_HOME: 'H:\\Workspace\\Caches\\huggingface',
  HUGGINGFACE_HUB_CACHE: 'H:\\Workspace\\Caches\\huggingface\\hub',
  UV_CACHE_DIR: 'H:\\Workspace\\Caches\\uv',
  UV_PYTHON_INSTALL_DIR: 'H:\\Workspace\\Runtimes\\uv-python',
  PIP_CACHE_DIR: 'H:\\Workspace\\Caches\\pip',
  XDG_CACHE_HOME: 'H:\\Workspace\\Caches\\xdg',
  PLAYWRIGHT_BROWSERS_PATH: 'H:\\Workspace\\Runtimes\\playwright',
  GRADLE_USER_HOME: 'H:\\Workspace\\Caches\\gradle'
};
export function storageEnvironment(base = process.env) {
  if (process.platform !== 'win32') return {...base};
  const env = {...base};
  for (const [key, fallback] of Object.entries(storageDefaults)) {
    const existing = Object.keys(env).find(name => name.toUpperCase() === key);
    const value = existing && env[existing];
    if (existing) delete env[existing];
    env[key] = value && /^h:[\\/]/i.test(value) ? value : fallback;
  }
  return env;
}
export function artifactDirectory(...parts) {
  const result = path.win32.resolve(artifactRoot, ...parts);
  if (!result.toLowerCase().startsWith('h:\\workspace\\')) throw Error('Artifact path escaped H:\\Workspace.');
  return result;
}
export function ensureArtifactLink(source, destination) {
  if (process.platform !== 'win32') return;
  if (fs.existsSync(source)) {
    const actual=fs.realpathSync.native(source);
    if (!actual.toLowerCase().startsWith('h:\\')) {
      throw Error(`Existing artifact directory needs verified migration to H: before building: ${source}`);
    }
    if (!fs.existsSync(destination)||actual.toLowerCase()!==fs.realpathSync.native(destination).toLowerCase()) {
      throw Error(`Artifact link does not match this consumer's owned output directory: ${source}`);
    }
    return;
  }
  let existing=destination;
  while(!fs.existsSync(existing)){
    const parent=path.dirname(existing);
    if(parent===existing)throw Error('The H: artifact volume is unavailable.');
    existing=parent;
  }
  if(!fs.realpathSync.native(existing).toLowerCase().startsWith('h:\\'))throw Error('Artifact destination resolves outside H:.');
  fs.mkdirSync(destination, {recursive: true});
  fs.symlinkSync(destination, source, 'junction');
}
