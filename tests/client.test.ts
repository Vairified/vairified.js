import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Match, Player, RateLimitError, Vairified, VairifiedError } from '../src/index.js';

const BASE_URL = 'https://api-next.vairified.com/api/v1';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Vairified', () => {
  const apiKey = 'vair_pk_test123456789';

  describe('getMember', () => {
    it('should return a Member object', async () => {
      server.use(
        http.get(`${BASE_URL}/partner/member`, () => {
          return HttpResponse.json({
            id: 'uuid-123',
            firstName: 'John',
            lastName: 'Doe',
            rating: 4.25,
            isVairified: true,
            ratingSplits: { VG: 4.25, VO: 4.1 },
          });
        }),
      );

      const client = new Vairified({ apiKey, baseUrl: BASE_URL });
      const member = await client.getMember('clerk_user_123');

      expect(member.id).toBe('uuid-123');
      expect(member.name).toBe('John Doe');
      expect(member.rating).toBe(4.25);
      expect(member.isVairified).toBe(true);
      expect(member.ratingSplits.gender).toBe(4.25); // VG maps to gender
    });
  });

  describe('search', () => {
    it('should return SearchResults with Player objects', async () => {
      server.use(
        http.get(`${BASE_URL}/partner/search`, () => {
          return HttpResponse.json({
            players: [
              {
                id: 'uuid-1',
                firstName: 'Jane',
                lastName: 'Smith',
                city: 'Austin',
                state: 'TX',
                rating: 4.0,
                isVairified: true,
                ratingSplits: {},
              },
            ],
            total: 1,
            page: 1,
            limit: 20,
          });
        }),
      );

      const client = new Vairified({ apiKey, baseUrl: BASE_URL });
      const results = await client.search({ city: 'Austin', state: 'TX' });

      expect(results.length).toBe(1);
      expect(results.at(0)?.name).toBe('Jane Smith');
      expect(results.at(0)?.city).toBe('Austin');
      expect(results.total).toBe(1);

      // Test iteration
      for (const player of results) {
        expect(player).toBeInstanceOf(Player);
      }
    });
  });

  describe('submitMatch', () => {
    it('should submit a match and return result', async () => {
      server.use(
        http.post(`${BASE_URL}/partner/matches`, () => {
          return HttpResponse.json({
            success: true,
            message: '1 match submitted, 2 games recorded',
            numMatches: 1,
            numGames: 2,
          });
        }),
      );

      const client = new Vairified({ apiKey, baseUrl: BASE_URL });
      const match = new Match({
        event: 'Test League',
        bracket: '4.0 Doubles',
        date: new Date(),
        team1: ['p1', 'p2'],
        team2: ['p3', 'p4'],
        scores: [
          [11, 9],
          [11, 7],
        ],
      });

      const result = await client.submitMatch(match);

      expect(result.success).toBe(true);
      expect(result.numMatches).toBe(1);
      expect(result.numGames).toBe(2);
    });
  });

  describe('getRatingUpdates', () => {
    it('should return RatingUpdate objects', async () => {
      server.use(
        http.get(`${BASE_URL}/partner/rating-updates`, () => {
          return HttpResponse.json({
            updates: [
              {
                id: 'uuid-1',
                previousRating: 4.0,
                newRating: 4.1,
                changedAt: '2026-01-21T12:00:00Z',
              },
            ],
          });
        }),
      );

      const client = new Vairified({ apiKey, baseUrl: BASE_URL });
      const updates = await client.getRatingUpdates();

      expect(updates).toHaveLength(1);
      expect(updates[0]?.id).toBe('uuid-1');
      expect(updates[0]?.improved).toBe(true);
      expect(updates[0]?.change).toBeCloseTo(0.1);
    });
  });

  describe('error handling', () => {
    it('should throw RateLimitError on 429', async () => {
      server.use(
        http.get(`${BASE_URL}/partner/member`, () => {
          return new HttpResponse(JSON.stringify({ message: 'Rate limit exceeded' }), {
            status: 429,
            headers: { 'Retry-After': '60' },
          });
        }),
      );

      const client = new Vairified({ apiKey, baseUrl: BASE_URL });

      await expect(client.getMember('user_123')).rejects.toThrow(RateLimitError);
    });

    it('should throw VairifiedError on 500', async () => {
      server.use(
        http.get(`${BASE_URL}/partner/member`, () => {
          return HttpResponse.json({ message: 'Internal server error' }, { status: 500 });
        }),
      );

      const client = new Vairified({ apiKey, baseUrl: BASE_URL });

      await expect(client.getMember('user_123')).rejects.toThrow(VairifiedError);
    });
  });
});

describe('Models', () => {
  describe('Player', () => {
    it('should compute name and verifiedRating', () => {
      const player = new Player({
        id: 'uuid-1',
        firstName: 'John',
        lastName: 'Doe',
        rating: 4.25,
        isVairified: true,
        ratingSplits: { VG: 4.25, VM: 4.1 },
      });

      expect(player.name).toBe('John Doe');
      expect(player.verifiedRating).toBe(4.25);
      expect(player.ratingSplits.gender).toBe(4.25); // VG maps to gender
      expect(player.ratingSplits.mixed).toBe(4.1); // VM maps to mixed
      expect(player.toString()).toContain('John Doe');
      expect(player.toString()).toContain('4.25');
    });
  });

  describe('Match', () => {
    it('should compute winner and scoreSummary', () => {
      const match = new Match({
        event: 'Test',
        bracket: '4.0 Doubles',
        date: new Date(),
        team1: ['p1', 'p2'],
        team2: ['p3', 'p4'],
        scores: [
          [11, 9],
          [9, 11],
          [11, 7],
        ],
      });

      expect(match.format).toBe('DOUBLES');
      expect(match.winner).toBe(1);
      expect(match.scoreSummary).toBe('11-9, 9-11, 11-7');
    });

    it('should handle singles format', () => {
      const match = new Match({
        event: 'Singles Tourney',
        bracket: 'Open Singles',
        date: new Date(),
        team1: ['p1'],
        team2: ['p2'],
        scores: [
          [11, 8],
          [11, 6],
        ],
      });

      expect(match.format).toBe('SINGLES');
      expect(match.winner).toBe(1);
    });

    it('should serialize to JSON correctly', () => {
      const match = new Match({
        event: 'Test League',
        bracket: '4.0 Doubles',
        date: new Date('2026-01-21T12:00:00Z'),
        team1: ['p1', 'p2'],
        team2: ['p3', 'p4'],
        scores: [[11, 9]],
      });

      const json = match.toJSON();

      expect(json.event).toBe('Test League');
      expect(json.bracket).toBe('4.0 Doubles');
      expect(json.format).toBe('DOUBLES');
      expect(json.teamA.player1).toBe('p1');
      expect(json.teamA.player2).toBe('p2');
      expect(json.teamA.game1).toBe(11);
      expect(json.teamB.game1).toBe(9);
    });
  });
});

describe('initialization', () => {
  it('should throw error when API key is missing', () => {
    const originalEnv = process.env.VAIRIFIED_API_KEY;
    // biome-ignore lint/performance/noDelete: need to fully remove env var for this test
    delete process.env.VAIRIFIED_API_KEY;

    expect(() => new Vairified({})).toThrow('API key required');

    if (originalEnv) {
      process.env.VAIRIFIED_API_KEY = originalEnv;
    }
  });
});
