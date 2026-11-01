export function ownerLimit(value,name,min=1) {
  if(value==null)return null;
  if(!Number.isSafeInteger(value)||value<min)throw Error(`${name} must be null (no bridge limit) or an integer of at least ${min}.`);
  return value;
}
export function ownerDuration(value) {
  if(value==null)return null;
  if(typeof value!=='number'||!Number.isFinite(value)||value<=0)throw Error('maxTaskMinutes must be null (no bridge limit) or a positive finite number.');
  return value;
}
export function executionDeadline(startedAt,minutes) {
  return minutes==null?null:startedAt+ownerDuration(minutes)*60000;
}
export function deadlineElapsed(deadline,now) {return deadline!=null&&now>=deadline;}
