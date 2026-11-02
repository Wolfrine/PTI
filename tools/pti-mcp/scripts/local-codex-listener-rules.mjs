export const dispatchRule = `  // Local Codex wake marker only. Job payloads, queries and writes remain private.
  match /_ptiLocalServices/local-codex/owners/5PbKbpGf3AbarNrp6pyqJ5C5Ziu2/signals/dispatch {
   allow get: if owner('5PbKbpGf3AbarNrp6pyqJ5C5Ziu2');
   allow list, write: if false;
  }
`;
export function withoutDispatchRule(source){
  const normalized=source.replace(/\r\n/g,'\n');
  if(normalized.split(dispatchRule).length!==2)throw Error('Expected one exact reviewed Local Codex listener rule.');
  return normalized.replace(dispatchRule,'');
}
