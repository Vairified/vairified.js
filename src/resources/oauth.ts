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
      authorizationUrl?: string;
      code?: string;
    }>({
      method: 'POST',
      path: '/partner/oauth/authorize',
      body: {
        redirectUri: options.redirectUri,
        scope: scopeList.join(','),
        state: options.state,
      },
    });

    return {
      authorizationUrl: data?.authorizationUrl ?? '',
      code: data?.code ?? '',
      state: options.state,
    };
  }

  /** Exchange an authorization code for access and refresh tokens. */
  async exchangeToken(options: { code: string; redirectUri: string }): Promise<TokenResponse> {
    const data = await this.#http.request<Record<string, unknown>>({
      method: 'POST',
      path: '/partner/oauth/token',
      body: { code: options.code, redirectUri: options.redirectUri },
    });
    return tokenResponseFromWire(data);
  }

  /** Refresh an expired access token using a refresh token. */
  async refresh(refreshToken: string): Promise<TokenResponse> {
    const data = await this.#http.request<Record<string, unknown>>({
      method: 'POST',
      path: '/partner/oauth/refresh',
      body: { refreshToken },
    });
    return tokenResponseFromWire(data);
  }

  /** Revoke a player's OAuth connection to your app. */
  async revoke(playerId: string): Promise<Record<string, unknown>> {
    const data = await this.#http.request<Record<string, unknown> | undefined>({
      method: 'POST',
      path: '/partner/oauth/revoke',
      body: { playerId },
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
  const scopeRaw = (data?.scope ?? '') as string;
  const scopeList = scopeRaw.length > 0 ? scopeRaw.split(',') : [];
  return {
    accessToken: (data?.accessToken ?? '') as string,
    refreshToken: (data?.refreshToken ?? null) as string | null,
    expiresIn: (data?.expiresIn ?? 3600) as number,
    scope: Object.freeze(scopeList),
    playerId: (data?.playerId ?? '') as string,
  };
}
