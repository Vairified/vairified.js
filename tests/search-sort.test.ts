/**
 * members.search() sorting: the API sorts only by the PARTNER_SEARCH_SORT_FIELDS
 * whitelist and answers anything else with a 400.
 */

import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import {
  PARTNER_SEARCH_SORT_FIELDS,
  type PartnerSearchSortField,
  Vairified,
  ValidationError,
} from '../src/index.js';
import { API_KEY, BASE_URL, installServer, server } from './helpers.js';

installServer();

const client = () => new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });

async function drain(sortBy: PartnerSearchSortField): Promise<void> {
  for await (const _ of client().members.search({ sortBy, sortOrder: 'asc' })) {
    /* drain */
  }
}

describe('members.search — sortField whitelist', () => {
  it('exposes the six sortable fields', () => {
    expect(PARTNER_SEARCH_SORT_FIELDS).toEqual([
      'lastName',
      'firstName',
      'memberId',
      'city',
      'state',
      'country',
    ]);
    expect(Object.isFrozen(PARTNER_SEARCH_SORT_FIELDS)).toBe(true);
  });

  it.each([...PARTNER_SEARCH_SORT_FIELDS])('sends sortField=%s unchanged', async (field) => {
    let params: URLSearchParams | null = null;
    server.use(
      http.get(`${BASE_URL}/partner/search`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json([]);
      }),
    );
    await drain(field);
    expect((params as URLSearchParams | null)?.get('sortField')).toBe(field);
    expect((params as URLSearchParams | null)?.get('sortDirection')).toBe('asc');
  });

  it('surfaces the API refusing a sort field as a ValidationError', async () => {
    const message = 'sortField must be one of: lastName, firstName, memberId, city, state, country';
    server.use(
      http.get(`${BASE_URL}/partner/search`, () =>
        HttpResponse.json({ statusCode: 400, message, error: 'Bad Request' }, { status: 400 }),
      ),
    );
    // A caller outside TypeScript (or casting) can still send a retired value;
    // the API's 400 must come back typed.
    const err = await drain('rating' as PartnerSearchSortField).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).statusCode).toBe(400);
    expect((err as ValidationError).message).toBe(message);
  });
});
