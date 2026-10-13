/**
 * Tests for client.leaderboard and client.usage().
 */

import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { Vairified } from '../src/index.js';
import { resetDeprecationWarnings } from '../src/resources/leaderboard.js';
import { API_KEY, BASE_URL, installServer, server } from './helpers.js';

installServer();

// The backend's DTO field lists (Vairified src/domain/leaderboard/dto,
// LeaderboardQueryDto / PlayerRankQueryDto). The global ValidationPipe runs with
// forbidNonWhitelisted, so any key outside these is a 400 — which is how rank()
// failed on every call while it sent `contextSize`.
const LEADERBOARD_QUERY_DTO_FIELDS = new Set([
  'sportCode',
  'category',
  'ageBracket',
  'scope',
  'state',
  'city',
  'gender',
  'verifiedOnly',
  'minGames',
  'limit',
  'offset',
  'search',
  'sortBy',
  'lat',
  'lng',
  'maxDistance',
  'ratingTier',
]);
const PLAYER_RANK_DTO_FIELDS = new Set([
  'playerId',
  'sportCode',
  'category',
  'ageBracket',
  'scope',
  'state',
  'gender',
  'verifiedOnly',
  'minGames',
  'context',
]);

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  resetDeprecationWarnings();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

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
    expect((url as URL | null)?.searchParams.get('limit')).toBe('50');
    expect((url as URL | null)?.searchParams.get('offset')).toBe('0');
    expect((url as URL | null)?.searchParams.get('verifiedOnly')).toBeNull();
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
      sportCode: 'padel',
      category: 'singles',
      ageBracket: '50+',
      scope: 'state',
      state: 'TX',
      city: 'Austin',
      gender: 'male',
      verifiedOnly: true,
      minGames: 10,
      limit: 20,
      offset: 40,
      search: 'Mike',
    });

    expect((params as URLSearchParams | null)?.get('sportCode')).toBe('padel');
    expect((params as URLSearchParams | null)?.get('category')).toBe('singles');
    expect((params as URLSearchParams | null)?.get('ageBracket')).toBe('50+');
    expect((params as URLSearchParams | null)?.get('state')).toBe('TX');
    expect((params as URLSearchParams | null)?.get('city')).toBe('Austin');
    expect((params as URLSearchParams | null)?.get('gender')).toBe('MALE');
    expect((params as URLSearchParams | null)?.get('minGames')).toBe('10');
    expect((params as URLSearchParams | null)?.get('verifiedOnly')).toBe('true');
    expect((params as URLSearchParams | null)?.get('limit')).toBe('20');
    expect((params as URLSearchParams | null)?.get('offset')).toBe('40');
    expect((params as URLSearchParams | null)?.get('search')).toBe('Mike');
    const keys = [...((params as URLSearchParams | null)?.keys() ?? [])];
    expect(keys.filter((k) => !LEADERBOARD_QUERY_DTO_FIELDS.has(k))).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('list() accepts the deprecated clubId, never sends it, and warns once', async () => {
    const seen: string[][] = [];
    server.use(
      http.get(`${BASE_URL}/leaderboard`, ({ request }) => {
        seen.push([...new URL(request.url).searchParams.keys()]);
        return HttpResponse.json({ players: [] });
      }),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    await client.leaderboard.list({ clubId: 'club_1' });
    await client.leaderboard.list({ clubId: 'club_1' });

    for (const keys of seen) {
      expect(keys).not.toContain('clubId');
      expect(keys.filter((k) => !LEADERBOARD_QUERY_DTO_FIELDS.has(k))).toEqual([]);
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('LeaderboardOptions.clubId is deprecated');
  });

  it('list() returns {} on 204', async () => {
    server.use(http.get(`${BASE_URL}/leaderboard`, () => new HttpResponse(null, { status: 204 })));
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const data = await client.leaderboard.list();
    expect(data).toEqual({});
  });

  it('rank() with every option sends exactly the DTO body', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE_URL}/leaderboard/rank`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ rank: 42, percentile: 93.7 });
      }),
    );

    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const result = await client.leaderboard.rank('vair_mem_42', {
      sportCode: 'padel',
      category: 'singles',
      ageBracket: 'open',
      scope: 'state',
      state: 'TX',
      contextSize: 10,
    });

    expect((result as { rank: number }).rank).toBe(42);
    expect(body).toEqual({
      playerId: 'vair_mem_42',
      sportCode: 'padel',
      category: 'singles',
      ageBracket: 'open',
      scope: 'state',
      state: 'TX',
      context: 10,
    });
    expect(Object.keys(body ?? {}).filter((k) => !PLAYER_RANK_DTO_FIELDS.has(k))).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('rank() with defaults sends exactly the DTO body', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE_URL}/leaderboard/rank`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ rank: 1 });
      }),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const result = await client.leaderboard.rank('vair_mem_42');
    expect((result as { rank: number }).rank).toBe(1);
    expect(body).toEqual({
      playerId: 'vair_mem_42',
      category: 'overall',
      ageBracket: 'open',
      scope: 'global',
      context: 5,
    });
  });

  it('rank() accepts the deprecated city / clubId, never sends them, and warns once each', async () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.post(`${BASE_URL}/leaderboard/rank`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ rank: 1 });
      }),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    await client.leaderboard.rank('vair_mem_42', { city: 'Austin', clubId: 'club_1' });
    await client.leaderboard.rank('vair_mem_42', { city: 'Austin', clubId: 'club_1' });

    for (const body of bodies) {
      expect(body).not.toHaveProperty('city');
      expect(body).not.toHaveProperty('clubId');
      expect(Object.keys(body).filter((k) => !PLAYER_RANK_DTO_FIELDS.has(k))).toEqual([]);
    }
    expect(warn).toHaveBeenCalledTimes(2);
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes('PlayerRankOptions.city is deprecated'))).toBe(true);
    expect(messages.some((m) => m.includes('PlayerRankOptions.clubId is deprecated'))).toBe(true);
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
