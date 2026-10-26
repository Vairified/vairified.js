/**
 * client.events — the event catalogue (list, get, members) and a partner's own
 * listings in it (submit, withdraw, list with `mine`, setMembers).
 *
 * The behaviour worth pinning is what a partner reconciling its catalogue acts
 * on: that `mine` reaches the API, that its own listings carry `partnerEventId`
 * and `removed` while nobody else's do, that a stored logo can be told from one
 * still on its way, that `null` in a submission is sent as `null` (it clears the
 * field) while an omitted field is not sent at all (it keeps the field), and that
 * each refusal surfaces as the error type a caller would branch on.
 */

import { HttpResponse, http } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthenticationError,
  EventLocation,
  EventMembersResult,
  EventRosterRefusal,
  EventRosterResult,
  EventsPage,
  NotFoundError,
  PartnerEvent,
  type PartnerEventWire,
  RateLimitError,
  SubmittedEvent,
  Vairified,
  VairifiedError,
  ValidationError,
  WithdrawnEvent,
} from '../src/index.js';
import { API_KEY, BASE_URL, server } from './helpers.js';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = () => new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });

/** Someone else's event, as the catalogue returns it: no owner-only fields. */
function catalogueEvent(overrides: Partial<PartnerEventWire> = {}): PartnerEventWire {
  return {
    eventId: 12345,
    name: 'Round Robin at Bart’s',
    type: 'TOURNAMENT',
    status: 'UPCOMING',
    sport: 'pickleball',
    startDate: '2026-11-14T14:00:00.000Z',
    endDate: '2026-11-15T22:00:00.000Z',
    club: { name: 'Naples Pickleball Club', city: 'Naples', state: 'FL' },
    location: {
      venueName: 'Riverside Racquet Club',
      address: '1200 Riverside Dr',
      city: 'Austin',
      state: 'TX',
      zip: '78703',
      latitude: 30.2849,
      longitude: -97.7341,
    },
    hostName: 'Bart Brown',
    isPrivate: false,
    maxSpots: 16,
    maxTeams: 8,
    createdAt: '2026-10-01T20:30:00.000Z',
    ...overrides,
  };
}

/** One of the caller's own listings, as `mine=true` returns it. */
function ownListing(overrides: Partial<PartnerEventWire> = {}): PartnerEventWire {
  return catalogueEvent({
    eventId: 48213,
    partnerEventId: 'autumn-doubles-avon',
    club: undefined,
    location: { city: 'Avon', state: 'IN', country: 'US' },
    removed: false,
    registrationUrl: 'https://example.com/register/autumn-doubles',
    registrationDeadline: '2026-11-10T23:59:00-05:00',
    registrationFee: 65,
    playerFormat: 'doubles',
    winScore: 11,
    logoSourceUrl: 'https://example.com/logos/autumn-doubles.png',
    logoUrl: null,
    extras: { leagueTier: 'gold' },
    ...overrides,
  });
}

const validationBody = (message: string | string[]) => ({
  statusCode: 400,
  message,
  error: 'Bad Request',
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('events.list', () => {
  it('returns a page of events with the total before pagination', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/events`, () =>
        HttpResponse.json({ events: [catalogueEvent()], total: 143 }),
      ),
    );

    const page = await client().events.list();

    expect(page).toBeInstanceOf(EventsPage);
    expect(page.total).toBe(143);
    expect(page.events).toHaveLength(1);
    const event = page.events[0] as PartnerEvent;
    expect(event).toBeInstanceOf(PartnerEvent);
    expect(event.eventId).toBe(12345);
    expect(event.club?.name).toBe('Naples Pickleball Club');
    expect(event.location).toBeInstanceOf(EventLocation);
    expect(event.location?.venueName).toBe('Riverside Racquet Club');
    expect(event.location?.hasCoordinates).toBe(true);
  });

  it('carries no owner-only fields on an event someone else listed', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/events`, () =>
        HttpResponse.json({ events: [catalogueEvent()], total: 1 }),
      ),
    );

    const [event] = (await client().events.list()).events;

    expect(event?.partnerEventId).toBeNull();
    expect(event?.removed).toBeNull();
    expect(event?.registrationUrl).toBeNull();
    expect(event?.logoUrl).toBeNull();
    expect(event?.logoSourceUrl).toBeNull();
    expect(event?.extras).toBeNull();
    // The list never resolves a creator; only `get` does.
    expect(event?.createdBy).toBeNull();
  });

  it('sends every filter it is given, under the API’s own names', async () => {
    let params: URLSearchParams | undefined;
    server.use(
      http.get(`${BASE_URL}/partner/events`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json({ events: [], total: 0 });
      }),
    );

    await client().events.list({
      mine: true,
      type: 'OPEN_PLAY',
      dateFrom: '2026-09-01T00:00:00Z',
      dateTo: '2026-12-31T23:59:59-05:00',
      lat: 30.2849,
      lng: -97.7341,
      radiusMiles: 25,
      limit: 50,
      offset: 100,
    });

    expect(Object.fromEntries(params ?? [])).toEqual({
      mine: 'true',
      type: 'OPEN_PLAY',
      dateFrom: '2026-09-01T00:00:00Z',
      dateTo: '2026-12-31T23:59:59-05:00',
      lat: '30.2849',
      lng: '-97.7341',
      radiusMiles: '25',
      limit: '50',
      offset: '100',
    });
  });

  it('sends nothing it was not given', async () => {
    let search: string | undefined;
    server.use(
      http.get(`${BASE_URL}/partner/events`, ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json({ events: [], total: 0 });
      }),
    );

    await client().events.list();

    expect(search).toBe('');
  });

  it('sends mine=false as false, not as an omitted filter', async () => {
    let mine: string | null | undefined;
    server.use(
      http.get(`${BASE_URL}/partner/events`, ({ request }) => {
        mine = new URL(request.url).searchParams.get('mine');
        return HttpResponse.json({ events: [], total: 0 });
      }),
    );

    await client().events.list({ mine: false });

    expect(mine).toBe('false');
  });

  it('pages with limit and offset, and the total is stable across pages', async () => {
    const all = [1, 2, 3].map((n) => catalogueEvent({ eventId: n, name: `Event ${n}` }));
    server.use(
      http.get(`${BASE_URL}/partner/events`, ({ request }) => {
        const url = new URL(request.url);
        const limit = Number(url.searchParams.get('limit'));
        const offset = Number(url.searchParams.get('offset') ?? 0);
        return HttpResponse.json({ events: all.slice(offset, offset + limit), total: all.length });
      }),
    );

    const first = await client().events.list({ limit: 2, offset: 0 });
    const second = await client().events.list({ limit: 2, offset: 2 });

    expect(first.events.map((e) => e.eventId)).toEqual([1, 2]);
    expect(second.events.map((e) => e.eventId)).toEqual([3]);
    expect(first.total).toBe(3);
    expect(second.total).toBe(3);
  });

  it('reads back an own listing with its id, its removal flag and the fields it sent', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/events`, () =>
        HttpResponse.json({
          events: [
            ownListing(),
            ownListing({
              eventId: 48214,
              partnerEventId: 'spring-singles',
              removed: true,
              logoUrl:
                'https://pub-573d0cdaa14b48ac9a5f2ff25dfe21a2.r2.dev/partner-event-logos/48214.png',
            }),
          ],
          total: 2,
        }),
      ),
    );

    const page = await client().events.list({ mine: true });
    const [live, removed] = page.events;

    expect(live?.partnerEventId).toBe('autumn-doubles-avon');
    expect(live?.removed).toBe(false);
    expect(live?.registrationUrl).toBe('https://example.com/register/autumn-doubles');
    expect(live?.registrationFee).toBe(65);
    expect(live?.winScore).toBe(11);
    expect(live?.location?.country).toBe('US');
    // A logo still on its way (or refused) reads `null`; the URL sent is kept apart.
    expect(live?.logoUrl).toBeNull();
    expect(live?.logoSourceUrl).toBe('https://example.com/logos/autumn-doubles.png');
    expect(live?.extras).toEqual({ leagueTier: 'gold' });

    expect(removed?.removed).toBe(true);
    expect(removed?.logoUrl).toMatch(/partner-event-logos\/48214\.png$/);
  });

  it('reports an un-geocoded location as null coordinates, never 0', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/events`, () =>
        HttpResponse.json({
          events: [catalogueEvent({ location: { city: 'Austin', state: 'TX' } })],
          total: 1,
        }),
      ),
    );

    const [event] = (await client().events.list()).events;

    expect(event?.location?.latitude).toBeNull();
    expect(event?.location?.longitude).toBeNull();
    expect(event?.location?.hasCoordinates).toBe(false);
  });

  it('returns frozen models', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/events`, () =>
        HttpResponse.json({ events: [ownListing()], total: 1 }),
      ),
    );

    const page = await client().events.list({ mine: true });
    const event = page.events[0];

    expect(Object.isFrozen(page)).toBe(true);
    expect(Object.isFrozen(page.events)).toBe(true);
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event?.location)).toBe(true);
    expect(Object.isFrozen(event?.extras)).toBe(true);
  });

  it('surfaces a refused filter as a ValidationError with the API’s message', async () => {
    const message =
      'A radius search needs lat, lng and radiusMiles together. Sending some of them is refused rather than ignored.';
    server.use(
      http.get(`${BASE_URL}/partner/events`, () =>
        HttpResponse.json(validationBody(message), { status: 400 }),
      ),
    );

    const err = await client()
      .events.list({ lat: 30.2849, lng: -97.7341 })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).statusCode).toBe(400);
    expect((err as ValidationError).message).toContain('lat, lng and radiusMiles together');
  });

  it.each([
    ['dateFrom', { dateFrom: '2026-09-01' }],
    ['dateTo', { dateTo: '2026-12-31T23:59:59' }],
  ])('refuses a %s with no time zone before sending anything', async (field, dates) => {
    let requests = 0;
    server.use(
      http.get(`${BASE_URL}/partner/events`, () => {
        requests += 1;
        return HttpResponse.json({ events: [], total: 0 });
      }),
    );

    const err = await client()
      .events.list(dates)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).message).toContain(`${field} must be a date and time`);
    expect(requests).toBe(0);
  });

  it('surfaces a missing scope (403) as a VairifiedError carrying the status', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/events`, () =>
        HttpResponse.json(
          {
            statusCode: 403,
            message:
              'Listing the event catalogue needs `key:event:read`. A key holding only `key:event:submit` can list its own listings with `mine=true`.',
            error: 'Forbidden',
          },
          { status: 403 },
        ),
      ),
    );

    const err = await client()
      .events.list()
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(VairifiedError);
    expect(err).not.toBeInstanceOf(ValidationError);
    expect((err as VairifiedError).statusCode).toBe(403);
    expect((err as VairifiedError).message).toContain('mine=true');
  });

  it('maps 401 to AuthenticationError', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/events`, () =>
        HttpResponse.json({ statusCode: 401, message: 'Invalid API key' }, { status: 401 }),
      ),
    );

    await expect(client().events.list()).rejects.toThrowError(AuthenticationError);
  });

  it('maps 429 to RateLimitError with Retry-After', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/events`, () =>
        HttpResponse.json(
          { statusCode: 429, message: 'Too many requests' },
          { status: 429, headers: { 'Retry-After': '30' } },
        ),
      ),
    );

    const err = await client()
      .events.list()
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).retryAfter).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe('events.get', () => {
  it('reads one event by its integer id, with its creator and scoring', async () => {
    let path: string | undefined;
    server.use(
      http.get(`${BASE_URL}/partner/event/:eventId`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json(
          catalogueEvent({
            winScore: 11,
            winBy: 2,
            createdBy: { memberId: 5717273, firstName: 'Bart', lastName: 'Brown' },
          }),
        );
      }),
    );

    const event = await client().events.get(12345);

    expect(path).toMatch(/\/partner\/event\/12345$/);
    expect(event).toBeInstanceOf(PartnerEvent);
    expect(event.winScore).toBe(11);
    expect(event.winBy).toBe(2);
    expect(event.createdBy?.memberId).toBe(5717273);
    expect(event.location?.city).toBe('Austin');
    expect(event.partnerEventId).toBeNull();
  });

  it('returns the owner-only fields on one of your own listings', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/event/:eventId`, () => HttpResponse.json(ownListing())),
    );

    const event = await client().events.get(48213);

    expect(event.partnerEventId).toBe('autumn-doubles-avon');
    expect(event.removed).toBe(false);
    expect(event.logoSourceUrl).toBe('https://example.com/logos/autumn-doubles.png');
  });

  it('maps 404 to NotFoundError', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/event/:eventId`, () =>
        HttpResponse.json(
          { statusCode: 404, message: 'Event 999 not found.', error: 'Not Found' },
          { status: 404 },
        ),
      ),
    );

    await expect(client().events.get(999)).rejects.toThrowError(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// members
// ---------------------------------------------------------------------------

describe('events.members', () => {
  it('returns the roster with each member’s rating in the event’s sport', async () => {
    let path: string | undefined;
    server.use(
      http.get(`${BASE_URL}/partner/event/:eventId/members`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({
          eventId: 12345,
          sport: 'pickleball',
          members: [
            {
              memberId: 4873327,
              firstName: 'Mike',
              lastName: 'Barker',
              rating: 3.915,
              isVairified: true,
              isVairPlus: true,
              enrollmentStatus: 'CONFIRMED',
              isPaid: false,
            },
            {
              memberId: 4873328,
              firstName: 'Ann',
              lastName: 'Lee',
              isVairified: false,
              isVairPlus: false,
              enrollmentStatus: 'PENDING',
              isPaid: true,
            },
          ],
        });
      }),
    );

    const roster = await client().events.members(12345);

    expect(path).toMatch(/\/partner\/event\/12345\/members$/);
    expect(roster).toBeInstanceOf(EventMembersResult);
    expect(roster.sport).toBe('pickleball');
    expect(roster.members.map((m) => m.memberId)).toEqual([4873327, 4873328]);
    expect(roster.members[0]?.rating).toBe(3.915);
    // VAIR+ and this event's entry fee are independent.
    expect(roster.members[0]?.isVairPlus).toBe(true);
    expect(roster.members[0]?.isPaid).toBe(false);
    expect(roster.members[1]?.rating).toBeNull();
    expect(Object.isFrozen(roster.members)).toBe(true);
  });

  it('maps 404 to NotFoundError', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/event/:eventId/members`, () =>
        HttpResponse.json({ statusCode: 404, message: 'Event 1 not found.' }, { status: 404 }),
      ),
    );

    await expect(client().events.members(1)).rejects.toThrowError(NotFoundError);
  });

  it('reads an own listing’s roster: who is waiting, where each came from, and lapsed', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/event/:eventId/members`, () =>
        HttpResponse.json({
          eventId: 48213,
          sport: 'pickleball',
          members: [
            {
              memberId: 4873327,
              firstName: 'Mike',
              lastName: 'Barker',
              rating: 3.915,
              isVairified: true,
              isVairPlus: false,
              enrollmentStatus: 'PENDING',
              isPaid: false,
              source: 'VAIR_SIGNUP',
              lapsed: false,
            },
            {
              memberId: 4873330,
              firstName: 'Ann',
              lastName: 'Lee',
              isVairified: false,
              isVairPlus: true,
              enrollmentStatus: 'CONFIRMED',
              isPaid: true,
              source: 'PARTNER_LIST',
              lapsed: false,
            },
          ],
        }),
      ),
    );

    const roster = await client().events.members(48213);

    expect(roster.members.map((m) => [m.enrollmentStatus, m.source, m.lapsed])).toEqual([
      ['PENDING', 'VAIR_SIGNUP', false],
      ['CONFIRMED', 'PARTNER_LIST', false],
    ]);
  });

  // A member who disconnected the partner, or never allowed it their profile,
  // comes back as member number + status only. One such row must not break the
  // whole roster, and its absent fields read as null, never as a quiet false.
  it('parses a number-only row, with the profile fields null rather than false', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/event/:eventId/members`, () =>
        HttpResponse.json({
          eventId: 48213,
          sport: 'pickleball',
          members: [
            {
              memberId: 4873399,
              enrollmentStatus: 'CONFIRMED',
              isPaid: false,
              source: 'VAIR_SIGNUP',
              lapsed: true,
            },
          ],
        }),
      ),
    );

    const roster = await client().events.members(48213);
    const [m] = roster.members;

    expect(roster.members).toHaveLength(1);
    expect(m?.memberId).toBe(4873399);
    expect(m?.enrollmentStatus).toBe('CONFIRMED');
    expect(m?.lapsed).toBe(true);
    expect(m?.firstName).toBeNull();
    expect(m?.lastName).toBeNull();
    expect(m?.isVairified).toBeNull();
    expect(m?.isVairPlus).toBeNull();
    expect(m?.rating).toBeNull();
  });

  it('reads source and lapsed as null on an event that is not yours', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/event/:eventId/members`, () =>
        HttpResponse.json({
          eventId: 12345,
          sport: 'pickleball',
          members: [
            {
              memberId: 4873327,
              firstName: 'Mike',
              lastName: 'Barker',
              isVairified: true,
              isVairPlus: false,
              enrollmentStatus: 'CONFIRMED',
              isPaid: false,
            },
          ],
        }),
      ),
    );

    const [m] = (await client().events.members(12345)).members;

    expect(m?.source).toBeNull();
    expect(m?.lapsed).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// submit
// ---------------------------------------------------------------------------

describe('events.submit', () => {
  it('posts the submission and reports a created listing', async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE_URL}/partner/events`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          partnerEventId: 'autumn-doubles-avon',
          eventId: 48213,
          created: true,
        });
      }),
    );

    const result = await client().events.submit({
      partnerEventId: 'autumn-doubles-avon',
      sportCode: 'pickleball',
      name: 'Autumn Doubles - Avon',
      type: 'TOURNAMENT',
      registrationUrl: 'https://example.com/register/autumn-doubles',
      startDate: '2026-11-14T09:00:00-05:00',
      endDate: '2026-11-15T17:00:00-05:00',
      maxTeams: 32,
      logoUrl: 'https://example.com/logos/autumn-doubles.png',
      location: { city: 'Avon', state: 'IN', latitude: 39.7628, longitude: -86.3997 },
      extras: { leagueTier: 'gold' },
    });

    expect(result).toBeInstanceOf(SubmittedEvent);
    expect(result.created).toBe(true);
    expect(result.eventId).toBe(48213);
    expect(result.partnerEventId).toBe('autumn-doubles-avon');
    expect(body).toEqual({
      partnerEventId: 'autumn-doubles-avon',
      sportCode: 'pickleball',
      name: 'Autumn Doubles - Avon',
      type: 'TOURNAMENT',
      registrationUrl: 'https://example.com/register/autumn-doubles',
      startDate: '2026-11-14T09:00:00-05:00',
      endDate: '2026-11-15T17:00:00-05:00',
      maxTeams: 32,
      logoUrl: 'https://example.com/logos/autumn-doubles.png',
      location: { city: 'Avon', state: 'IN', latitude: 39.7628, longitude: -86.3997 },
      extras: { leagueTier: 'gold' },
    });
  });

  it('sends null to clear a field and leaves an omitted field out, so it is kept', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE_URL}/partner/events`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          partnerEventId: 'autumn-doubles-avon',
          eventId: 48213,
          created: false,
        });
      }),
    );

    const result = await client().events.submit({
      partnerEventId: 'autumn-doubles-avon',
      sportCode: 'pickleball',
      name: 'Autumn Doubles - Avon',
      type: 'TOURNAMENT',
      registrationUrl: 'https://example.com/register/autumn-doubles',
      startDate: '2026-11-14T09:00:00-05:00',
      endDate: '2026-11-15T17:00:00-05:00',
      status: 'CANCELLED',
      logoUrl: null,
      location: null,
    });

    expect(result.created).toBe(false);
    expect(body?.logoUrl).toBeNull();
    expect(body?.location).toBeNull();
    expect(body?.status).toBe('CANCELLED');
    expect(body).not.toHaveProperty('maxTeams');
    expect(body).not.toHaveProperty('registrationDeadline');
  });

  it('surfaces field errors as a ValidationError, with every message on the response', async () => {
    const messages = [
      'maxSpots must not be greater than 100000',
      'startDate must be a date and time with its time zone, e.g. 2026-11-14T09:00:00-05:00 or 2026-11-14T14:00:00Z',
    ];
    server.use(
      http.post(`${BASE_URL}/partner/events`, () =>
        HttpResponse.json(validationBody(messages), { status: 400 }),
      ),
    );

    const err = await client()
      .events.submit({
        partnerEventId: 'autumn-doubles-avon',
        sportCode: 'pickleball',
        name: 'Autumn Doubles - Avon',
        type: 'TOURNAMENT',
        registrationUrl: 'https://example.com/register/autumn-doubles',
        startDate: '2026-11-14T09:00:00-05:00',
        endDate: '2026-11-15T17:00:00-05:00',
        maxSpots: 9_999_999_999,
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).message).toContain('maxSpots must not be greater than 100000');
    expect((err as ValidationError).response).toEqual(validationBody(messages));
  });

  it.each([
    ['startDate', { startDate: '2026-11-14' }],
    ['startDate', { startDate: '2026-11-14T09:00:00' }],
    ['endDate', { endDate: '2026-11-15T17:00' }],
    ['registrationDeadline', { registrationDeadline: '2026-11-10' }],
  ])('refuses a %s with no time zone before sending anything', async (field, dates) => {
    let requests = 0;
    server.use(
      http.post(`${BASE_URL}/partner/events`, () => {
        requests += 1;
        return HttpResponse.json({ partnerEventId: 'x', eventId: 1, created: true });
      }),
    );

    const err = await client()
      .events.submit({
        partnerEventId: 'autumn-doubles-avon',
        sportCode: 'pickleball',
        name: 'Autumn Doubles - Avon',
        type: 'TOURNAMENT',
        registrationUrl: 'https://example.com/register/autumn-doubles',
        startDate: '2026-11-14T09:00:00Z',
        endDate: '2026-11-15T17:00:00Z',
        ...dates,
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).message).toContain(`${field} must be a date and time`);
    expect(requests).toBe(0);
  });

  it('accepts a null registrationDeadline, which clears it, and an offset without a colon', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE_URL}/partner/events`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ partnerEventId: 'x', eventId: 1, created: false });
      }),
    );

    await client().events.submit({
      partnerEventId: 'x',
      sportCode: 'pickleball',
      name: 'X',
      type: 'CLINIC',
      registrationUrl: 'https://example.com/x',
      startDate: '2026-11-14T09:00:00.123-0500',
      endDate: '2026-11-14T17:00:00-0500',
      registrationDeadline: null,
    });

    expect(body?.registrationDeadline).toBeNull();
    expect(body?.startDate).toBe('2026-11-14T09:00:00.123-0500');
    expect(body?.endDate).toBe('2026-11-14T17:00:00-0500');
  });

  it('requires an end date: the type refuses one left out, and the API’s 400 names it', async () => {
    const message = "endDate is required, and a listing's end date cannot be cleared.";
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE_URL}/partner/events`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(validationBody(message), { status: 400 });
      }),
    );

    // A plain-JavaScript caller can still leave it out; the API is what refuses it.
    const err = await client()
      .events.submit(
        // @ts-expect-error endDate is required on every submission
        {
          partnerEventId: 'autumn-doubles-avon',
          sportCode: 'pickleball',
          name: 'Autumn Doubles - Avon',
          type: 'TOURNAMENT',
          registrationUrl: 'https://example.com/register/autumn-doubles',
          startDate: '2026-11-14T09:00:00Z',
        },
      )
      .catch((e: unknown) => e);

    expect(body).not.toHaveProperty('endDate');
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).message).toContain('endDate is required');
  });

  it('surfaces a listing Vairified removed as a 403 VairifiedError', async () => {
    server.use(
      http.post(`${BASE_URL}/partner/events`, () =>
        HttpResponse.json(
          {
            statusCode: 403,
            message:
              'That listing was removed by Vairified and cannot be restored by re-submitting it. Contact Vairified if you believe it was removed in error.',
            error: 'Forbidden',
          },
          { status: 403 },
        ),
      ),
    );

    const err = await client()
      .events.submit({
        partnerEventId: 'spring-singles',
        sportCode: 'pickleball',
        name: 'Spring Singles',
        type: 'LEAGUE',
        registrationUrl: 'https://example.com/register/spring',
        startDate: '2026-11-14T09:00:00Z',
        endDate: '2026-11-14T17:00:00Z',
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(VairifiedError);
    expect((err as VairifiedError).statusCode).toBe(403);
    expect((err as VairifiedError).message).toContain('removed by Vairified');
  });

  it('surfaces a concurrent-write conflict as a 409 VairifiedError', async () => {
    server.use(
      http.post(`${BASE_URL}/partner/events`, () =>
        HttpResponse.json(
          {
            statusCode: 409,
            message: 'The listing changed while this submission was being saved. Send it again.',
            error: 'Conflict',
          },
          { status: 409 },
        ),
      ),
    );

    const err = await client()
      .events.submit({
        partnerEventId: 'autumn-doubles-avon',
        sportCode: 'pickleball',
        name: 'Autumn Doubles - Avon',
        type: 'TOURNAMENT',
        registrationUrl: 'https://example.com/register/autumn-doubles',
        startDate: '2026-11-14T09:00:00Z',
        endDate: '2026-11-15T17:00:00Z',
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(VairifiedError);
    expect((err as VairifiedError).statusCode).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// withdraw
// ---------------------------------------------------------------------------

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

    expect(result).toBeInstanceOf(WithdrawnEvent);
    expect(result.partnerEventId).toBe('autumn-doubles-avon');
    expect(result.eventId).toBe(48213);
    expect(result.withdrawn).toBe(true);
  });

  it('treats an already-withdrawn listing as a success', async () => {
    // A reconciler retries whole batches; "already gone" is the expected state.
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
    // `:` is legal in a partnerEventId; the identifier must reach the API as one
    // path segment whatever it holds.
    let path: string | undefined;
    server.use(
      http.delete(`${BASE_URL}/partner/events/:id`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ partnerEventId: 'season:2026.a', eventId: 1, withdrawn: true });
      }),
    );

    await client().events.withdraw('season:2026.a');

    expect(path).toMatch(/\/partner\/events\/season%3A2026\.a$/);
  });

  it('maps an id you never submitted (404) to NotFoundError', async () => {
    server.use(
      http.delete(`${BASE_URL}/partner/events/:id`, () =>
        HttpResponse.json(
          { statusCode: 404, message: "No listing found for 'nope'.", error: 'Not Found' },
          { status: 404 },
        ),
      ),
    );

    await expect(client().events.withdraw('nope')).rejects.toThrowError(NotFoundError);
  });

  it('surfaces a key with no partner app (403) as a VairifiedError carrying the status', async () => {
    server.use(
      http.delete(`${BASE_URL}/partner/events/:id`, () =>
        HttpResponse.json(
          {
            statusCode: 403,
            message:
              'This API key is not linked to a partner application, so it cannot withdraw events.',
          },
          { status: 403 },
        ),
      ),
    );

    const err = await client()
      .events.withdraw('autumn-doubles-avon')
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(VairifiedError);
    expect((err as VairifiedError).statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// setMembers
// ---------------------------------------------------------------------------

describe('events.setMembers', () => {
  const rosterResult = (overrides: Record<string, unknown> = {}) => ({
    partnerEventId: 'autumn-doubles-avon',
    eventId: 48213,
    added: 3,
    confirmed: 1,
    unchanged: 20,
    removed: 2,
    refused: [],
    ...overrides,
  });

  it('PUTs the whole list and reports the counts', async () => {
    let method: string | undefined;
    let path: string | undefined;
    let body: unknown;
    server.use(
      http.put(`${BASE_URL}/partner/events/:id/members`, async ({ request }) => {
        method = request.method;
        path = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json(rosterResult());
      }),
    );

    const result = await client().events.setMembers('autumn-doubles-avon', [4873327, 4873330]);

    expect(method).toBe('PUT');
    expect(path).toMatch(/\/partner\/events\/autumn-doubles-avon\/members$/);
    expect(body).toEqual({ memberIds: [4873327, 4873330] });
    expect(result).toBeInstanceOf(EventRosterResult);
    expect(result.partnerEventId).toBe('autumn-doubles-avon');
    expect(result.eventId).toBe(48213);
    expect([result.added, result.confirmed, result.unchanged, result.removed]).toEqual([
      3, 1, 20, 2,
    ]);
    expect(result.refused).toEqual([]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.refused)).toBe(true);
  });

  it('sends an empty list as an empty list, which clears the roster', async () => {
    let body: unknown;
    server.use(
      http.put(`${BASE_URL}/partner/events/:id/members`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          rosterResult({ added: 0, confirmed: 0, unchanged: 0, removed: 23 }),
        );
      }),
    );

    const result = await client().events.setMembers('autumn-doubles-avon', []);

    expect(body).toEqual({ memberIds: [] });
    expect(result.removed).toBe(23);
  });

  it('reports each refused member with its reason, DISCONNECTED included', async () => {
    server.use(
      http.put(`${BASE_URL}/partner/events/:id/members`, () =>
        HttpResponse.json(
          rosterResult({
            refused: [
              {
                memberId: 4873399,
                reason: 'NOT_CONNECTED',
                message: "This member hasn't connected your app.",
              },
              {
                memberId: 4873400,
                reason: 'DISCONNECTED',
                message:
                  'This member has disconnected your app, and holds no current VAIR sign-up on this listing.',
              },
              {
                memberId: 9999999,
                reason: 'UNKNOWN_MEMBER',
                message: 'No VAIR member has this number.',
              },
            ],
          }),
        ),
      ),
    );

    const result = await client().events.setMembers(
      'autumn-doubles-avon',
      [4873327, 4873399, 4873400, 9999999],
    );

    expect(result.refused.map((r) => [r.memberId, r.reason])).toEqual([
      [4873399, 'NOT_CONNECTED'],
      [4873400, 'DISCONNECTED'],
      [9999999, 'UNKNOWN_MEMBER'],
    ]);
    const notConnected = result.refused[0];
    expect(notConnected?.message).toBe("This member hasn't connected your app.");
    const disconnected = result.refused[1];
    expect(disconnected).toBeInstanceOf(EventRosterRefusal);
    expect(disconnected?.message).toBe(
      'This member has disconnected your app, and holds no current VAIR sign-up on this listing.',
    );
    expect(Object.isFrozen(disconnected)).toBe(true);
  });

  it('URL-encodes the identifier', async () => {
    let path: string | undefined;
    server.use(
      http.put(`${BASE_URL}/partner/events/:id/members`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json(rosterResult({ partnerEventId: 'season:2026.a' }));
      }),
    );

    await client().events.setMembers('season:2026.a', [1]);

    expect(path).toMatch(/\/partner\/events\/season%3A2026\.a\/members$/);
  });

  it('surfaces a refused list (400) as a ValidationError with the API’s message', async () => {
    server.use(
      http.put(`${BASE_URL}/partner/events/:id/members`, () =>
        HttpResponse.json(validationBody(['memberIds holds whole member numbers only.']), {
          status: 400,
        }),
      ),
    );

    const err = await client()
      .events.setMembers('autumn-doubles-avon', [1.5])
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).message).toContain('whole member numbers');
  });

  it('maps an id you never submitted (404) to NotFoundError', async () => {
    server.use(
      http.put(`${BASE_URL}/partner/events/:id/members`, () =>
        HttpResponse.json(
          { statusCode: 404, message: "No listing found for 'nope'.", error: 'Not Found' },
          { status: 404 },
        ),
      ),
    );

    await expect(client().events.setMembers('nope', [1])).rejects.toThrowError(NotFoundError);
  });

  it('surfaces a withdrawn or cancelled listing (409) as a VairifiedError carrying the status', async () => {
    server.use(
      http.put(`${BASE_URL}/partner/events/:id/members`, () =>
        HttpResponse.json(
          {
            statusCode: 409,
            message: 'That listing is withdrawn. Send the event again before sending its members.',
            error: 'Conflict',
          },
          { status: 409 },
        ),
      ),
    );

    const err = await client()
      .events.setMembers('autumn-doubles-avon', [1])
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(VairifiedError);
    expect((err as VairifiedError).statusCode).toBe(409);
  });

  it('surfaces a listing Vairified removed (403) as a VairifiedError carrying the status', async () => {
    server.use(
      http.put(`${BASE_URL}/partner/events/:id/members`, () =>
        HttpResponse.json(
          {
            statusCode: 403,
            message: 'That listing was removed by Vairified.',
            error: 'Forbidden',
          },
          { status: 403 },
        ),
      ),
    );

    const err = await client()
      .events.setMembers('autumn-doubles-avon', [1])
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(VairifiedError);
    expect((err as VairifiedError).statusCode).toBe(403);
  });
});
