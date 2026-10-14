/**
 * client.events.withdraw and the `mine` filter — the two halves of reconciling a
 * catalogue. Without `mine` a partner cannot discover what it has listed; without
 * withdraw it cannot take anything down. Either one missing leaves stale listings
 * pointing at dead pages.
 *
 * Mirrors tests/test_event_withdrawal.py in vairified.py case for case.
 */
import { HttpResponse, http } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Vairified } from '../src/index.js';
import { API_KEY, BASE_URL, server } from './helpers.js';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = () => new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });

describe('events.withdraw', () => {
  it('reports the listing it withdrew', async () => {
    server.use(
      http.delete(`${BASE_URL}/partner/events/autumn-doubles-avon`, () =>
        HttpResponse.json({
          partnerEventId: 'autumn-doubles-avon',
          eventId: 48213,
          withdrawn: true,
        }),
      ),
    );

    const result = await client().events.withdraw('autumn-doubles-avon');

    expect(result.partnerEventId).toBe('autumn-doubles-avon');
    expect(result.eventId).toBe(48213);
    expect(result.withdrawn).toBe(true);
  });

  it('treats an already-withdrawn listing as a success', async () => {
    // A reconciler retries whole batches; "already gone" is the expected state,
    // not a failure to handle.
    server.use(
      http.delete(`${BASE_URL}/partner/events/autumn-doubles-avon`, () =>
        HttpResponse.json({
          partnerEventId: 'autumn-doubles-avon',
          eventId: 48213,
          withdrawn: false,
        }),
      ),
    );

    const result = await client().events.withdraw('autumn-doubles-avon');

    expect(result.withdrawn).toBe(false);
  });

  it('URL-encodes the identifier', async () => {
    // A partner's own identifier is free text and may contain a slash or a
    // space; unencoded, it would change which path is requested.
    let path: string | undefined;

    server.use(
      http.delete(`${BASE_URL}/partner/events/:id`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ partnerEventId: 'a/b', eventId: 1, withdrawn: true });
      }),
    );

    await client().events.withdraw('a/b');

    // The base URL carries an /api/v1 prefix, so assert the ENCODING rather than
    // the whole path — the slash must not have become a path separator.
    expect(path).toMatch(/\/partner\/events\/a%2Fb$/);
  });
});

describe('events.list mine', () => {
  const page = { events: [], total: 0 };

  it('sends mine=true when asked', async () => {
    let query: string | null = null;

    server.use(
      http.get(`${BASE_URL}/partner/events`, ({ request }) => {
        query = new URL(request.url).searchParams.get('mine');
        return HttpResponse.json(page);
      }),
    );

    await client().events.list({ mine: true });

    expect(query).toBe('true');
  });

  it('does not send it otherwise', async () => {
    // A filter sent by accident would return an empty catalogue to a caller
    // browsing the public one, which looks exactly like "there are no events".
    let hasMine = true;

    server.use(
      http.get(`${BASE_URL}/partner/events`, ({ request }) => {
        hasMine = new URL(request.url).searchParams.has('mine');
        return HttpResponse.json(page);
      }),
    );

    await client().events.list({ type: 'TOURNAMENT' });

    expect(hasMine).toBe(false);
  });

  it('does not send it for mine: false', async () => {
    let hasMine = true;

    server.use(
      http.get(`${BASE_URL}/partner/events`, ({ request }) => {
        hasMine = new URL(request.url).searchParams.has('mine');
        return HttpResponse.json(page);
      }),
    );

    await client().events.list({ mine: false });

    expect(hasMine).toBe(false);
  });
});
