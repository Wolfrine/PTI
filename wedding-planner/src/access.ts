export type AccessRole = 'admin' | 'family' | 'viewer' | 'pending' | 'blocked';
export type MemberRole = Exclude<AccessRole, 'pending'> | 'editor';
export function effectiveRole(isOwner:boolean, role?:string):AccessRole {
  if(isOwner)return 'admin';
  if(role==='editor')return 'family';
  return ['admin','family','viewer','blocked'].includes(role||'') ? role as AccessRole : 'pending';
}
export const canReadPlan=(role:AccessRole)=>['admin','family','viewer'].includes(role);
export const canEditPlan=(role:AccessRole)=>role==='admin'||role==='family';
