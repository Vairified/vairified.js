/**
 * Shared test helpers — fixtures and the MSW server setup.
 */

import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

import type { PartnerMemberWire } from '../src/types.js';

export const API_KEY = 'vair_pk_test_123456789';
export const BASE_URL = 'https://api-next.vairified.com/api/v1';

/** Shared MSW server. Call `installServer()` inside a `describe`. */
export const server = setupServer();

/** Wire the MSW lifecycle hooks into the current test file. */
export function installServer(): void {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}

/** Build a realistic `PartnerMemberWire` payload for tests. */
export function memberPayload(overrides: Partial<PartnerMemberWire> = {}): PartnerMemberWire {
  return {
    memberId: 4873327,
    id: '0196a2e9-7b11-7f8c-bb3b-5f3d3e8fb4a2',
    firstName: 'Mike',
    lastName: 'Barker',
    fullName: 'Mike Barker',
    displayName: 'Mike B.',
    age: 42,
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    country: 'US',
    gender: 'MALE',
    status: {
      isVairified: true,
      isWheelchair: false,
      isAmbassador: false,
      isRater: false,
      isConnected: true,
    },
    sport: {
      pickleball: {
        rating: 3.915,
        abbr: 'VO',
        ratingSplits: {
          'overall-open': { rating: 3.915, abbr: 'VO' },
          'gender-open': { rating: 3.88, abbr: 'VG' },
          'singles-open': { rating: 3.71, abbr: 'S' },
        },
      },
    },
    activeLeagues: ['Austin Pickleball Club'],
    ...overrides,
  };
}
