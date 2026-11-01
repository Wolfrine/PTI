# One Piece authentication isolation

The shared browser API key rejected both dedicated One Piece Hosting origins
with `API_KEY_HTTP_REFERRER_BLOCKED` on 1 November 2026. PTI and Velum probes
still reached authentication. Firebase authorized domains and API-key referrers
are separate prerequisites.

The existing cloud setup now appends only the two exact One Piece hosts while
preserving every existing referrer, API target and method restriction. Release
probes cover sign-in and renewal on both One Piece hosts, PTI and Velum. They use
deliberately invalid tokens; they do not establish a real person's Google login.

The PC companion independently needs the existing `pti-native-firebase-auth`
public configuration artifact, restricted to Identity Toolkit and Secure Token.
It must not use the browser/Picker key or forge a Referer. New runtime setup
requires `--native-auth <absolute-artifact-path>`. For an existing installation,
that explicit option updates only its Firebase authentication key; saved runtime
paths, TLS, profiles, cache and consent remain unchanged. Restart One Piece in an
idle window to load the configuration. Do not restart other PTI services.

The setup entry is `apps/one-piece/companion/scripts/prepare-runtime.mjs`. The
current PC already has the verified public artifact at
`F:\Workspace\Support\PTI\codex-usage-monitor\native-auth.json`; no monitor or
Velum credentials are read or changed by using that public configuration.

An authentication API HTTP 403 now denies the request as an infrastructure
failure while retaining the encrypted viewer connection. Actual invalid/revoked
credentials and family access revocations continue to fail closed and clear
their saved connection. No administrator identity or project IAM is changed.
