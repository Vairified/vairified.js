/**
 * Tests for client construction, the Members resource, and errors.
 */

import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import {
  AuthenticationError,
  MatchBatchResult,
  Member,
  NotFoundError,
  RateLimitError,
  SportRating,
  Vairified,
  VairifiedError,
  ValidationError,
} from '../src/index.js';
import { API_KEY, BASE_URL, installServer, memberPayload, server } from './helpers.js';

installServer();

// ---------------------------------------------------------------------------
// Client construction
// ---------------------------------------------------------------------------

describe('Vairified client', () => {
  it('throws without an API key', () => {
    const prev = process.env.VAIRIFIED_API_KEY;
    delete process.env.VAIRIFIED_API_KEY;
    try {
      expect(() => new Vairified()).toThrow('API key required');
    } finally {
      if (prev !== undefined) process.env.VAIRIFIED_API_KEY = prev;
    }
  });

  it('reads apiKey from process.env', () => {
    process.env.VAIRIFIED_API_KEY = 'vair_pk_from_env';
    try {
      const client = new Vairified();
      expect(client.apiKey).toBe('vair_pk_from_env');
      expect(client.env).toBe('production');
    } finally {
      delete process.env.VAIRIFIED_API_KEY;
    }
  });

  it('accepts env presets', () => {
    const staging = new Vairified({ apiKey: API_KEY, env: 'staging' });
    expect(staging.env).toBe('staging');
    expect(staging.baseUrl).toContain('staging');

    const local = new Vairified({ apiKey: API_KEY, env: 'local' });
    expect(local.baseUrl).toBe('http://localhost:3001/api/v1');
  });

  it('rejects unknown environments', () => {
    expect(
      () =>
        new Vairified({
          apiKey: API_KEY,
          // biome-ignore lint/suspicious/noExplicitAny: testing bad input
          env: 'mars' as any,
        }),
    ).toThrow('Unknown environment');
  });

  it('baseUrl overrides env', () => {
    const client = new Vairified({
      apiKey: API_KEY,
      baseUrl: 'http://localhost:3001/api/v1',
    });
    expect(client.baseUrl).toBe('http://localhost:3001/api/v1');
  });

  it('strips trailing slashes from baseUrl', () => {
    const client = new Vairified({ apiKey: API_KEY, baseUrl: 'https://x.example.com/api/v1//' });
    expect(client.baseUrl).toBe('https://x.example.com/api/v1');
  });

  it('exposes all four sub-resources', () => {
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    expect(client.members).toBeDefined();
    expect(client.matches).toBeDefined();
    expect(client.oauth).toBeDefined();
    expect(client.leaderboard).toBeDefined();
  });

  it('has a useful toString', () => {
    const client = new Vairified({ apiKey: API_KEY, env: 'production' });
    expect(String(client)).toContain('production');
  });

  it('supports await using (Symbol.asyncDispose)', async () => {
    // Just verify the symbol is wired — close() is a no-op today.
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    expect(typeof client[Symbol.asyncDispose]).toBe('function');
    await client[Symbol.asyncDispose]();
  });
});

// ---------------------------------------------------------------------------
// MembersResource.get
// ---------------------------------------------------------------------------

describe('client.members.get', () => {
  it('returns a Member instance with computed getters', async () => {
    server.use(http.get(`${BASE_URL}/partner/member`, () => HttpResponse.json(memberPayload())));

    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const member = await client.members.get('vair_mem_xxx');

    expect(member).toBeInstanceOf(Member);
    expect(member.memberId).toBe(4873327);
    expect(member.name).toBe('Mike Barker');
    expect(member.displayName).toBe('Mike B.');
    expect(member.gender).toBe('MALE');
    expect(member.status.isVairified).toBe(true);
    expect(member.sports).toEqual(['pickleball']);
    expect(member.ratingFor('pickleball')).toBeCloseTo(3.915);
    expect(member.ratingFor('padel')).toBeNull();
  });

  it('passes a single sport filter as a string', async () => {
    let capturedSport: string | null = null;
    server.use(
      http.get(`${BASE_URL}/partner/member`, ({ request }) => {
        capturedSport = new URL(request.url).searchParams.get('sport');
        return HttpResponse.json(memberPayload());
      }),
    );

    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    await client.members.get('vair_mem_xxx', { sport: 'pickleball' });
    expect(capturedSport).toBe('pickleball');
  });

  it('joins a list of sports with commas', async () => {
    let capturedSport: string | null = null;
    server.use(
      http.get(`${BASE_URL}/partner/member`, ({ request }) => {
        capturedSport = new URL(request.url).searchParams.get('sport');
        return HttpResponse.json(memberPayload());
      }),
    );

    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    await client.members.get('vair_mem_xxx', { sport: ['pickleball', 'padel'] });
    expect(capturedSport).toBe('pickleball,padel');
  });
});

// ---------------------------------------------------------------------------
// MembersResource.search — async iterator + pagination
// ---------------------------------------------------------------------------

describe('client.members.search', () => {
  it('auto-paginates across multiple pages', async () => {
    const page1 = [memberPayload({ memberId: 1 }), memberPayload({ memberId: 2 })];
    const page2 = [memberPayload({ memberId: 3 })]; // short — signals end

    let hit = 0;
    server.use(
      http.get(`${BASE_URL}/partner/search`, () => {
        hit += 1;
        return HttpResponse.json(hit === 1 ? page1 : page2);
      }),
    );

    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const collected: number[] = [];
    for await (const m of client.members.search({ city: 'Austin', pageSize: 2 })) {
      collected.push(m.memberId);
    }
    expect(collected).toEqual([1, 2, 3]);
    expect(hit).toBe(2);
  });

  it('honors maxResults', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/search`, () =>
        HttpResponse.json([
          memberPayload({ memberId: 1 }),
          memberPayload({ memberId: 2 }),
          memberPayload({ memberId: 3 }),
        ]),
      ),
    );

    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const collected: number[] = [];
    for await (const m of client.members.search({ name: 'Mike', maxResults: 2 })) {
      collected.push(m.memberId);
    }
    expect(collected).toEqual([1, 2]);
  });

  it('find() returns the first hit or null', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/search`, () =>
        HttpResponse.json([memberPayload({ memberId: 42 })]),
      ),
    );

    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const hit = await client.members.find('Mike');
    expect(hit?.memberId).toBe(42);

    server.use(http.get(`${BASE_URL}/partner/search`, () => HttpResponse.json([])));
    const miss = await client.members.find('Nobody');
    expect(miss).toBeNull();
  });

  it('accepts a dict-shaped search response', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/search`, () =>
        HttpResponse.json({ players: [memberPayload({ memberId: 99 })] }),
      ),
    );

    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const collected: number[] = [];
    for await (const m of client.members.search({ name: 'x' })) {
      collected.push(m.memberId);
    }
    expect(collected).toEqual([99]);
  });

  it('exercises every age filter branch', async () => {
    const captured: Record<string, string | null> = {};
    server.use(
      http.get(`${BASE_URL}/partner/search`, ({ request }) => {
        const url = new URL(request.url);
        captured.type = url.searchParams.get('ageFilterType');
        captured.age1 = url.searchParams.get('age1');
        captured.age2 = url.searchParams.get('age2');
        return HttpResponse.json([]);
      }),
    );

    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });

    for await (const _ of client.members.search({ age: 35 })) {
      /* drain */
    }
    expect(captured).toEqual({ type: 'exact', age1: '35', age2: null });

    for await (const _ of client.members.search({ ageMin: 30, ageMax: 40 })) {
      /* drain */
    }
    expect(captured).toEqual({ type: 'range', age1: '30', age2: '40' });

    for await (const _ of client.members.search({ ageMin: 50 })) {
      /* drain */
    }
    expect(captured).toEqual({ type: 'above', age1: '50', age2: null });

    for await (const _ of client.members.search({ ageMax: 25 })) {
      /* drain */
    }
    expect(captured).toEqual({ type: 'below', age1: '25', age2: null });
  });

  it('uppercases gender and passes memberId as string', async () => {
    const captured: Record<string, string | null> = {};
    server.use(
      http.get(`${BASE_URL}/partner/search`, ({ request }) => {
        const url = new URL(request.url);
        captured.member = url.searchParams.get('member');
        captured.gender = url.searchParams.get('gender');
        return HttpResponse.json([]);
      }),
    );

    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    for await (const _ of client.members.search({ memberId: 12345, gender: 'female' })) {
      /* drain */
    }
    expect(captured.member).toBe('12345');
    expect(captured.gender).toBe('FEMALE');
  });
});

// ---------------------------------------------------------------------------
// Rating updates
// ---------------------------------------------------------------------------

describe('client.members.ratingUpdates', () => {
  it('wraps updates in RatingUpdate instances', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/rating-updates`, () =>
        HttpResponse.json({
          updates: [
            {
              memberId: 1,
              displayName: 'Mike B.',
              sport: 'pickleball',
              previousRating: 3.8,
              newRating: 3.915,
              changedAt: '2026-04-10T12:00:00Z',
            },
            {
              memberId: 2,
              previousRating: 4.2,
              newRating: 4.15,
              changedAt: '2026-04-10T12:30:00Z',
            },
          ],
        }),
      ),
    );

    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const updates = await client.members.ratingUpdates();
    expect(updates).toHaveLength(2);
    expect(updates[0]?.improved).toBe(true);
    expect(updates[0]?.delta).toBeCloseTo(0.115);
    expect(updates[1]?.improved).toBe(false);
    expect(updates[1]?.delta).toBeCloseTo(-0.05);
  });

  it('returns [] when the server returns something unexpected', async () => {
    server.use(http.get(`${BASE_URL}/partner/rating-updates`, () => HttpResponse.json([])));
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const updates = await client.members.ratingUpdates();
    expect(updates).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Match submission
// ---------------------------------------------------------------------------

describe('client.matches', () => {
  it('submit() wraps the wire response in a MatchBatchResult', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post(`${BASE_URL}/partner/matches`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          success: true,
          numMatches: 1,
          numGames: 2,
          message: 'Submitted',
        });
      }),
    );

    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const result = await client.matches.submit({
      sport: 'pickleball',
      winScore: 11,
      winBy: 2,
      bracket: '4.0 Doubles',
      event: 'Weekly League',
      matchDate: '2026-04-11T14:00:00Z',
      matches: [
        {
          identifier: 'm1',
          teams: [
            ['p1', 'p2'],
            ['p3', 'p4'],
          ],
          games: [{ scores: [11, 8] }, { scores: [11, 5] }],
        },
      ],
    });

    expect(result).toBeInstanceOf(MatchBatchResult);
    expect(result.ok).toBe(true);
    expect(result.numGames).toBe(2);
    expect(result.isDryRun).toBe(false);
    expect(capturedBody).toMatchObject({ sport: 'pickleball', winScore: 11, winBy: 2 });
  });

  it('handles n-team x n-game round-robin shapes', async () => {
    server.use(
      http.post(`${BASE_URL}/partner/matches`, () =>
        HttpResponse.json({ success: true, numMatches: 1, numGames: 5 }),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const result = await client.matches.submit({
      sport: 'pickleball',
      winScore: 15,
      winBy: 2,
      matches: [
        {
          identifier: 'rr-1',
          teams: [['a'], ['b'], ['c']],
          games: [
            { scores: [15, 10, 8] },
            { scores: [12, 15, 9] },
            { scores: [15, 11, 13] },
            { scores: [14, 15, 10] },
            { scores: [15, 12, 11] },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.numGames).toBe(5);
  });

  it('testWebhook() forwards the URL', async () => {
    let body: unknown = null;
    server.use(
      http.post(`${BASE_URL}/partner/webhook-test`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ delivered: true });
      }),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    const res = await client.matches.testWebhook('https://hook.example.com');
    expect(res).toEqual({ delivered: true });
    expect(body).toEqual({ webhookUrl: 'https://hook.example.com' });
  });
});

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

describe('error mapping', () => {
  it('maps 429 to RateLimitError with retryAfter', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/member`, () =>
        HttpResponse.json(
          { message: 'slow down' },
          { status: 429, headers: { 'Retry-After': '120' } },
        ),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    await expect(client.members.get('vair_mem_xxx')).rejects.toThrowError(RateLimitError);
    try {
      await client.members.get('vair_mem_xxx');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as RateLimitError).retryAfter).toBe(120);
    }
  });

  it('maps 401 to AuthenticationError', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/member`, () =>
        HttpResponse.json({ message: 'bad key' }, { status: 401 }),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    await expect(client.members.get('vair_mem_xxx')).rejects.toThrowError(AuthenticationError);
  });

  it('maps 404 to NotFoundError', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/member`, () =>
        HttpResponse.json({ message: 'nope' }, { status: 404 }),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    await expect(client.members.get('vair_mem_xxx')).rejects.toThrowError(NotFoundError);
  });

  it('maps 400 to ValidationError', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/member`, () =>
        HttpResponse.json({ message: 'bad input' }, { status: 400 }),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    await expect(client.members.get('vair_mem_xxx')).rejects.toThrowError(ValidationError);
  });

  it('maps 500 to VairifiedError with statusCode', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/member`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    try {
      await client.members.get('vair_mem_xxx');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(VairifiedError);
      expect((err as VairifiedError).statusCode).toBe(500);
    }
  });

  it('falls back to error field or text when message is missing', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/member`, () =>
        HttpResponse.json({ error: 'something broke' }, { status: 500 }),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    await expect(client.members.get('vair_mem_xxx')).rejects.toThrow('something broke');
  });

  it('handles non-JSON error bodies', async () => {
    server.use(
      http.get(
        `${BASE_URL}/partner/member`,
        () => new HttpResponse('not json here', { status: 500 }),
      ),
    );
    const client = new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
    await expect(client.members.get('vair_mem_xxx')).rejects.toThrow('not json here');
  });
});

// ---------------------------------------------------------------------------
// Model classes — Member, SportRating, RatingUpdate, MatchBatchResult
// ---------------------------------------------------------------------------

describe('Member model', () => {
  it('wraps the wire payload', () => {
    const member = new Member(memberPayload());
    expect(member.memberId).toBe(4873327);
    expect(member.name).toBe('Mike Barker');
    expect(member.gender).toBe('MALE');
    expect(member.status.isVairified).toBe(true);
  });

  it('exposes sport ratings through MemberSportMap', () => {
    const member = new Member(memberPayload());
    const pb = member.sport.get('pickleball');
    expect(pb).toBeInstanceOf(SportRating);
    expect(pb?.rating).toBeCloseTo(3.915);
    expect(pb?.abbr).toBe('VO');
    expect(member.sport.has('pickleball')).toBe(true);
    expect(member.sport.size).toBe(1);
  });

  it('iterates the sport map', () => {
    const member = new Member(memberPayload());
    const pairs = [...member.sport];
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.[0]).toBe('pickleball');
    expect(pairs[0]?.[1]).toBeInstanceOf(SportRating);
  });

  it('iterates SportRating splits', () => {
    const member = new Member(memberPayload());
    const pb = member.sport.get('pickleball');
    expect(pb).toBeDefined();
    if (!pb) return;
    expect(pb.size).toBe(3);
    expect(pb.has('overall-open')).toBe(true);
    expect(pb.get('overall-open')?.rating).toBeCloseTo(3.915);
    expect(pb.get('missing')).toBeUndefined();

    const keys = [...pb.keys()];
    expect(keys).toContain('overall-open');
    expect(keys).toContain('singles-open');

    const pairs = [...pb];
    expect(pairs).toHaveLength(3);
  });

  it('split() convenience method', () => {
    const member = new Member(memberPayload());
    expect(member.split('overall-open')?.rating).toBeCloseTo(3.915);
    expect(member.split('missing')).toBeNull();
    expect(member.split('overall-open', 'padel')).toBeNull();
  });

  it('handles missing sport data gracefully', () => {
    const member = new Member(memberPayload({ sport: undefined }));
    expect(member.sport.size).toBe(0);
    expect(member.sports).toEqual([]);
    expect(member.ratingFor('pickleball')).toBeNull();
    expect(String(member)).toContain('#4873327');
  });

  it('is frozen — attempts to mutate throw in strict mode', () => {
    const member = new Member(memberPayload());
    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: testing immutability
      (member as any).firstName = 'Other';
    }).toThrow();
  });

  it('has a compact toString', () => {
    const member = new Member(memberPayload());
    expect(String(member)).toContain('Mike B.');
    expect(String(member)).toContain('3.915');
  });
});

describe('MatchBatchResult model', () => {
  it('exposes ok and isDryRun getters', () => {
    const ok = new MatchBatchResult({
      success: true,
      numMatches: 1,
      numGames: 2,
    });
    expect(ok.ok).toBe(true);
    expect(ok.isDryRun).toBe(false);

    const dry = new MatchBatchResult({
      success: true,
      numMatches: 1,
      numGames: 2,
      dryRun: true,
    });
    expect(dry.isDryRun).toBe(true);

    const bad = new MatchBatchResult({
      success: false,
      numMatches: 0,
      numGames: 0,
      errors: ['missing field'],
    });
    expect(bad.ok).toBe(false);
    expect(String(bad)).toContain('FAILED');
    expect(String(bad)).toContain('errors=1');
  });
});
