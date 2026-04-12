/**
 * Tests that exercise model internals not hit by the HTTP integration tests.
 */

import { describe, expect, it } from 'vitest';

import {
  MatchBatchResult,
  Member,
  RatingUpdate,
  TournamentImportResult,
  WebhookDeliveriesResult,
  WebhookDelivery,
} from '../src/index.js';
import { memberPayload } from './helpers.js';

describe('SportRating helpers', () => {
  it('values() and entries() expose the underlying splits', () => {
    const member = new Member(memberPayload());
    const pb = member.sport.get('pickleball');
    expect(pb).toBeDefined();
    if (!pb) return;

    const values = [...pb.values()];
    expect(values).toHaveLength(3);
    expect(values[0]?.rating).toBeCloseTo(3.915);

    const entries = [...pb.entries()];
    expect(entries).toHaveLength(3);
    expect(entries.find(([k]) => k === 'singles-open')?.[1].rating).toBeCloseTo(3.71);
  });
});

describe('MemberSportMap helpers', () => {
  it('values() and entries() expose every sport', () => {
    const member = new Member(
      memberPayload({
        sport: {
          pickleball: { rating: 4, abbr: 'VO', ratingSplits: {} },
          padel: { rating: 3.5, abbr: 'VO', ratingSplits: {} },
        },
      }),
    );
    expect([...member.sport.keys()]).toEqual(['pickleball', 'padel']);
    expect([...member.sport.values()].map((s) => s.rating)).toEqual([4, 3.5]);
    expect([...member.sport.entries()].map(([k]) => k)).toEqual(['pickleball', 'padel']);
    expect(member.sport.has('padel')).toBe(true);
    expect(member.sport.has('tennis')).toBe(false);
  });

  it('member with no active leagues or grantedScopes', () => {
    const member = new Member(
      memberPayload({ activeLeagues: undefined, grantedScopes: undefined }),
    );
    expect(member.activeLeagues).toBeNull();
    expect(member.grantedScopes).toBeNull();
  });

  it('member with activeLeagues and grantedScopes', () => {
    const member = new Member(
      memberPayload({
        activeLeagues: ['a', 'b'],
        grantedScopes: ['user:profile:read', 'user:rating:read'],
      }),
    );
    expect(member.activeLeagues).toEqual(['a', 'b']);
    expect(member.grantedScopes).toEqual(['user:profile:read', 'user:rating:read']);
  });
});

describe('RatingUpdate edge cases', () => {
  it('delta/improved return null/false when ratings are missing', () => {
    const update = new RatingUpdate({ memberId: 1 });
    expect(update.delta).toBeNull();
    expect(update.improved).toBe(false);
  });

  it('delta when only previous is set', () => {
    const update = new RatingUpdate({ memberId: 1, previousRating: 4 });
    expect(update.delta).toBeNull();
  });

  it('toString with all fields', () => {
    const update = new RatingUpdate({
      memberId: 42,
      displayName: 'Jane D.',
      previousRating: 4.0,
      newRating: 4.15,
    });
    const str = String(update);
    expect(str).toContain('#42');
    expect(str).toContain('Jane D.');
    expect(str).toContain('4.000');
    expect(str).toContain('4.150');
    expect(str).toContain('↑');
  });

  it('toString with missing ratings shows ?', () => {
    const update = new RatingUpdate({ memberId: 7 });
    const str = String(update);
    expect(str).toContain('?');
    expect(str).toContain('↓'); // not improved
  });

  it('preserves ratingSplits when provided', () => {
    const update = new RatingUpdate({
      memberId: 1,
      ratingSplits: { 'overall-open': { rating: 4, abbr: 'VO' } },
    });
    expect(update.ratingSplits).not.toBeNull();
    expect(update.ratingSplits?.['overall-open']?.rating).toBe(4);
  });
});

describe('MatchBatchResult toString branches', () => {
  it('plain ok', () => {
    const r = new MatchBatchResult({
      success: true,
      numMatches: 3,
      numGames: 7,
    });
    const str = String(r);
    expect(str).toContain('ok');
    expect(str).toContain('matches=3');
    expect(str).toContain('games=7');
    expect(str).not.toContain('dry-run');
  });

  it('dry-run ok', () => {
    const r = new MatchBatchResult({
      success: true,
      numMatches: 1,
      numGames: 2,
      dryRun: true,
    });
    expect(String(r)).toContain('[dry-run]');
  });

  it('success with empty errors array is still ok', () => {
    const r = new MatchBatchResult({
      success: true,
      numMatches: 1,
      numGames: 2,
      errors: [],
    });
    expect(r.ok).toBe(true);
  });

  it('success with non-empty errors is not ok', () => {
    const r = new MatchBatchResult({
      success: true,
      numMatches: 1,
      numGames: 2,
      errors: ['something went wrong'],
    });
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TournamentImportResult
// ---------------------------------------------------------------------------

describe('TournamentImportResult', () => {
  it('ok is true when success=true and no errors', () => {
    const r = new TournamentImportResult({
      success: true,
      matchesImported: 5,
      gamesRecorded: 15,
      ghostPlayersCreated: 1,
      existingPlayersMatched: 9,
    });
    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(false);
    expect(r.message).toBeUndefined();
    expect(r.errors).toEqual([]);
  });

  it('ok is false when errors are present', () => {
    const r = new TournamentImportResult({
      success: true,
      matchesImported: 5,
      gamesRecorded: 15,
      ghostPlayersCreated: 0,
      existingPlayersMatched: 0,
      errors: ['invalid player ID'],
    });
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(['invalid player ID']);
  });

  it('ok is false when success=false even without errors', () => {
    const r = new TournamentImportResult({
      success: false,
      matchesImported: 0,
      gamesRecorded: 0,
      ghostPlayersCreated: 0,
      existingPlayersMatched: 0,
    });
    expect(r.ok).toBe(false);
  });

  it('respects dryRun and message fields', () => {
    const r = new TournamentImportResult({
      success: true,
      matchesImported: 3,
      gamesRecorded: 9,
      ghostPlayersCreated: 0,
      existingPlayersMatched: 6,
      dryRun: true,
      message: 'Dry run completed',
    });
    expect(r.dryRun).toBe(true);
    expect(r.message).toBe('Dry run completed');
  });

  it('is frozen', () => {
    const r = new TournamentImportResult({
      success: true,
      matchesImported: 1,
      gamesRecorded: 2,
      ghostPlayersCreated: 0,
      existingPlayersMatched: 2,
    });
    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: testing immutability
      (r as any).success = false;
    }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// WebhookDelivery
// ---------------------------------------------------------------------------

describe('WebhookDelivery', () => {
  const baseWire = {
    id: 'del_001',
    event: 'rating.updated',
    url: 'https://hook.example.com/v1',
    statusCode: 200 as number | null,
    responseBody: '{"ok":true}' as string | null,
    errorMessage: null as string | null,
    attempts: 1,
    maxAttempts: 3,
    lastAttemptAt: '2026-04-11T10:00:00Z',
    nextRetryAt: null as string | null,
    completedAt: '2026-04-11T10:00:01Z' as string | null,
    createdAt: '2026-04-11T09:59:59Z',
    payload: { memberId: 42 },
  };

  it('succeeded is true for completed 2xx delivery', () => {
    const d = new WebhookDelivery(baseWire);
    expect(d.succeeded).toBe(true);
    expect(d.failed).toBe(false);
  });

  it('failed is true for completed non-2xx delivery', () => {
    const d = new WebhookDelivery({ ...baseWire, statusCode: 500 });
    expect(d.succeeded).toBe(false);
    expect(d.failed).toBe(true);
  });

  it('neither succeeded nor failed when not completed', () => {
    const d = new WebhookDelivery({ ...baseWire, completedAt: null });
    expect(d.succeeded).toBe(false);
    expect(d.failed).toBe(false);
  });

  it('neither succeeded nor failed when completed with null status', () => {
    const d = new WebhookDelivery({ ...baseWire, statusCode: null });
    expect(d.succeeded).toBe(false);
    expect(d.failed).toBe(true);
  });

  it('is frozen', () => {
    const d = new WebhookDelivery(baseWire);
    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: testing immutability
      (d as any).event = 'nope';
    }).toThrow();
  });

  it('payload is frozen', () => {
    const d = new WebhookDelivery(baseWire);
    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: testing immutability
      (d.payload as any).injected = true;
    }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// WebhookDeliveriesResult
// ---------------------------------------------------------------------------

describe('WebhookDeliveriesResult', () => {
  it('wraps an array of deliveries correctly', () => {
    const wire = {
      deliveries: [
        {
          id: 'del_001',
          event: 'rating.updated',
          url: 'https://hook.example.com/v1',
          statusCode: 200 as number | null,
          responseBody: null as string | null,
          errorMessage: null as string | null,
          attempts: 1,
          maxAttempts: 3,
          lastAttemptAt: '2026-04-11T10:00:00Z',
          nextRetryAt: null as string | null,
          completedAt: '2026-04-11T10:00:01Z' as string | null,
          createdAt: '2026-04-11T09:59:59Z',
          payload: {},
        },
        {
          id: 'del_002',
          event: 'match.submitted',
          url: 'https://hook.example.com/v1',
          statusCode: 500 as number | null,
          responseBody: 'error' as string | null,
          errorMessage: 'Server Error' as string | null,
          attempts: 3,
          maxAttempts: 3,
          lastAttemptAt: '2026-04-11T11:00:00Z',
          nextRetryAt: null as string | null,
          completedAt: '2026-04-11T11:00:01Z' as string | null,
          createdAt: '2026-04-11T10:59:59Z',
          payload: {},
        },
      ],
      total: 2,
    };

    const result = new WebhookDeliveriesResult(wire);
    expect(result.total).toBe(2);
    expect(result.deliveries).toHaveLength(2);
    expect(result.deliveries[0]).toBeInstanceOf(WebhookDelivery);
    expect(result.deliveries[0]?.succeeded).toBe(true);
    expect(result.deliveries[1]?.failed).toBe(true);
  });

  it('is frozen', () => {
    const result = new WebhookDeliveriesResult({ deliveries: [], total: 0 });
    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: testing immutability
      (result as any).total = 99;
    }).toThrow();
  });
});
