function Test-PrivateMonitorAcl {
  param([Security.AccessControl.DirectorySecurity]$Acl, [string]$OwnerSid)
  $rules = @($Acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
  if (!$Acl.AreAccessRulesProtected -or $rules.Count -ne 2) { return $false }
  foreach ($sid in @($OwnerSid, 'S-1-5-18')) {
    $matching = @($rules | Where-Object { $_.IdentityReference.Value -eq $sid -and $_.AccessControlType -eq 'Allow' -and $_.FileSystemRights -eq [Security.AccessControl.FileSystemRights]::FullControl -and $_.InheritanceFlags -eq ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit) -and $_.PropagationFlags -eq 'None' -and !$_.IsInherited })
    if ($matching.Count -ne 1) { return $false }
  }
  return $true
}
