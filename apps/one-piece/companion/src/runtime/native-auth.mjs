import path from 'node:path';
import {lstat,readFile} from 'node:fs/promises';

// Public configuration from the existing PTI native-auth CI artifact, never an
// Admin credential. Browser/Picker key restrictions remain independent.
export function nativeFirebaseKey(value){
 const services=['identitytoolkit.googleapis.com','securetoken.googleapis.com'];
 if(value?.projectId!=='pti-app-2ab59'
  ||value.keyResource!=='projects/185802494856/locations/global/keys/pti-native-firebase-auth'
  ||value.applicationRestrictions!=='none'
  ||typeof value.firebaseAuthApiKey!=='string'||!/^AIza[\w-]{35}$/.test(value.firebaseAuthApiKey)
  ||!Array.isArray(value.apiTargets)||value.apiTargets.length!==2
  ||!services.every(service=>value.apiTargets.includes(service)))throw new Error('runtime-native-auth-required');
 return value.firebaseAuthApiKey;
}
export async function readNativeFirebaseKey(file){
 if(typeof file!=='string'||!path.isAbsolute(file))throw new Error('runtime-native-auth-required');
 const info=await lstat(file);
 if(!info.isFile()||info.isSymbolicLink()||info.size>8192)throw new Error('runtime-native-auth-required');
 return nativeFirebaseKey(JSON.parse(await readFile(file,'utf8')));
}
