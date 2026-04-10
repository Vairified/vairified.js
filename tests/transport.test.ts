/**
 * Tests that exercise the HTTP transport edge cases —
 * timeouts, empty bodies, custom fetch injection.
 */

import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { Vairified, VairifiedError } from '../src/index.js';
import { API_KEY, BASE_URL, installServer, server } from './helpers.js';

installServer();

describe('HTTP transport', () => {
  it('accepts an injected fetch', async () => {
    let called = false;
    const customFetch: typeof fetch = async (input, init) => {
      called = true;
      return fetch(input, init);
    };

    server.use(http.get(`${BASE_URL}/partner/usage`, () => HttpResponse.json({ ok: true })));

    const client = new Vairified({
      apiKey: API_KEY,
      baseUrl: BASE_URL,
      fetch: customFetch,
    });
    const usage = await client.usage();
    expect(called).toBe(true);
    expect((usage as { ok: boolean }).ok).toBe(true);
  });

  it('throws VairifiedError when response body is malformed JSON', async () => {
    server.use(
      http.get(
        `${BASE_URL}/partner/usage`,
        () =>
          new HttpResponse('this is not json', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    await expect(client.usage()).rejects.toThrowError(VairifiedError);
  });

  it('handles empty 200 body', async () => {
    server.use(http.get(`${BASE_URL}/partner/usage`, () => new HttpResponse('', { status: 200 })));
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const usage = await client.usage();
    expect(usage).toEqual({});
  });

  it('handles content-length 0 header', async () => {
    server.use(
      http.get(
        `${BASE_URL}/partner/usage`,
        () => new HttpResponse('', { status: 200, headers: { 'content-length': '0' } }),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const usage = await client.usage();
    expect(usage).toEqual({});
  });

  it('serializes array query params with commas', async () => {
    let capturedUrl: URL | null = null;
    server.use(
      http.get(`${BASE_URL}/partner/member`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json({
          memberId: 1,
          firstName: 'T',
          lastName: 'P',
          fullName: 'T P',
          displayName: 'T',
          status: {
            isVairified: false,
            isWheelchair: false,
            isAmbassador: false,
            isRater: false,
            isConnected: false,
          },
        });
      }),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    await client.members.get('vair_mem_xxx', { sport: ['pickleball', 'padel'] });
    expect(capturedUrl?.searchParams.get('sport')).toBe('pickleball,padel');
  });

  it('429 without Retry-After header leaves retryAfter undefined', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/member`, () =>
        HttpResponse.json({ message: 'slow' }, { status: 429 }),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    try {
      await client.members.get('vair_mem_xxx');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(VairifiedError);
      const ratelim = err as { retryAfter?: number };
      expect(ratelim.retryAfter).toBeUndefined();
    }
  });

  it('search passes sport filter as a string', async () => {
    let capturedSport: string | null = null;
    server.use(
      http.get(`${BASE_URL}/partner/search`, ({ request }) => {
        capturedSport = new URL(request.url).searchParams.get('sport');
        return HttpResponse.json([]);
      }),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    for await (const _ of client.members.search({ sport: 'pickleball' })) {
      /* drain */
    }
    expect(capturedSport).toBe('pickleball');
  });

  it('search passes sport filter as a list', async () => {
    let capturedSport: string | null = null;
    server.use(
      http.get(`${BASE_URL}/partner/search`, ({ request }) => {
        capturedSport = new URL(request.url).searchParams.get('sport');
        return HttpResponse.json([]);
      }),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    for await (const _ of client.members.search({ sport: ['pickleball', 'padel'] })) {
      /* drain */
    }
    expect(capturedSport).toBe('pickleball,padel');
  });

  it('oauth.exchangeToken handles empty response object', async () => {
    server.use(http.post(`${BASE_URL}/partner/oauth/token`, () => HttpResponse.json({})));
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const tokens = await client.oauth.exchangeToken({ code: 'c', redirectUri: 'r' });
    expect(tokens.accessToken).toBe('');
    expect(tokens.refreshToken).toBeNull();
    expect(tokens.expiresIn).toBe(3600);
    expect(tokens.playerId).toBe('');
  });

  it('matches.testWebhook handles empty 204', async () => {
    server.use(
      http.post(`${BASE_URL}/partner/webhook-test`, () => new HttpResponse(null, { status: 204 })),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const result = await client.matches.testWebhook('https://hook.example.com');
    expect(result).toEqual({});
  });

  it('oauth.revoke handles empty 204', async () => {
    server.use(
      http.post(`${BASE_URL}/partner/oauth/revoke`, () => new HttpResponse(null, { status: 204 })),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const result = await client.oauth.revoke('vair_mem_42');
    expect(result).toEqual({});
  });

  it('leaderboard.rank handles empty 204', async () => {
    server.use(
      http.post(`${BASE_URL}/leaderboard/rank`, () => new HttpResponse(null, { status: 204 })),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const result = await client.leaderboard.rank('vair_mem_42');
    expect(result).toEqual({});
  });

  it('leaderboard.categories handles empty 204', async () => {
    server.use(
      http.get(`${BASE_URL}/leaderboard/categories`, () => new HttpResponse(null, { status: 204 })),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const result = await client.leaderboard.categories();
    expect(result).toEqual({});
  });

  it('baseUrl without env resolves env to production default', () => {
    const client = new Vairified({
      apiKey: API_KEY,
      baseUrl: 'http://custom.example.com/api',
    });
    expect(client.env).toBe('production');
  });

  it('Member with missing sport field handles SportRating splits default', () => {
    server.use(
      http.get(`${BASE_URL}/partner/member`, () =>
        HttpResponse.json({
          memberId: 1,
          firstName: 'A',
          lastName: 'B',
          fullName: 'A B',
          displayName: 'A',
          status: {
            isVairified: false,
            isWheelchair: false,
            isAmbassador: false,
            isRater: false,
            isConnected: false,
          },
          sport: {
            // biome-ignore lint/suspicious/noExplicitAny: test wire payload
            pickleball: { rating: 4, abbr: 'VO' } as any,
          },
        }),
      ),
    );
    // Exercises the SportRating(ratingSplits ?? {}) fallback.
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    return client.members.get('vair_mem_xxx').then((member) => {
      expect(member.sport.get('pickleball')?.size).toBe(0);
    });
  });

  it('search forwards every filter', async () => {
    let params: URLSearchParams | null = null;
    server.use(
      http.get(`${BASE_URL}/partner/search`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json([]);
      }),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    for await (const _ of client.members.search({
      name: 'Mike',
      city: 'Austin',
      state: 'TX',
      country: 'US',
      zip: '78701',
      location: 'Central TX',
      gender: 'MALE',
      vairifiedOnly: true,
      wheelchair: false,
      ratingMin: 3.5,
      ratingMax: 4.5,
      sortBy: 'rating',
      sortOrder: 'desc',
    })) {
      /* drain */
    }
    expect(params?.get('member')).toBe('Mike');
    expect(params?.get('city')).toBe('Austin');
    expect(params?.get('country')).toBe('US');
    expect(params?.get('zip')).toBe('78701');
    expect(params?.get('location')).toBe('Central TX');
    expect(params?.get('gender')).toBe('MALE');
    expect(params?.get('vairified')).toBe('true');
    expect(params?.get('wheelchair')).toBe('false');
    expect(params?.get('rating1')).toBe('3.5');
    expect(params?.get('rating2')).toBe('4.5');
    expect(params?.get('sortField')).toBe('rating');
    expect(params?.get('sortDirection')).toBe('desc');
  });

  it('oauth.authorize tolerates empty response from the server', async () => {
    server.use(http.post(`${BASE_URL}/partner/oauth/authorize`, () => HttpResponse.json({})));
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const auth = await client.oauth.authorize({
      redirectUri: 'https://app.example.com/callback',
    });
    expect(auth.authorizationUrl).toBe('');
    expect(auth.code).toBe('');
  });

  it('VAIRIFIED_ENV with unknown value falls back to production base URL', () => {
    const prev = process.env.VAIRIFIED_ENV;
    process.env.VAIRIFIED_ENV = 'mars';
    try {
      const client = new Vairified({ apiKey: API_KEY });
      // Unknown env from env var is accepted but falls back to production URL.
      expect(client.env).toBe('mars');
      expect(client.baseUrl).toContain('vairified.com');
    } finally {
      if (prev !== undefined) {
        process.env.VAIRIFIED_ENV = prev;
      } else {
        delete process.env.VAIRIFIED_ENV;
      }
    }
  });

  it('ratingUpdates with dict response missing updates field', async () => {
    server.use(http.get(`${BASE_URL}/partner/rating-updates`, () => HttpResponse.json({})));
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const updates = await client.members.ratingUpdates();
    expect(updates).toEqual([]);
  });

  it('search returns nothing when the dict has an empty players array', async () => {
    server.use(http.get(`${BASE_URL}/partner/search`, () => HttpResponse.json({})));
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const collected: unknown[] = [];
    for await (const m of client.members.search({ name: 'x' })) {
      collected.push(m);
    }
    expect(collected).toEqual([]);
  });

  it('request timeout triggers an abort', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/usage`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return HttpResponse.json({ ok: true });
      }),
    );
    const client = new Vairified({
      apiKey: API_KEY,
      baseUrl: BASE_URL,
      timeoutMs: 20,
    });
    await expect(client.usage()).rejects.toThrow();
  });
});
