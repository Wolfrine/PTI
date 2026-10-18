param([string]$EvidencePath='H:\PTI-OnePiece\runtime\private\firewall-proof.json')
$ErrorActionPreference='Stop'
try {
    $principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'administrator-required'}
    if([IO.Path]::GetFullPath($EvidencePath) -ne 'H:\PTI-OnePiece\runtime\private\firewall-proof.json'){throw 'evidence-path'}
    $config=Get-Content -LiteralPath 'H:\PTI-OnePiece\runtime\private\config.json' -Raw|ConvertFrom-Json
    $adapter=Get-NetIPAddress -InterfaceAlias 'Ethernet' -AddressFamily IPv4|Where-Object {$_.IPAddress -eq '192.168.68.105' -and $_.PrefixLength -eq 24}
    $profile=Get-NetConnectionProfile -InterfaceAlias 'Ethernet'
    if(-not $adapter -or $profile.NetworkCategory -ne 'Public'){throw 'network-changed'}
    $specs=@(
      @{Name='PTI-OnePiece-HTTPS-LAN-v1';Port=8443;Protocol='TCP';Program=$config.caddy.executable;LocalAddress='192.168.68.105'},
      @{Name='PTI-OnePiece-CastMedia-LAN-v1';Port=18099;Protocol='TCP';Program=$config.nodeExecutable;LocalAddress='192.168.68.105'},
      @{Name='PTI-OnePiece-mDNS-LAN-v1';Port=5353;Protocol='UDP';Program=$config.pythonExecutable;LocalAddress=@('192.168.68.105','224.0.0.251')}
    )
    function Assert-Rule($rule,$spec){
      $port=$rule|Get-NetFirewallPortFilter;$address=$rule|Get-NetFirewallAddressFilter;$iface=$rule|Get-NetFirewallInterfaceFilter;$app=$rule|Get-NetFirewallApplicationFilter
      $remote=@($address.RemoteAddress);$expectedLocal=@($spec.LocalAddress|Sort-Object);$actualLocal=@($address.LocalAddress|Sort-Object)
      $protocols=if($spec.Protocol -eq 'TCP'){@('TCP','6')}else{@('UDP','17')}
      if($rule.Direction -ne 'Inbound' -or $rule.Action -ne 'Allow' -or $rule.Enabled -ne 'True' -or $rule.Profile -ne 'Public' -or $rule.EdgeTraversalPolicy -ne 'Block' -or $port.LocalPort -ne [string]$spec.Port -or $port.Protocol -notin $protocols -or $remote.Count -ne 1 -or $remote[0] -notin @('192.168.68.0/24','192.168.68.0/255.255.255.0') -or (@($iface.InterfaceAlias).Count -ne 1) -or $iface.InterfaceAlias -ne 'Ethernet' -or $app.Program -ne $spec.Program -or ($actualLocal -join ',') -ne ($expectedLocal -join ',')){throw 'existing-rule-differs'}
      return @{name=$spec.Name;enabled=[string]$rule.Enabled;profile=[string]$rule.Profile;remoteAddresses=$remote;interface=$iface.InterfaceAlias;protocol=[string]$port.Protocol;localPort=[string]$port.LocalPort;localAddresses=$actualLocal;program=$app.Program;edgeTraversal=[string]$rule.EdgeTraversalPolicy}
    }
    $before=@();$after=@()
    foreach($spec in $specs){
      $existing=Get-NetFirewallRule -Name $spec.Name -ErrorAction SilentlyContinue
      $before+=@{name=$spec.Name;existed=[bool]$existing}
      if($existing){
        Assert-Rule $existing $spec|Out-Null
      }else{
        New-NetFirewallRule -Name $spec.Name -DisplayName $spec.Name -Group 'PTI One Piece Companion' -Direction Inbound -Action Allow -Enabled True -Profile Public -InterfaceAlias Ethernet -RemoteAddress '192.168.68.0/24' -LocalAddress $spec.LocalAddress -Protocol $spec.Protocol -LocalPort $spec.Port -Program $spec.Program -EdgeTraversalPolicy Block|Out-Null
      }
      $rule=Get-NetFirewallRule -Name $spec.Name
      $after+=Assert-Rule $rule $spec
    }
    $proof=[ordered]@{recordedAt=[DateTime]::UtcNow.ToString('o');before=$before;after=$after;unrelatedRulesChanged=$false;globalProfileChanged=$false}
    $proof|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $EvidencePath -Encoding UTF8
    [Console]::Out.Write('{"installed":true,"rules":3,"scope":"Ethernet:192.168.68.0/24:Public"}')
}catch{[Console]::Error.Write('runtime-firewall-setup-failed');exit 1}
