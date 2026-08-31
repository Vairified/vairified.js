/**
 * client.events.submit — putting one of your own events into the directory.
 *
 * The property worth pinning hardest is that the SDK sends `partnerEventId`
 * through unchanged. It is the key the server upserts on, so an SDK that dropped
 * or renamed it would turn every republish into a NEW listing — and that failure
 * is invisible from the caller's side: each call returns 200 with a plausible
 * listing, and the directory quietly fills with duplicates.
 */
import { HttpResponse, http } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Vairified } from '../src/index.js';
import { API_KEY, BASE_URL, server } from './helpers.js';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = () => new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });

const SUBMISSION = {
  partnerEventId: 'autumn-doubles-avon',
  sportCode: 'pickleball',
  name: 'Autumn Doubles - Avon',
  type: 'TOURNAMENT',
  registrationUrl: 'https://example.com/register/autumn-doubles',
};

/** Captures the body the SDK actually put on the wire. */
function captureBody(response: Record<string, unknown>) {
  const seen: { body?: Record<string, unknown> } = {};

  server.use(
    http.post(`${BASE_URL}/partner/events`, async ({ request }) => {
      seen.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(response);
    }),
  );

  return seen;
}

describe('events.submit', () => {
  it('returns the listing, with the id and whether it was created', async () => {
    captureBody({ partnerEventId: 'autumn-doubles-avon', eventId: 48213, created: true });

    const listing = await client().events.submit(SUBMISSION);

    expect(listing.partnerEventId).toBe('autumn-doubles-avon');
    expect(listing.eventId).toBe(48213);
    expect(listing.created).toBe(true);
  });

  it('reports an update as created: false', async () => {
    // How a caller tells a republish from a first publish. A partner that always
    // sees false is reusing an identifier it did not mean to.
    captureBody({ partnerEventId: 'autumn-doubles-avon', eventId: 48213, created: false });

    const listing = await client().events.submit(SUBMISSION);

    expect(listing.created).toBe(false);
  });

  it('sends partnerEventId through unchanged — the key the server upserts on', async () => {
    const seen = captureBody({
      partnerEventId: 'autumn-doubles-avon',
      eventId: 48213,
      created: true,
    });

    await client().events.submit(SUBMISSION);

    // Presence before absence: the body must have arrived at all.
    expect(seen.body).toBeTruthy();
    expect(seen.body?.partnerEventId).toBe('autumn-doubles-avon');
  });

  it('sends the sportCode — required, and never defaulted for the caller', async () => {
    // A submitted event carries no sport of its own, so an SDK that dropped this
    // would have every listing read as pickleball whatever the caller passed.
    const seen = captureBody({
      partnerEventId: 'autumn-doubles-avon',
      eventId: 48213,
      created: true,
    });

    await client().events.submit({ ...SUBMISSION, sportCode: 'padel' });

    expect(seen.body).toBeTruthy();
    expect(seen.body?.sportCode).toBe('padel');
  });

  it('sends every optional field it was given', async () => {
    // A field silently dropped by the SDK looks exactly like a field the server
    // ignored, and the listing is simply wrong in a way nobody is told about.
    const seen = captureBody({
      partnerEventId: 'autumn-doubles-avon',
      eventId: 48213,
      created: true,
    });

    await client().events.submit({
      ...SUBMISSION,
      description: 'Eight weeks of rotating partners.',
      startDate: '2026-09-26T13:00:00Z',
      endDate: '2026-09-27T22:00:00Z',
      hostName: 'SYNC United',
      maxSpots: 128,
      registrationFee: '$65',
      registrationDeadline: '2026-09-20T00:00:00Z',
      location: {
        venueName: 'Picklr Avon',
        city: 'Avon',
        state: 'IN',
        latitude: 39.7628,
        longitude: -86.3997,
      },
    });

    expect(seen.body).toBeTruthy();
    expect(seen.body).toMatchObject({
      description: 'Eight weeks of rotating partners.',
      startDate: '2026-09-26T13:00:00Z',
      endDate: '2026-09-27T22:00:00Z',
      hostName: 'SYNC United',
      maxSpots: 128,
      registrationFee: '$65',
      registrationDeadline: '2026-09-20T00:00:00Z',
    });
    expect(seen.body?.location).toMatchObject({
      venueName: 'Picklr Avon',
      latitude: 39.7628,
      longitude: -86.3997,
    });
  });

  it('omits fields it was not given', async () => {
    // An explicit null is not the same as "unset"; sending one would clear the
    // field on a listing the caller only meant to rename.
    const seen = captureBody({
      partnerEventId: 'autumn-doubles-avon',
      eventId: 48213,
      created: true,
    });

    await client().events.submit(SUBMISSION);

    // Presence first: the required fields must be there.
    expect(seen.body?.name).toBe('Autumn Doubles - Avon');
    expect(seen.body).not.toHaveProperty('description');
    expect(seen.body).not.toHaveProperty('location');
  });

  it('POSTs to /partner/events', async () => {
    // The listing endpoint is a GET on the same path; a method mix-up would read
    // the catalogue instead of writing to it.
    let method: string | undefined;

    server.use(
      http.post(`${BASE_URL}/partner/events`, ({ request }) => {
        method = request.method;
        return HttpResponse.json({
          partnerEventId: 'autumn-doubles-avon',
          eventId: 48213,
          created: true,
        });
      }),
    );

    await client().events.submit(SUBMISSION);

    expect(method).toBe('POST');
  });

  it('is immutable, like every other model', async () => {
    captureBody({ partnerEventId: 'autumn-doubles-avon', eventId: 48213, created: true });

    const listing = await client().events.submit(SUBMISSION);

    expect(Object.isFrozen(listing)).toBe(true);
  });
});
