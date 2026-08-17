/**
 * client.referrals — reading and recording ambassador credit
 * (Vairified#1130, #1131).
 *
 * The behaviour worth pinning is the part a caller acts on: telling
 * "already credited to my own host" from "credited to a stranger", and the four
 * distinct write outcomes. A boolean would leave them unable to decide anything.
 */

import { HttpResponse, http } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Vairified, ValidationError } from '../src/index.js';
import { API_KEY, BASE_URL, server } from './helpers.js';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = () => new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });

describe('client.referrals.get', () => {
  it('reports who holds credit, and who is still claimable', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/members/attribution`, () =>
        HttpResponse.json({
          attributions: [
            {
              memberId: 4873327,
              attributed: true,
              ambassadorMemberId: 4873001,
              attributedAt: '2026-08-14',
            },
            { memberId: 4873328, attributed: false },
          ],
          notFound: [999],
        }),
      ),
    );

    const result = await client().referrals.get([4873327, 4873328, 999]);

    expect(result.get(4873327)?.ambassadorMemberId).toBe(4873001);
    expect(result.get(4873327)?.attributedAt).toBe('2026-08-14');
    expect(result.claimable.map((a) => a.memberId)).toEqual([4873328]);
    expect(result.notFound).toEqual([999]);
  });

  it('distinguishes credit held by someone else from credit held by my host', async () => {
    // The distinction the whole endpoint exists for: one is "nothing to do",
    // the other is "a person must look before taking it".
    server.use(
      http.get(`${BASE_URL}/partner/members/attribution`, () =>
        HttpResponse.json({
          attributions: [
            { memberId: 1, attributed: true, ambassadorMemberId: 500 },
            { memberId: 2, attributed: true, ambassadorMemberId: 999 },
          ],
          notFound: [],
        }),
      ),
    );

    const result = await client().referrals.get([1, 2]);

    expect(result.get(1)?.heldBySomeoneOtherThan(500)).toBe(false);
    expect(result.get(2)?.heldBySomeoneOtherThan(500)).toBe(true);
  });

  it('still says credit is held when the holder has no member id', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/members/attribution`, () =>
        HttpResponse.json({
          attributions: [{ memberId: 1, attributed: true, ambassadorMemberId: null }],
          notFound: [],
        }),
      ),
    );

    const result = await client().referrals.get([1]);

    // "Held, but I cannot say by whom" must not read as claimable.
    expect(result.get(1)?.attributed).toBe(true);
    expect(result.get(1)?.isClaimable).toBe(false);
    expect(result.get(1)?.ambassadorMemberId).toBeNull();
  });

  it('rejects an empty or oversized list before the round trip', async () => {
    await expect(client().referrals.get([])).rejects.toThrow(ValidationError);
    await expect(
      client().referrals.get(Array.from({ length: 101 }, (_, i) => i + 1)),
    ).rejects.toThrow(ValidationError);
  });
});

describe('client.referrals.attribute', () => {
  it('sends the code, the publication date and the ids', async () => {
    let body: unknown = null;
    server.use(
      http.post(`${BASE_URL}/partner/ambassador/attribution`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          attributed: 1,
          results: [{ memberId: 4873327, outcome: 'attributed' }],
        });
      }),
    );

    const result = await client().referrals.attribute({
      referralCode: '  hillhurst-open  ',
      registrationPublishedAt: '2026-08-01',
      memberIds: [4873327],
    });

    expect(result.attributed).toBe(1);
    expect(body).toEqual({
      // Trimmed, so a copy-pasted code with padding still resolves.
      referralCode: 'hillhurst-open',
      registrationPublishedAt: '2026-08-01',
      memberIds: [4873327],
    });
  });

  it('separates the four outcomes, because each needs a different response', async () => {
    server.use(
      http.post(`${BASE_URL}/partner/ambassador/attribution`, () =>
        HttpResponse.json({
          attributed: 1,
          results: [
            { memberId: 1, outcome: 'attributed' },
            { memberId: 2, outcome: 'already_attributed' },
            { memberId: 3, outcome: 'account_predates_event' },
            { memberId: 4, outcome: 'not_found' },
          ],
        }),
      ),
    );

    const result = await client().referrals.attribute({
      referralCode: 'code',
      registrationPublishedAt: '2026-08-01',
      memberIds: [1, 2, 3, 4],
    });

    expect(result.alreadyAttributed).toEqual([2]);
    expect(result.predatedEvent).toEqual([3]);
    expect(result.withOutcome('not_found')).toEqual([4]);
    expect(result.withOutcome('attributed')).toEqual([1]);
  });

  it('rejects a date that is not YYYY-MM-DD rather than sending it', async () => {
    // A wrong date silently changes who is creditable, which is worse than an
    // outright rejection.
    await expect(
      client().referrals.attribute({
        referralCode: 'code',
        registrationPublishedAt: '01/08/2026',
        memberIds: [1],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects a blank code, an empty list, and more than 500 ids', async () => {
    const base = { registrationPublishedAt: '2026-08-01', memberIds: [1] };
    await expect(client().referrals.attribute({ ...base, referralCode: '   ' })).rejects.toThrow(
      ValidationError,
    );
    await expect(
      client().referrals.attribute({ ...base, referralCode: 'c', memberIds: [] }),
    ).rejects.toThrow(ValidationError);
    await expect(
      client().referrals.attribute({
        ...base,
        referralCode: 'c',
        memberIds: Array.from({ length: 501 }, (_, i) => i + 1),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('freezes the result and its entries', async () => {
    server.use(
      http.post(`${BASE_URL}/partner/ambassador/attribution`, () =>
        HttpResponse.json({
          attributed: 1,
          results: [{ memberId: 1, outcome: 'attributed' }],
        }),
      ),
    );

    const result = await client().referrals.attribute({
      referralCode: 'code',
      registrationPublishedAt: '2026-08-01',
      memberIds: [1],
    });

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.results[0])).toBe(true);
  });
});
