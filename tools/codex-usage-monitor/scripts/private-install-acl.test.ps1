$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'private-install-acl.ps1')
$ownerSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
function New-TestAcl {
 param([switch]$Inherit, [switch]$Extra, [switch]$ReadOnly, [switch]$NoChildInheritance)
 $acl=[Security.AccessControl.DirectorySecurity]::new()
 $acl.SetAccessRuleProtection(!$Inherit,$false)
 foreach($sid in @($ownerSid,'S-1-5-18')) {
  $rights=if($ReadOnly){[Security.AccessControl.FileSystemRights]::Read}else{[Security.AccessControl.FileSystemRights]::FullControl}
  $flags=if($NoChildInheritance){[Security.AccessControl.InheritanceFlags]::None}else{[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'}
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),$rights,$flags,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
 }
 if($Extra){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow))}
 return $acl
}
if(!(Test-PrivateMonitorAcl -Acl (New-TestAcl) -OwnerSid $ownerSid)){throw 'Exact protected owner/SYSTEM DACL must be reusable.'}
foreach($acl in @((New-TestAcl -Inherit),(New-TestAcl -Extra),(New-TestAcl -ReadOnly),(New-TestAcl -NoChildInheritance))){if(Test-PrivateMonitorAcl -Acl $acl -OwnerSid $ownerSid){throw 'An unsafe or incomplete DACL was accepted.'}}
if(Test-PrivateMonitorAcl -Acl (New-TestAcl) -OwnerSid 'S-1-5-21-1-2-3-9999'){throw 'Wrong Windows identity accepted.'}
Write-Output 'PASS 6 monitor installation ACL safety checks; no filesystem ACL changed.'
