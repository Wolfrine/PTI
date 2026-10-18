import path from 'node:path';
export { PreparedToolRegistry } from './prepared-processes.mjs';

/** Pure launch/config descriptor. The runtime owner creates private credentials, ACLs and supervised processes. */
export function dedicatedEngineDescriptor({ runtimeRoot = 'H:/PTI-OnePiece/runtime/jellyfin', binaryDir, port = 18097 } = {}) {
  if (!binaryDir || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Pinned binary directory and an unprivileged port are required');
  const root = path.resolve(runtimeRoot), bin = path.resolve(binaryDir);
  const dirs = Object.fromEntries(['config', 'data', 'cache', 'logs', 'transcodes', 'private'].map(name => [name, path.join(root, name)]));
  const args = ['--datadir', dirs.data, '--configdir', dirs.config, '--cachedir', dirs.cache, '--logdir', dirs.logs,
    '--ffmpeg', path.join(bin, 'ffmpeg.exe'), '--nowebclient', '--nonetchange'];
  return { version: '12.2', executable: path.join(bin, 'jellyfin.exe'), workingDirectory: bin, args, directories: dirs,
    networkConfigPath: path.join(dirs.config, 'network.xml'), baseUrl: `http://127.0.0.1:${port}`,
    managedRoots: { transcodes: dirs.transcodes, subtitles: path.join(dirs.data, 'data', 'subtitles') },
    networkXml: `<?xml version="1.0" encoding="utf-8"?>\n<NetworkConfiguration>\n<InternalHttpPort>${port}</InternalHttpPort><PublicHttpPort>${port}</PublicHttpPort>\n<EnableHttps>false</EnableHttps><RequireHttps>false</RequireHttps><AutoDiscovery>false</AutoDiscovery><EnableUPnP>false</EnableUPnP>\n<EnableIPv4>true</EnableIPv4><EnableIPv6>false</EnableIPv6><EnableRemoteAccess>false</EnableRemoteAccess>\n<LocalNetworkAddresses><string>127.0.0.1</string></LocalNetworkAddresses><LocalNetworkSubnets><string>127.0.0.0/8</string></LocalNetworkSubnets>\n</NetworkConfiguration>\n` };
}
