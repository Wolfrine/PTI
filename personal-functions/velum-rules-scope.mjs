const START='  // Private Studio drafts, reference inputs, thumbnails and explicit Drive save receipts.';
const END='  // Cached infrastructure telemetry is readable by its owner only.';

function studioBounds(policy){
 const start=policy.indexOf(START),end=policy.indexOf(END);
 if(start<0||end<=start||start!==policy.lastIndexOf(START)||end!==policy.lastIndexOf(END)){
  throw new Error('Velum Studio rule boundaries changed. Review the live policy before publishing.');
 }
 return {start,end};
}

export function velumOnly(current,source){
 const live=studioBounds(current),canonical=studioBounds(source);
 const newline=current.includes('\r\n')?'\r\n':'\n';
 const studio=source.slice(canonical.start,canonical.end).replace(/\r?\n/g,newline);
 return current.slice(0,live.start)+studio+current.slice(live.end);
}
