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
  };

  it('builds a URL with defaults', () => {
    const url = getAuthorizationUrl(config);
    expect(url).toContain('https://api.example.com/api/v1/partner/oauth/authorize?');
    expect(url).toContain('redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback');
    expect(url).toContain('scope=user%3Aprofile%3Aread%2Cuser%3Arating%3Aread');
    expect(url).toContain('response_type=code');
  });

  it('auto-prepends user:profile:read to custom scopes', () => {
    const url = getAuthorizationUrl(config, {
      scopes: ['user:rating:read', 'user:match:submit'],
    });
    expect(url).toContain('user%3Aprofile%3Aread');
    expect(url).toContain('user%3Amatch%3Asubmit');
  });

  it('includes state when provided', () => {
    const url = getAuthorizationUrl(config, { state: 'csrf-123' });
    expect(url).toContain('state=csrf-123');
  });

  it('omits state when absent', () => {
    const url = getAuthorizationUrl(config);
    expect(url).not.toContain('state=');
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
// ---------------------------------------------------------------------------

describe('client.oauth', () => {
  it('authorize()', async () => {
    let body: unknown = null;
    server.use(
      http.post(`${BASE_URL}/partner/oauth/authorize`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          authorizationUrl: 'https://vairified.com/connect/xyz',
          code: 'auth-code-123',
        });
      }),
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
    expect(body).toMatchObject({ state: 'csrf-xyz' });
    // user:profile:read auto-prepended
    expect(JSON.stringify(body)).toContain('user:profile:read');
  });

  it('authorize() uses DEFAULT_SCOPES when none are provided', async () => {
    server.use(
      http.post(`${BASE_URL}/partner/oauth/authorize`, () =>
        HttpResponse.json({ authorizationUrl: 'https://x.example.com', code: 'c' }),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const auth = await client.oauth.authorize({
      redirectUri: 'https://app.example.com/callback',
    });
    expect(auth.authorizationUrl).toBe('https://x.example.com');
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

  it('exchangeToken()', async () => {
    server.use(
      http.post(`${BASE_URL}/partner/oauth/token`, () =>
        HttpResponse.json({
          accessToken: 'access-xyz',
          refreshToken: 'refresh-xyz',
          expiresIn: 3600,
          scope: 'user:profile:read,user:rating:read',
          playerId: 'vair_mem_42',
        }),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const tokens = await client.oauth.exchangeToken({
      code: 'code-123',
      redirectUri: 'https://app.example.com/callback',
    });
    expect(tokens.accessToken).toBe('access-xyz');
    expect(tokens.refreshToken).toBe('refresh-xyz');
    expect(tokens.scope).toEqual(['user:profile:read', 'user:rating:read']);
    expect(tokens.playerId).toBe('vair_mem_42');
  });

  it('exchangeToken() handles empty scope string and null refresh', async () => {
    server.use(
      http.post(`${BASE_URL}/partner/oauth/token`, () =>
        HttpResponse.json({
          accessToken: 'a',
          refreshToken: null,
          expiresIn: 3600,
          scope: '',
          playerId: 'p',
        }),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const tokens = await client.oauth.exchangeToken({ code: 'c', redirectUri: 'r' });
    expect(tokens.scope).toEqual([]);
    expect(tokens.refreshToken).toBeNull();
  });

  it('refresh()', async () => {
    server.use(
      http.post(`${BASE_URL}/partner/oauth/refresh`, () =>
        HttpResponse.json({
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          expiresIn: 3600,
          scope: 'user:profile:read',
          playerId: 'vair_mem_42',
        }),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const tokens = await client.oauth.refresh('old-refresh');
    expect(tokens.accessToken).toBe('new-access');
  });

  it('revoke()', async () => {
    server.use(
      http.post(`${BASE_URL}/partner/oauth/revoke`, () => HttpResponse.json({ success: true })),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const result = await client.oauth.revoke('vair_mem_42');
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
