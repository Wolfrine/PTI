# Trusted home PC connection

The owner authorized free DuckDNS after GoDaddy's saved login was unavailable, and explicitly approved its CAPTCHA. The family hostname is `pti-onepiece-home.duckdns.org`, pointing to `192.168.68.105`. No router port forwarding, cloud media relay or paid service is involved. The PWA remains at the existing PTI `/one-piece/` route.

The new controls and browser-media origin is `https://pti-onepiece-home.duckdns.org:8443`. A real Let's Encrypt certificate was issued through DNS-01, with exact SAN and matching RSA2048 key, and verified through normal public trust. It expires on2027-01-16T18:42:18Z. Family devices use their normal browser trust and need no household CA installation. Existing `.local`/IP endpoints remain available for rollback; the TV's existing limited HTTP media path is unchanged.

## Runtime and renewal

- Explicit `tls.mode: public-certificate` binds one exact DuckDNS hostname to private certificate/key paths and matching HTTPS origins. Config loading checks actual material and rejects unsafe origins or paths.
- Caddy keeps its LAN bind, disabled administration and private proxy header. Public SNI uses the issued pair. Public-mode health checks use normal trust roots and the correct hostname.
- Official go-acme lego5.5.2 is pinned by executable SHA256 `7c94914300222fbee5f3666369b9e6855bd9e18baf2a95fa9a327e6764fd8fc8`; the downloaded official archive also matched its release checksum.
- DuckDNS automation token is CurrentUser DPAPI-protected on H:, outside the repository. ACME account keys and deployed keys inherit the private directory's restricted ACL. The provider token only enters the child process environment.
- `install-certificate-renewal.ps1` creates a hidden daily04:00 current-user task without storing a Windows password. It resolves the active protected release on each run. The Windows user must be signed in.
- Fresh certificates cause no DNS updates, decryption or restarts. Due renewal validates hostname, dates, key and public signatures before deployment, retains a rollback pair and restarts only the exact owned Caddy child. It never starts a deliberately stopped companion.
- `renew-public-certificate.mjs --check` inspects the deployed pair without DNS, decryption or runtime mutation. A successful scheduled no-op proves invocation, not a future certificate renewal.

## Verification scope

The full companion fixture suite passed210 tests; frontend tests passed56. The complete PTI Angular build and One Piece sibling build succeeded, with pre-existing Angular CSS warnings. Independent runtime/renewal review found no blocking issue. Root inspected the simplified connection dialog at1440x1000 and390x844; captures and current production fingerprint are in `design/evidence/public-https/`. Render identities/progress are synthetic, while the certificate, DNS record and issuer checks are real.

Actual installed endpoint, scheduled task and live Hosting verification are separate release checks. Physical Android local-network permission/trust/playback and actual future CA renewal must not be inferred from desktop or fixture tests. No TV was started by this migration's checks.

## Recovery

Keep the previous protected runtime configuration and Caddyfile before enabling the public mode. Activate only an integrity-checked versioned runtime, with the normal verified-stop guard. If public HTTPS fails, restore both protected files before restarting; do not disable certificate verification or send Firebase identity tokens over HTTP. The source/cache/media configuration is preserved.
