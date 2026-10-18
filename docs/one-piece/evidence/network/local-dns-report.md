# Local DNS feasibility: bounded household pilot

Date: 18 October 2026. This is a technical experiment, not an installed companion or accepted media transport.

Local naming has been demonstrated on this PC. Naming the PC and establishing TLS trust are separate requirements. An external DuckDNS account is not necessary to test local discovery, and none was created by this experiment.

Subsequent actual-TV work also demonstrated receiver resolution and prepared MP4/WebVTT playback through `onepiece-cast.local`. See `cast-media-report.md`; the health-only measurements below retain their original, narrower scope. Android/PTI-origin access, permanent DNS reliability and trusted HTTPS remain unaccepted.

## What was implemented and measured

`apps/one-piece/companion/pilot/network/local-dns-pilot.py` advertises the ephemeral hostname `onepiece-pilot.local` on the selected private LAN interface. It uses mDNS and advertises an `_http._tcp.local` service. It binds a health-only HTTP listener on port 8794 to the LAN address, with no wildcard listener. Only `/` and `/health.json` return a small constant status object; all other paths return 404. It has no authentication, tokens, media, file-serving, proxying, engine administration, or TLS.

The script makes no permanent DNS, hosts-file, router, firewall, trust-store, or service changes. It unregisters the mDNS service and closes the listener when its bounded lifetime expires. Existing firewall policy remains in effect.

| Check | Observed result | Meaning |
| --- | --- | --- |
| mDNS advertisement | Registered using Python 3.12.2 and zeroconf 0.151.5 | A local responder is running |
| Explicit UDP mDNS query | Matching 71-byte response; A record has the intended private address and 120-second TTL | Actual DNS packets were exchanged; not an inferred result |
| Same-PC raw-IP HTTP request | 200 and correct constant health object | Listener works locally on the LAN interface |
| Same-PC hostname HTTP request | 200 and correct constant health object | At least one Windows resolver path resolved the hostname |
| Initial Windows `getaddrinfo` | `gaierror` | Initial resolution did not reliably succeed |
| Three subsequent Windows `getaddrinfo` calls | Success, `gaierror`, success | **Intermittent resolution is an unresolved reliability failure** |
| Android browser and Sony receiver | Not measured by this script | Same-PC results do not establish cross-device reachability, resolution, TLS, or playback |

Raw results are in `local-dns-results.json` and `local-dns-recheck.json`. The main result file also records health requests for correlation with the parent's Chrome test. Its `production_transport_accepted` flag remains false. Browser testing must retain its own origin, browser version, permission outcome, and observed response.

## Local naming choices

1. **mDNS `.local`:** advertises directly on the LAN without making devices use a new DNS server. The current packet test passed, but OS resolution was intermittent. Wi-Fi client isolation, multicast behavior, device resolver behavior, and receiver behavior still need testing.
2. **PC-hosted conventional DNS:** can serve a local `home.arpa` zone. A working server alone is insufficient: the router must distribute it through DHCP, or every client must be configured to use it. Android Private DNS and Cast resolver behavior must be considered. Do not hijack router DNS or assume Chromecast honors a custom zone. This experiment deliberately did not bind port 53 or change those settings.
3. **Publicly registered hostname resolving to a private address:** permits a public CA certificate through DNS-01 without public inbound ports. It needs an owner-controlled domain/provider but the media can stay LAN-only. Keep it as a comparison, not a prerequisite imposed before testing the local options.

## Browser transport and TLS are separate tests

Chrome's current Local Network Access documentation says private-IP and `.local` HTTP destinations are exempted from mixed-content checks when the secure public origin obtains local-network permission. This means a hosted HTTPS PTI shell **may** contact the local health endpoint without disabling browser security. Chrome says requests from workers require prior permission for the origin. This is a browser capability to measure, not evidence for every Android browser or the Cast receiver. [Chrome LNA documentation](https://developer.chrome.com/blog/local-network-access)

The health-only HTTP experiment does **not** authorize sending Firebase tokens or private media over HTTP and does not silently replace the approved trusted-HTTPS production design. CORS only allows the exact PTI origin; CORS is not authentication or encryption.

A local Caddy CA can issue an HTTPS certificate for a local hostname. Every client must then trust that CA. Caddy documents that installing trust on the server does not establish trust on other devices. Android apps do not universally honor user-installed CA roots; app configuration matters. The TV receiver has its own TLS verifier, separate from Chrome on a phone. No certificate was issued, no CA installed, and actual Sony receiver trust is untested. Do not claim private-CA Cast is either proven or categorically impossible. [Caddy local HTTPS](https://caddyserver.com/docs/automatic-https#local-https), [Android CA trust](https://developer.android.com/privacy-and-security/security-config)

## Reproduce

From the PTI worktree, with the existing isolated tool directory:

```powershell
python -m pip install --target H:/PTI-OnePiece/pilot/tools/python -r apps/one-piece/companion/pilot/network/local-dns-requirements.txt
python apps/one-piece/companion/pilot/network/local-dns-pilot.py --address 192.168.68.105 --seconds 1800 --output docs/one-piece/evidence/network/local-dns-results.json
```

The command remains running for at most 30 minutes; Ctrl+C unregisters the advertisement and closes HTTP. The script permits at most one hour per launch. An unused existing port is required. Do not open a new firewall rule merely to make a test pass without recording that change.

In the actual HTTPS PTI browser context, initiate a fetch to `http://onepiece-pilot.local:8794/health.json`, handle the normal local-network permission prompt, and compare a raw private-IP fetch. Do not use `--disable-web-security`, certificate-error bypasses, or an altered browser security flag. Failure to resolve the hostname must stay distinct from a CORS failure or denied local-network permission.

## Remaining gate

This PC resolved the temporary local name without an external account, with intermittent failures in another resolver path. Production selection still requires reliable cross-device DNS, encrypted/authenticated companion access, receiver media/subtitle access, recovery after reboot, and a documented one-time household setup. None of those is established by the health-only test.
