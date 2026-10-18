# Home-network feasibility pilot

These are technical pilot tools, not an installed or accepted companion.

Runtime, downloads, logs and secrets stay under `H:/PTI-OnePiece/pilot/network`.
The Caddy candidate is the official vendor build with the pinned
`github.com/caddy-dns/duckdns@v0.5.0` module. Record executable SHA256 and actual
module/build versions; a local hash is not a publisher signature.

## Read-only TV discovery

```powershell
python -m pip install --target H:/PTI-OnePiece/pilot/tools/python -r apps/one-piece/companion/pilot/network/requirements-pilot.txt
python apps/one-piece/companion/pilot/network/cast-diagnostics.py --output docs/one-piece/evidence/network/cast-discovery.json
```

This probe does not launch media or disturb a running receiver application.

## Trusted HTTPS gate

The planned DNS-01 setup needs an owner-controlled hostname and provider token.
Obtain the hostname through one-time setup and keep the token outside Git and
chat, protected for the local runtime identity. A public DNS name may resolve
to a private home address; test the actual router, Android browser and receiver.
Never use public-IP autodetection for the LAN-only DNS record.

Before calling this gate passed, retain evidence for:

1. Trusted certificate issuance without public inbound ports; pinned DNS module.
2. DNS resolving to the intended current LAN interface address from each device.
3. TLS trust, exact-origin CORS, byte ranges, nested manifests and captions.
4. PTI HTTPS and installed Android PWA local-network permission behavior.
5. Sony receiver's actual fetches and visible subtitles, not discovery alone.
6. Certificate renewal and PC restart recovery.

Until that evidence exists, do not change the firewall, install a permanent
service, bypass a certificate interstitial, or describe network acceptance as
complete. Any later service/firewall setup must stay within the approved
home-subnet scope. Never expose the media engine's administration endpoint.
