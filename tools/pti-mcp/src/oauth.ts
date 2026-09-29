import type { Response } from 'express';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from '@modelcontextprotocol/sdk/shared/auth.js';
import { InvalidClientMetadataError, InvalidGrantError, InvalidScopeError, InvalidTargetError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { type AuthStore, type RecordValue, secret, digest, now } from './auth-store.js';

export const MCP_SCOPE = 'pti:apps';
const ACCESS_SECONDS = 3600;
const SESSION_SECONDS = 90 * 86400;
export type UserIdentity = { uid: string; email: string; authenticatedAt: number };
export type CheckUser = (uid: string, authenticatedAt: number) => Promise<void>;
const valid = (v: RecordValue | undefined): v is RecordValue => !!v && Number(v.expiresAt) > now();
function checked(v: RecordValue | undefined): RecordValue {
  if (!valid(v)) throw new InvalidGrantError('Grant is expired, consumed, or unknown');
  return v;
}
export class PtiOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;
  readonly resource: string;
  constructor(readonly store: AuthStore, readonly origin: string, readonly checkUser: CheckUser,
    readonly redirectOrigins = ['https://chatgpt.com', 'https://chat.openai.com']) {
    this.resource = `${origin}/mcp`;
    this.clientsStore = {
      getClient: async id => await store.get('clients', id) as OAuthClientInformationFull | undefined,
      registerClient: async metadata => {
        if (!metadata.redirect_uris.length || metadata.redirect_uris.length > 10) throw new InvalidClientMetadataError('Invalid redirect URIs');
        for (const uri of metadata.redirect_uris) {
          const u = new URL(uri);
          if (!redirectOrigins.includes(u.origin) || u.hash || u.username || u.password) throw new InvalidClientMetadataError('Redirect origin is not approved');
        }
        const client = { ...metadata, client_id: secret(), client_id_issued_at: now() } as OAuthClientInformationFull;
        await store.put('clients', client.client_id, client as unknown as RecordValue);
        return client;
      },
    };
  }
  private target(resource?: URL) {
    if (resource && resource.href !== this.resource) throw new InvalidTargetError('Resource must be the PTI MCP endpoint');
  }
  private scopes(scopes?: string[]) {
    const result = scopes?.length ? scopes : [MCP_SCOPE];
    if (result.some(s => s !== MCP_SCOPE)) throw new InvalidScopeError('Unsupported scope');
    return [MCP_SCOPE];
  }
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
    this.target(params.resource);
    const requestId = secret(), csrf = secret();
    await this.store.put('pending', requestId, {
      clientId: client.client_id, clientName: client.client_name || 'MCP client',
      redirectUri: params.redirectUri, state: params.state || '',
      challenge: params.codeChallenge, scopes: this.scopes(params.scopes),
      csrf: digest(csrf), expiresAt: now() + 600,
    });
    res.cookie('__Host-pti-consent', csrf, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600000 });
    res.redirect(`${this.origin}/consent?request=${encodeURIComponent(requestId)}`);
  }
  async pending(requestId: string) { return checked(await this.store.get('pending', requestId)); }
  async approve(requestId: string, csrf: string, identity: UserIdentity) {
    await this.checkUser(identity.uid, identity.authenticatedAt);
    const pending = await this.pending(requestId);
    if (pending.csrf !== digest(csrf)) throw new InvalidGrantError('Consent session does not match');
    const code = secret();
    const value = { ...pending, ...identity, expiresAt: now() + 120 };
    await this.store.consume('pending', requestId, current => {
      checked(current);
      if (current.csrf !== digest(csrf)) throw new InvalidGrantError('Invalid consent session');
    }, [{ kind: 'codes', key: code, value }]);
    const url = new URL(String(pending.redirectUri));
    url.searchParams.set('code', code);
    if (pending.state) url.searchParams.set('state', String(pending.state));
    return url.href;
  }
  async challengeForAuthorizationCode(client: OAuthClientInformationFull, code: string) {
    const grant = checked(await this.store.get('codes', code));
    if (grant.clientId !== client.client_id) throw new InvalidGrantError('Client does not match');
    return String(grant.challenge);
  }
  private async exchange(kind: string, key: string, client: OAuthClientInformationFull, redirectUri?: string, scopes?: string[], resource?: URL): Promise<OAuthTokens> {
    this.target(resource);
    const grant = checked(await this.store.get(kind, key));
    const validate = (v: RecordValue) => {
      checked(v);
      if (v.clientId !== client.client_id) throw new InvalidGrantError('Client does not match');
      if (kind === 'codes' && redirectUri !== v.redirectUri) throw new InvalidGrantError('Redirect URI does not match');
      if (scopes?.some(s => !(v.scopes as string[]).includes(s))) throw new InvalidScopeError('Scope cannot be increased');
    };
    validate(grant);
    await this.checkUser(String(grant.uid), Number(grant.authenticatedAt));
    const sessionId = kind === 'codes' ? secret() : String(grant.sessionId);
    const session = kind === 'codes' ? { expiresAt: now() + SESSION_SECONDS, revoked: false } : await this.store.get('sessions', sessionId);
    if (!valid(session) || session.revoked) throw new InvalidGrantError('Session revoked or expired');
    const access = secret(), refresh = secret();
    const base = { clientId: grant.clientId, uid: grant.uid, email: grant.email,
      authenticatedAt: grant.authenticatedAt, scopes: this.scopes(scopes || grant.scopes as string[]), sessionId,
      resource: this.resource };
    const writes: { kind: string; key: string; value: RecordValue }[] = [
      { kind: 'access', key: access, value: { ...base, expiresAt: now() + ACCESS_SECONDS } },
      { kind: 'refresh', key: refresh, value: { ...base, expiresAt: Number(session.expiresAt) } },
      // Retain the hash of each refresh grant until session expiry so replay revokes the family.
      { kind: 'spent', key, value: { sessionId, clientId: client.client_id, expiresAt: Number(session.expiresAt) } },
    ];
    if (kind === 'codes') writes.push({ kind: 'sessions', key: sessionId, value: session });
    try { await this.store.consume(kind, key, validate, writes); }
    catch { throw new InvalidGrantError('Grant already used or no longer valid'); }
    return { access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: ACCESS_SECONDS, scope: base.scopes.join(' ') };
  }
  async exchangeAuthorizationCode(client: OAuthClientInformationFull, code: string, _verifier?: string, redirectUri?: string, resource?: URL) {
    return this.exchange('codes', code, client, redirectUri, undefined, resource);
  }
  async exchangeRefreshToken(client: OAuthClientInformationFull, refresh: string, scopes?: string[], resource?: URL) {
    const previous = await this.store.get('spent', refresh);
    if (previous?.clientId === client.client_id && valid(previous)) {
      await this.store.put('sessions', String(previous.sessionId), { revoked: true, expiresAt: previous.expiresAt });
      throw new InvalidGrantError('Refresh token replay detected; reconnect the client');
    }
    return this.exchange('refresh', refresh, client, undefined, scopes, resource);
  }
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const grant = await this.store.get('access', token);
    if (!valid(grant) || grant.resource !== this.resource) throw new InvalidTokenError('Invalid access token');
    const session = await this.store.get('sessions', String(grant.sessionId));
    if (!valid(session) || session.revoked) throw new InvalidTokenError('Session expired or revoked');
    try { await this.checkUser(String(grant.uid), Number(grant.authenticatedAt)); }
    catch { throw new InvalidTokenError('Administrator access has been revoked'); }
    return { token, clientId: String(grant.clientId), scopes: grant.scopes as string[],
      expiresAt: Number(grant.expiresAt), resource: new URL(this.resource), extra: { uid: grant.uid, email: grant.email } };
  }
  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest) {
    const grant = await this.store.get('access', request.token) || await this.store.get('refresh', request.token) || await this.store.get('spent', request.token);
    if (grant?.clientId === client.client_id) await this.store.put('sessions', String(grant.sessionId), { revoked: true, expiresAt: now() + SESSION_SECONDS });
  }
}

