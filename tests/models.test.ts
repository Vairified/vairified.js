/**
 * Tests that exercise model internals not hit by the HTTP integration tests.
 */

import { describe, expect, it } from 'vitest';

import { MatchBatchResult, Member, RatingUpdate } from '../src/index.js';
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
        grantedScopes: ['profile:read', 'rating:read'],
      }),
    );
    expect(member.activeLeagues).toEqual(['a', 'b']);
    expect(member.grantedScopes).toEqual(['profile:read', 'rating:read']);
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
