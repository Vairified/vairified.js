/**
 * Tests for client.leaderboard and client.usage().
 */

import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { Vairified } from '../src/index.js';
import { API_KEY, BASE_URL, installServer, server } from './helpers.js';

installServer();

describe('client.leaderboard', () => {
  it('list() with defaults', async () => {
    let url: URL | null = null;
    server.use(
      http.get(`${BASE_URL}/leaderboard`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({
          players: [
            { rank: 1, displayName: 'A', rating: 5.5 },
            { rank: 2, displayName: 'B', rating: 5.4 },
          ],
          total: 2,
        });
      }),
    );

    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const data = await client.leaderboard.list();

    expect((data as { players: unknown[] }).players).toHaveLength(2);
    expect(url?.searchParams.get('limit')).toBe('50');
    expect(url?.searchParams.get('offset')).toBe('0');
    expect(url?.searchParams.get('verifiedOnly')).toBeNull();
  });

  it('list() forwards every filter', async () => {
    let params: URLSearchParams | null = null;
    server.use(
      http.get(`${BASE_URL}/leaderboard`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json({ players: [] });
      }),
    );

    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    await client.leaderboard.list({
      category: 'singles',
      ageBracket: '50+',
      scope: 'state',
      state: 'TX',
      city: 'Austin',
      clubId: 'club_1',
      gender: 'male',
      verifiedOnly: true,
      minGames: 10,
      limit: 20,
      offset: 40,
      search: 'Mike',
    });

    expect(params?.get('category')).toBe('singles');
    expect(params?.get('ageBracket')).toBe('50+');
    expect(params?.get('state')).toBe('TX');
    expect(params?.get('city')).toBe('Austin');
    expect(params?.get('clubId')).toBe('club_1');
    expect(params?.get('gender')).toBe('MALE');
    expect(params?.get('minGames')).toBe('10');
    expect(params?.get('verifiedOnly')).toBe('true');
    expect(params?.get('limit')).toBe('20');
    expect(params?.get('offset')).toBe('40');
    expect(params?.get('search')).toBe('Mike');
  });

  it('list() returns {} on 204', async () => {
    server.use(http.get(`${BASE_URL}/leaderboard`, () => new HttpResponse(null, { status: 204 })));
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const data = await client.leaderboard.list();
    expect(data).toEqual({});
  });

  it('rank() with every option', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE_URL}/leaderboard/rank`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ rank: 42, percentile: 93.7 });
      }),
    );

    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const result = await client.leaderboard.rank('vair_mem_42', {
      category: 'doubles',
      ageBracket: 'open',
      scope: 'state',
      state: 'TX',
      city: 'Austin',
      clubId: 'club_1',
      contextSize: 10,
    });

    expect((result as { rank: number }).rank).toBe(42);
    expect(body).toMatchObject({
      playerId: 'vair_mem_42',
      category: 'doubles',
      ageBracket: 'open',
      scope: 'state',
      state: 'TX',
      city: 'Austin',
      clubId: 'club_1',
      contextSize: 10,
    });
  });

  it('rank() with defaults', async () => {
    server.use(http.post(`${BASE_URL}/leaderboard/rank`, () => HttpResponse.json({ rank: 1 })));
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const result = await client.leaderboard.rank('vair_mem_42');
    expect((result as { rank: number }).rank).toBe(1);
  });

  it('categories()', async () => {
    server.use(
      http.get(`${BASE_URL}/leaderboard/categories`, () =>
        HttpResponse.json({
          categories: ['singles', 'doubles', 'mixed'],
          ageBrackets: ['open', '40+', '50+'],
        }),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const data = await client.leaderboard.categories();
    expect((data as { categories: string[] }).categories).toContain('singles');
  });
});

describe('client.usage', () => {
  it('returns the payload', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/usage`, () =>
        HttpResponse.json({ rateLimit: 10000, requestsToday: 42 }),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const usage = await client.usage();
    expect((usage as { requestsToday: number }).requestsToday).toBe(42);
  });

  it('returns {} on 204', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/usage`, () => new HttpResponse(null, { status: 204 })),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const usage = await client.usage();
    expect(usage).toEqual({});
  });
});
