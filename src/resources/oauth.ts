/**
 * {@link OAuthResource} — OAuth 2.0 flow for player consent.
 *
 * @module
 */

import { OAuthError } from '../errors.js';
import type { HttpTransport } from '../http.js';
import {
  type AuthorizationResponse,
  DEFAULT_SCOPES,
  ensureProfileRead,
  type OAuthScope,
  SCOPES,
  type TokenResponse,
} from '../oauth.js';

/**
 * OAuth 2.0 flow for obtaining player consent.
 *
 * Typical flow:
 *
 * 1. {@link authorize} — start an authorization, get a URL to redirect
 *    the player to.
 * 2. Player approves on the Vairified site and is redirected back to
 *    your `redirectUri` with a `code` query parameter.
 * 3. {@link exchangeToken} — swap the code for access and refresh
 *    tokens plus the player's external ID.
 * 4. Store the refresh token and call {@link refresh} when the access
 *    token expires.
 * 5. {@link revoke} — disconnect a player from your app.
 *
 * @category Resources
 */
export class OAuthResource {
  readonly #http: HttpTransport;

  /** @internal */
  constructor(http: HttpTransport) {
    this.#http = http;
  }

  /**
   * Start an OAuth authorization flow.
   *
   * @throws {@link OAuthError} with `errorCode: 'invalid_scope'` if a
   *   requested scope is not in the accepted list.
   */
  async authorize(options: {
    redirectUri: string;
    scopes?: readonly OAuthScope[];
    state?: string;
  }): Promise<AuthorizationResponse> {
    const scopeList = ensureProfileRead(options.scopes ?? DEFAULT_SCOPES);

    for (const scope of scopeList) {
      if (!(scope in SCOPES)) {
        throw new OAuthError(`Invalid scope: ${scope}`, 'invalid_scope');
      }
    }

    const data = await this.#http.request<{
      authorization_url?: string;
      code?: string;
    }>({
      method: 'POST',
      path: '/partner/oauth/authorize',
      body: {
        redirect_uri: options.redirectUri,
        scope: scopeList.join(' '),
        state: options.state,
      },
    });

    return {
      authorizationUrl: data?.authorization_url ?? '',
      code: data?.code ?? '',
      state: options.state,
    };
  }

  /** Exchange an authorization code for access and refresh tokens. */
  async exchangeToken(options: { code: string; redirectUri: string }): Promise<TokenResponse> {
    const data = await this.#http.request<Record<string, unknown>>({
      method: 'POST',
      path: '/partner/oauth/token',
      // RFC 6749 §4.1.3 — the endpoint requires `grant_type` and the
      // snake_case `redirect_uri` (which must match the authorize request).
      body: {
        grant_type: 'authorization_code',
        code: options.code,
        redirect_uri: options.redirectUri,
      },
    });
    return tokenResponseFromWire(data);
  }

  /** Refresh an expired access token using a refresh token. */
  async refresh(refreshToken: string): Promise<TokenResponse> {
    const data = await this.#http.request<Record<string, unknown>>({
      method: 'POST',
      path: '/partner/oauth/refresh',
      // RFC 6749 §6 — refresh grant, snake_case body.
      body: { grant_type: 'refresh_token', refresh_token: refreshToken },
    });
    return tokenResponseFromWire(data);
  }

  /** Revoke a player's OAuth connection to your app. */
  async revoke(playerId: string): Promise<Record<string, unknown>> {
    const data = await this.#http.request<Record<string, unknown> | undefined>({
      method: 'POST',
      path: '/partner/oauth/revoke',
      body: { player_id: playerId },
    });
    return data ?? {};
  }

  /** Return the list of OAuth scopes the server currently supports. */
  async availableScopes(): Promise<readonly { name: string; description: string }[]> {
    const data = await this.#http.request<
      { scopes?: { name: string; description: string }[] } | unknown
    >({
      method: 'GET',
      path: '/partner/oauth/scopes',
    });
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return [];
    }
    return (data as { scopes?: { name: string; description: string }[] }).scopes ?? [];
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function tokenResponseFromWire(data: Record<string, unknown> | undefined): TokenResponse {
  // The API returns `scope` as a space-delimited string (RFC 6749 §3.3).
  // Fall back to the deprecated `scopes` array for older API builds.
  const scopeRaw = (data?.scope ?? '') as string;
  const scopeList =
    scopeRaw.length > 0
      ? scopeRaw.split(/\s+/).filter(Boolean)
      : Array.isArray(data?.scopes)
        ? (data.scopes as string[])
        : [];
  return {
    accessToken: (data?.access_token ?? '') as string,
    refreshToken: (data?.refresh_token ?? null) as string | null,
    expiresIn: (data?.expires_in ?? 3600) as number,
    scope: Object.freeze(scopeList),
    playerId: (data?.player_id ?? '') as string,
  };
}
