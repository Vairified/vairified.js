/**
 * Tests for the OAuth resource and the pure helper functions.
 */

import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SCOPES,
  describeScope,
  describeScopes,
  generateState,
  getAuthorizationUrl,
  OAuthError,
  SCOPES,
  Vairified,
  validateScope,
} from '../src/index.js';
import { API_KEY, BASE_URL, installServer, server } from './helpers.js';

installServer();

// ---------------------------------------------------------------------------
// Pure helpers (no HTTP)
// ---------------------------------------------------------------------------

describe('oauth helpers', () => {
  it('validates known and unknown scopes', () => {
    for (const scope of Object.keys(SCOPES)) {
      expect(validateScope(scope)).toBe(true);
    }
    expect(validateScope('not-a-scope')).toBe(false);
    expect(validateScope('')).toBe(false);
  });

  it('describes known scopes', () => {
    expect(describeScope('user:profile:read').toLowerCase()).toContain('verification');
  });

  it('flags unknown scopes in describeScope', () => {
    expect(describeScope('foo:bar')).toContain('Unknown scope');
    expect(describeScope('foo:bar')).toContain('foo:bar');
  });

  it('describeScopes returns parallel list', () => {
    const result = describeScopes(['user:profile:read', 'user:rating:read']);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      scope: 'user:profile:read',
      description: SCOPES['user:profile:read'],
    });
  });

  it('DEFAULT_SCOPES includes user:profile:read', () => {
    expect(DEFAULT_SCOPES).toContain('user:profile:read');
  });

  it('generateState returns URL-safe random strings', () => {
    const a = generateState();
    const b = generateState();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('getAuthorizationUrl', () => {
  const config = {
    apiKey: API_KEY,
    redirectUri: 'https://app.example.com/callback',
    baseUrl: 'https://api.example.com/api/v1',
    clientId: 'dinkr',
  };

  it('builds a URL with defaults (space-delimited scope + client_id)', () => {
    const url = getAuthorizationUrl(config);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/v1/partner/oauth/authorize');
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://app.example.com/callback');
    // RFC 6749 §3.3 — scopes are space-delimited, never comma-joined.
    expect(parsed.searchParams.get('scope')).toBe('user:profile:read user:rating:read');
    expect(url).not.toContain('%2C'); // no encoded comma between scopes
    expect(parsed.searchParams.get('response_type')).toBe('code');
    // client_id (PartnerApp slug) identifies the app to the GET authorize endpoint.
    expect(parsed.searchParams.get('client_id')).toBe('dinkr');
  });

  it('omits client_id when not configured', () => {
    const url = getAuthorizationUrl({
      apiKey: API_KEY,
      redirectUri: 'https://app.example.com/callback',
      baseUrl: 'https://api.example.com/api/v1',
    });
    expect(new URL(url).searchParams.has('client_id')).toBe(false);
  });

  it('auto-prepends user:profile:read to custom scopes (space-delimited)', () => {
    const url = getAuthorizationUrl(config, {
      scopes: ['user:rating:read', 'user:match:submit'],
    });
    expect(new URL(url).searchParams.get('scope')).toBe(
      'user:profile:read user:rating:read user:match:submit',
    );
  });

  it('includes state when provided', () => {
    const url = getAuthorizationUrl(config, { state: 'csrf-123' });
    expect(new URL(url).searchParams.get('state')).toBe('csrf-123');
  });

  it('omits state when absent', () => {
    const url = getAuthorizationUrl(config);
    expect(new URL(url).searchParams.has('state')).toBe(false);
  });

  it('strips trailing slashes from baseUrl', () => {
    const url = getAuthorizationUrl({ ...config, baseUrl: 'https://api.example.com/api/v1///' });
    expect(url).toContain('https://api.example.com/api/v1/partner/oauth/authorize');
  });

  it('falls back to the production URL when baseUrl is omitted', () => {
    const url = getAuthorizationUrl({ apiKey: API_KEY, redirectUri: 'https://a.example.com/cb' });
    expect(url).toContain('api-next.vairified.com');
  });
});

// ---------------------------------------------------------------------------
// OAuthResource — HTTP methods
//
// These assert the EXACT wire the deployed api-next Partner API expects
// (snake_case bodies, space-delimited scope, grant_type, snake_case
// responses). Regressing any of them silently breaks partner integrations
// (#844), so each test checks the request body/query, not just the mapping.
// ---------------------------------------------------------------------------

describe('client.oauth', () => {
  it('authorize() sends snake_case redirect_uri + space-delimited scope, reads authorization_url', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(
        `${BASE_URL}/partner/oauth/authorize`,
        async ({ request }: { request: Request }) => {
          body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            authorization_url: 'https://vairified.com/connect/xyz',
            code: 'auth-code-123',
          });
        },
      ),
    );

    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const auth = await client.oauth.authorize({
      redirectUri: 'https://app.example.com/callback',
      scopes: ['user:rating:read'],
      state: 'csrf-xyz',
    });

    expect(auth.authorizationUrl).toBe('https://vairified.com/connect/xyz');
    expect(auth.code).toBe('auth-code-123');
    expect(auth.state).toBe('csrf-xyz');
    // exact request wire
    expect(body.redirect_uri).toBe('https://app.example.com/callback');
    expect(body).not.toHaveProperty('redirectUri');
    // space-delimited, user:profile:read auto-prepended
    expect(body.scope).toBe('user:profile:read user:rating:read');
    expect(body.state).toBe('csrf-xyz');
  });

  it('authorize() uses DEFAULT_SCOPES when none are provided', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(
        `${BASE_URL}/partner/oauth/authorize`,
        async ({ request }: { request: Request }) => {
          body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ authorization_url: 'https://x.example.com', code: 'c' });
        },
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const auth = await client.oauth.authorize({
      redirectUri: 'https://app.example.com/callback',
    });
    expect(auth.authorizationUrl).toBe('https://x.example.com');
    expect(body.scope).toBe('user:profile:read user:rating:read');
  });

  it('authorize() rejects invalid scopes', async () => {
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    try {
      await client.oauth.authorize({
        redirectUri: 'https://app.example.com/callback',
        // biome-ignore lint/suspicious/noExplicitAny: testing bad input
        scopes: ['user:profile:read', 'not-a-real-scope' as any],
      });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(OAuthError);
      expect((err as OAuthError).errorCode).toBe('invalid_scope');
    }
  });

  it('exchangeToken() sends grant_type + snake_case redirect_uri, parses snake response', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${BASE_URL}/partner/oauth/token`, async ({ request }: { request: Request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          access_token: 'access-xyz',
          token_type: 'Bearer',
          refresh_token: 'refresh-xyz',
          expires_in: 3600,
          scope: 'user:profile:read user:rating:read',
          player_id: 'vair_mem_42',
        });
      }),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const tokens = await client.oauth.exchangeToken({
      code: 'code-123',
      redirectUri: 'https://app.example.com/callback',
    });
    // request wire (RFC 6749 §4.1.3)
    expect(body.grant_type).toBe('authorization_code');
    expect(body.code).toBe('code-123');
    expect(body.redirect_uri).toBe('https://app.example.com/callback');
    expect(body).not.toHaveProperty('redirectUri');
    // response mapping (snake -> camel)
    expect(tokens.accessToken).toBe('access-xyz');
    expect(tokens.refreshToken).toBe('refresh-xyz');
    expect(tokens.scope).toEqual(['user:profile:read', 'user:rating:read']);
    expect(tokens.playerId).toBe('vair_mem_42');
  });

  it('exchangeToken() handles empty scope + null refresh, and falls back to the deprecated scopes[] array', async () => {
    server.use(
      http.post(`${BASE_URL}/partner/oauth/token`, () =>
        HttpResponse.json({
          access_token: 'a',
          refresh_token: null,
          expires_in: 3600,
          scope: '',
          scopes: ['user:profile:read'], // deprecated array — used only when `scope` is empty
          player_id: 'p',
        }),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const tokens = await client.oauth.exchangeToken({ code: 'c', redirectUri: 'r' });
    expect(tokens.scope).toEqual(['user:profile:read']);
    expect(tokens.refreshToken).toBeNull();
  });

  it('refresh() sends grant_type=refresh_token + snake_case refresh_token', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${BASE_URL}/partner/oauth/refresh`, async ({ request }: { request: Request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
          scope: 'user:profile:read',
          player_id: 'vair_mem_42',
        });
      }),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const tokens = await client.oauth.refresh('old-refresh');
    expect(body.grant_type).toBe('refresh_token');
    expect(body.refresh_token).toBe('old-refresh');
    expect(body).not.toHaveProperty('refreshToken');
    expect(tokens.accessToken).toBe('new-access');
  });

  it('revoke() sends snake_case player_id', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${BASE_URL}/partner/oauth/revoke`, async ({ request }: { request: Request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ success: true });
      }),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const result = await client.oauth.revoke('vair_mem_42');
    expect(body.player_id).toBe('vair_mem_42');
    expect(body).not.toHaveProperty('playerId');
    expect(result).toEqual({ success: true });
  });

  it('availableScopes()', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/oauth/scopes`, () =>
        HttpResponse.json({
          scopes: [
            { name: 'user:profile:read', description: 'Profile access' },
            { name: 'user:rating:read', description: 'Rating access' },
          ],
        }),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const scopes = await client.oauth.availableScopes();
    expect(scopes).toHaveLength(2);
    expect(scopes[0]?.name).toBe('user:profile:read');
  });

  it('availableScopes() returns [] when server response is unexpected', async () => {
    server.use(http.get(`${BASE_URL}/partner/oauth/scopes`, () => HttpResponse.json([])));
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const scopes = await client.oauth.availableScopes();
    expect(scopes).toEqual([]);
  });
});
