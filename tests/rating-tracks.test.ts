/**
 * The rating-tracks release of Partner API v1: web labels on every split and
 * sport, `R` for the recreational chain whoever the player is, the
 * recreational_singles split, withheld verified-track splits, the six
 * leaderboard tracks, the optional verifiedOnly filter, and the leaderboard's
 * 401 / 403 on a bad key.
 */

import { createHmac } from 'node:crypto';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import {
  AuthenticationError,
  isRatingUpdatedEvent,
  LEADERBOARD_CATEGORIES,
  LEADERBOARD_CATEGORY_LABELS,
  LeaderboardCategoryInfo,
  Member,
  PermissionDeniedError,
  type RatingUpdatedSportWire,
  Vairified,
  VairifiedError,
  ValidationError,
  verifyWebhook,
} from '../src/index.js';
import type { PartnerMemberWire } from '../src/types.js';
import { API_KEY, BASE_URL, installServer, memberPayload, server } from './helpers.js';

installServer();

const client = () => new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });

/** A player verified in pickleball: verified tracks plus the recreational ones (R, RS). */
function verifiedPlayer(): PartnerMemberWire {
  return memberPayload({
    sport: {
      pickleball: {
        rating: 3.915,
        abbr: 'VO',
        label: 'VO',
        ratingSplits: {
          'overall-open': { rating: 3.915, abbr: 'VO', label: 'VO' },
          'singles-12-13': { rating: 4.03, abbr: 'S12-13', label: 'VS12-13' },
          'recreational-open': { rating: 3.8, abbr: 'R', label: 'R' },
          'recreational_singles-open': { rating: 3.6, abbr: 'RS', label: 'RS' },
          'recreational_singles-40+': { rating: 3.71, abbr: 'RS40+', label: 'RS40+' },
          'asymmetric-open': { rating: 3.9, abbr: 'VA', label: null },
        },
        isVairified: true,
        isRater: false,
        isVairPro: false,
        isVairProStatus: null,
      },
    },
  });
}

/**
 * A player NOT verified in pickleball, as the API now sends them: no
 * verified-track splits at all, the primary falls back to recreational-open.
 */
function unverifiedPlayer(): PartnerMemberWire {
  return memberPayload({
    sport: {
      pickleball: {
        rating: 3.42,
        abbr: 'R',
        label: 'R',
        ratingSplits: {
          'recreational-open': { rating: 3.42, abbr: 'R', label: 'R' },
          'recreational_singles-open': { rating: 3.3, abbr: 'RS', label: 'RS' },
        },
        isVairified: false,
        isRater: false,
        isVairPro: false,
        isVairProStatus: null,
      },
    },
  });
}

describe('member splits — labels and the recreational tracks', () => {
  it('exposes label on the sport and on every split', () => {
    const pb = new Member(verifiedPlayer()).sport.get('pickleball');
    expect(pb?.label).toBe('VO');
    expect(pb?.get('singles-12-13')).toEqual({ rating: 4.03, abbr: 'S12-13', label: 'VS12-13' });
    expect(pb?.get('asymmetric-open')?.label).toBeNull();
  });

  it('carries the recreational_singles split keys', () => {
    const pb = new Member(verifiedPlayer()).sport.get('pickleball');
    expect(pb?.get('recreational_singles-open')).toMatchObject({ abbr: 'RS', label: 'RS' });
    expect(pb?.get('recreational_singles-40+')).toMatchObject({ abbr: 'RS40+', label: 'RS40+' });
    expect(pb?.has('recreational_gender-open')).toBe(false);
    expect(pb?.has('recreational_mixed-open')).toBe(false);
    expect(pb?.size).toBe(6);
  });

  it('labels the recreational chain R for a player verified in the sport (no Rv)', () => {
    const pb = new Member(verifiedPlayer()).sport.get('pickleball');
    expect(pb?.isVairified).toBe(true);
    expect(pb?.get('recreational-open')).toEqual({ rating: 3.8, abbr: 'R', label: 'R' });
    expect(pb?.byLabel('R')?.rating).toBe(3.8);
    expect(pb?.byLabel('Rv')).toBeUndefined();
  });

  it('looks a split up by its web label', () => {
    const member = new Member(verifiedPlayer());
    const pb = member.sport.get('pickleball');
    // `abbr` keeps the legacy `S`; the label is what the web app shows.
    expect(pb?.byLabel('VS12-13')?.abbr).toBe('S12-13');
    expect(pb?.byLabel('RS40+')?.rating).toBe(3.71);
    expect(pb?.byLabel('XX')).toBeUndefined();
    // Exact match, as the API sends it.
    expect(pb?.byLabel('rs')).toBeUndefined();
    expect(member.splitByLabel('RS')?.rating).toBe(3.6);
    expect(member.splitByLabel('RS', 'padel')).toBeNull();
  });

  it('defaults label to null when an older API omits it', () => {
    const pb = new Member(memberPayload()).sport.get('pickleball');
    expect(pb?.label).toBeNull();
    expect(pb?.get('overall-open')).toEqual({ rating: 3.915, abbr: 'VO', label: null });
    expect(pb?.byLabel('VO')).toBeUndefined();
  });

  it('keeps splits immutable', () => {
    const split = new Member(verifiedPlayer()).split('overall-open');
    expect(Object.isFrozen(split)).toBe(true);
  });

  it('passes through a player whose verified-track splits are withheld', async () => {
    server.use(http.get(`${BASE_URL}/partner/member`, () => HttpResponse.json(unverifiedPlayer())));
    const member = await client().members.get('vair_mem_xxx');
    const pb = member.sport.get('pickleball');

    expect(pb?.has('overall-open')).toBe(false);
    expect(member.split('overall-open')).toBeNull();
    // The primary is the recreational chain now, and ratingFor() follows it.
    expect(member.ratingFor('pickleball')).toBe(3.42);
    expect(pb?.abbr).toBe('R');
    expect(pb?.label).toBe('R');
    expect(pb?.isVairified).toBe(false);
  });

  it('treats a sport with nothing visible as absent', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/member`, () => HttpResponse.json(memberPayload({ sport: {} }))),
    );
    const member = await client().members.get('vair_mem_xxx');
    expect(member.sport.has('pickleball')).toBe(false);
    expect(member.ratingFor('pickleball')).toBeNull();
    expect(member.sports).toEqual([]);
  });
});

describe('members.ratingUpdates — labels', () => {
  it('normalizes split labels on a polled update', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/rating-updates`, () =>
        HttpResponse.json({
          updates: [
            {
              memberId: 4873327,
              sport: 'pickleball',
              previousRating: 3.5,
              newRating: 3.52,
              changedAt: '2026-10-13T10:00:00.000Z',
              ratingSplits: {
                'recreational_singles-open': { rating: 3.52, abbr: 'RS', label: 'RS' },
                'recreational-open': { rating: 3.4, abbr: 'R' },
              },
            },
          ],
        }),
      ),
    );
    const [update] = await client().members.ratingUpdates();
    expect(update?.ratingSplits?.['recreational_singles-open']?.label).toBe('RS');
    expect(update?.ratingSplits?.['recreational-open']?.label).toBeNull();
    expect(Object.isFrozen(update?.ratingSplits?.['recreational-open'])).toBe(true);
  });
});

describe('leaderboard — the six tracks', () => {
  it('exposes the 6 category codes and their labels', () => {
    expect(LEADERBOARD_CATEGORIES).toEqual([
      'overall',
      'gender',
      'singles',
      'mixed',
      'recreational',
      'recreational_singles',
    ]);
    expect(LEADERBOARD_CATEGORY_LABELS).toEqual(['VO', 'VG', 'VM', 'VS', 'R', 'RS']);
    expect(Object.isFrozen(LEADERBOARD_CATEGORIES)).toBe(true);
    expect(Object.isFrozen(LEADERBOARD_CATEGORY_LABELS)).toBe(true);
  });

  // `Rv` is a legacy label the API still resolves; the SDK forwards it untouched.
  it.each([
    'recreational',
    'recreational_singles',
    'R',
    'RS',
    'Rv',
    'vs',
  ])('forwards category %s as given', async (category) => {
    let sent: string | null = null;
    server.use(
      http.get(`${BASE_URL}/leaderboard`, ({ request }) => {
        sent = new URL(request.url).searchParams.get('category');
        return HttpResponse.json({ players: [] });
      }),
    );
    await client().leaderboard.list({ category });
    expect(sent).toBe(category);
  });

  it('rank() defaults to the overall track', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE_URL}/leaderboard/rank`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ qualified: true, rank: 3 });
      }),
    );
    await client().leaderboard.rank('vair_mem_42');
    expect(body).toMatchObject({ category: 'overall' });
  });

  it('surfaces an unknown category as a ValidationError', async () => {
    server.use(
      http.get(`${BASE_URL}/leaderboard`, () =>
        HttpResponse.json(
          { message: ['category must be one of the following values: overall, gender'] },
          { status: 400 },
        ),
      ),
    );
    await expect(client().leaderboard.list({ category: 'doubles' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('categoryList() returns the tracks as frozen models', async () => {
    server.use(
      http.get(`${BASE_URL}/leaderboard/categories`, () =>
        HttpResponse.json({
          categories: [
            { code: 'overall', name: 'Doubles', label: 'VO', verifiedOnly: true },
            { code: 'gender', name: 'Same-Gender Doubles', label: 'VG', verifiedOnly: true },
            { code: 'singles', name: 'Singles', label: 'VS', verifiedOnly: true },
            { code: 'mixed', name: 'Mixed Doubles', label: 'VM', verifiedOnly: true },
            { code: 'recreational', name: 'Recreational', label: 'R', verifiedOnly: false },
            {
              code: 'recreational_singles',
              name: 'Recreational Singles',
              label: 'RS',
              verifiedOnly: false,
            },
          ],
          ageBrackets: [{ code: 'open', name: 'Open', displayOrder: 0 }],
          scopes: [],
          ratingTiers: [],
        }),
      ),
    );

    const tracks = await client().leaderboard.categoryList();
    expect(tracks).toHaveLength(6);
    expect(tracks.map((t) => t.code)).toEqual([...LEADERBOARD_CATEGORIES]);
    expect(tracks.map((t) => t.label)).toEqual(['VO', 'VG', 'VS', 'VM', 'R', 'RS']);
    expect(tracks[0]).toBeInstanceOf(LeaderboardCategoryInfo);
    expect(tracks[2]).toMatchObject({ code: 'singles', label: 'VS', verifiedOnly: true });
    expect(tracks[4]).toEqual(
      new LeaderboardCategoryInfo({
        code: 'recreational',
        name: 'Recreational',
        label: 'R',
        verifiedOnly: false,
      }),
    );
    expect(Object.keys(tracks[4] ?? {})).toEqual(['code', 'name', 'label', 'verifiedOnly']);
    expect(Object.isFrozen(tracks)).toBe(true);
    expect(Object.isFrozen(tracks[0])).toBe(true);
  });

  describe('verifiedOnly — an optional filter, sent only when set', () => {
    const capture = () => {
      const seen: (string | null)[] = [];
      server.use(
        http.get(`${BASE_URL}/leaderboard`, ({ request }) => {
          const params = new URL(request.url).searchParams;
          seen.push(params.has('verifiedOnly') ? params.get('verifiedOnly') : null);
          return HttpResponse.json({ players: [] });
        }),
      );
      return seen;
    };

    it('is not sent when unset, so R / RS boards rank everyone', async () => {
      const seen = capture();
      await client().leaderboard.list({ category: 'R' });
      await client().leaderboard.list({ category: 'recreational_singles' });
      expect(seen).toEqual([null, null]);
    });

    it('is sent as true when the caller narrows to VAIRified players', async () => {
      const seen = capture();
      await client().leaderboard.list({ category: 'R', verifiedOnly: true });
      expect(seen).toEqual(['true']);
    });

    it('is sent as false when the caller sets it (no filter, as the API reads it)', async () => {
      const seen = capture();
      await client().leaderboard.list({ category: 'VO', verifiedOnly: false });
      expect(seen).toEqual(['false']);
    });
  });

  it('categoryList() is empty when the body has no categories array', async () => {
    server.use(http.get(`${BASE_URL}/leaderboard/categories`, () => HttpResponse.json({})));
    expect(await client().leaderboard.categoryList()).toEqual([]);
  });
});

describe('leaderboard — a sent key is checked on the public routes', () => {
  const routes = [
    ['list()', 'get', '/leaderboard', () => client().leaderboard.list()],
    ['categories()', 'get', '/leaderboard/categories', () => client().leaderboard.categories()],
    ['categoryList()', 'get', '/leaderboard/categories', () => client().leaderboard.categoryList()],
    ['rank()', 'post', '/leaderboard/rank', () => client().leaderboard.rank('vair_mem_42')],
  ] as const;

  it.each(
    routes,
  )('%s: an invalid or revoked key is an AuthenticationError', async (_, method, path, call) => {
    server.use(
      http[method](`${BASE_URL}${path}`, () =>
        HttpResponse.json(
          { statusCode: 401, message: 'Invalid or expired API key' },
          { status: 401 },
        ),
      ),
    );
    const err = await call().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect((err as AuthenticationError).statusCode).toBe(401);
    expect((err as AuthenticationError).message).toBe('Invalid or expired API key');
  });

  it.each(
    routes,
  )('%s: a key without leaderboard:read is a PermissionDeniedError', async (_, method, path, call) => {
    server.use(
      http[method](`${BASE_URL}${path}`, () =>
        HttpResponse.json(
          {
            statusCode: 403,
            message: 'Insufficient scope. Required: leaderboard:read. Your key has: none',
          },
          { status: 403 },
        ),
      ),
    );
    const err = await call().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PermissionDeniedError);
    // Still a VairifiedError, so existing `catch` blocks keep working.
    expect(err).toBeInstanceOf(VairifiedError);
    expect((err as PermissionDeniedError).statusCode).toBe(403);
    expect((err as PermissionDeniedError).name).toBe('PermissionDeniedError');
  });
});

describe('rating.updated webhook — the new keys parse', () => {
  const secret = 'whsec_rating_tracks_test';
  const now = 1760350000;
  const sign = (body: string) =>
    `t=${now},v1=${createHmac('sha256', secret).update(`${now}.${body}`).digest('hex')}`;

  it('verifies and types a snapshot carrying labels and R/RS splits', async () => {
    const body = JSON.stringify({
      event: 'rating.updated',
      eventId: 'evt_tracks',
      timestamp: '2026-10-13T10:00:00.000Z',
      data: {
        memberId: 7204743,
        sports: {
          pickleball: {
            rating: 3.42,
            abbr: 'R',
            label: 'R',
            ratingSplits: {
              'recreational-open': { rating: 3.42, abbr: 'R', label: 'R' },
              'recreational_singles-open': { rating: 3.52, abbr: 'RS', label: 'RS' },
              'recreational_singles-40+': {
                rating: 3.3,
                abbr: 'RS40+',
                label: 'RS40+',
                someFutureKey: 1,
              },
            },
            isVairified: false,
            isRater: false,
            isVairPro: false,
            isVairProStatus: null,
            someFutureSportKey: 'kept',
          },
        },
        changedAt: '2026-10-13T10:00:00.000Z',
        sequence: '40300',
      },
    });

    const event = await verifyWebhook(body, sign(body), secret, { nowSeconds: now });
    if (!isRatingUpdatedEvent(event)) throw new Error('narrowing failed');
    const pb: RatingUpdatedSportWire | undefined = event.data.sports?.pickleball;
    expect(pb?.label).toBe('R');
    expect(pb?.ratingSplits?.['recreational_singles-open']?.label).toBe('RS');
    expect(pb?.ratingSplits?.['recreational_singles-40+']?.abbr).toBe('RS40+');
    expect(pb?.ratingSplits?.['overall-open']).toBeUndefined();
    expect((pb as Record<string, unknown> | undefined)?.someFutureSportKey).toBe('kept');
  });
});
