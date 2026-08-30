/**
 * client.events.list — the event catalogue.
 *
 * Two things are worth pinning beyond "it parses". First, that the filters
 * actually reach the wire: a query parameter silently dropped by the SDK looks
 * identical to a filter the server ignored, and the caller gets a plausible list
 * of the wrong events either way. Second, that an un-geocoded location surfaces
 * as `null` rather than `0` — zero is a real coordinate, and a map would happily
 * plot every such event in the Gulf of Guinea.
 */
import { HttpResponse, http } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Vairified, ValidationError } from '../src/index.js';
import { API_KEY, BASE_URL, server } from './helpers.js';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = () => new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });

const EVENT = {
  eventId: 12345,
  name: 'Fall Open',
  type: 'TOURNAMENT',
  status: 'UPCOMING',
  sport: 'pickleball',
  startDate: '2026-09-01T18:00:00.000Z',
  endDate: '2026-09-02T18:00:00.000Z',
  club: { name: 'Riverside', city: 'Austin', state: 'TX' },
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
  maxSpots: 64,
  createdAt: '2026-08-01T00:00:00.000Z',
};

/** Capture the query the SDK actually sent. */
const capturing = (captured: { url?: URL }, body: unknown = { events: [], total: 0 }) =>
  http.get(`${BASE_URL}/partner/events`, ({ request }) => {
    captured.url = new URL(request.url);
    return HttpResponse.json(body);
  });

describe('client.events.list', () => {
  it('returns the events and the total before pagination', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/events`, () =>
        HttpResponse.json({ events: [EVENT], total: 143 }),
      ),
    );

    const page = await client().events.list();

    expect(page.total).toBe(143);
    expect(page.events).toHaveLength(1);
    expect(page.events[0].eventId).toBe(12345);
    expect(page.events[0].name).toBe('Fall Open');
  });

  it('⛔ sends every filter it was given', async () => {
    // A dropped parameter is indistinguishable from a server that ignored it.
    const captured: { url?: URL } = {};
    server.use(capturing(captured));

    await client().events.list({
      type: 'LEAGUE',
      dateFrom: '2026-09-01T00:00:00.000Z',
      dateTo: '2026-12-31T00:00:00.000Z',
      lat: 30.2849,
      lng: -97.7341,
      radiusMiles: 25,
      limit: 5,
      offset: 10,
    });

    const q = captured.url?.searchParams;
    expect(q).toBeDefined();
    expect(q?.get('type')).toBe('LEAGUE');
    expect(q?.get('dateFrom')).toBe('2026-09-01T00:00:00.000Z');
    expect(q?.get('dateTo')).toBe('2026-12-31T00:00:00.000Z');
    expect(q?.get('lat')).toBe('30.2849');
    expect(q?.get('lng')).toBe('-97.7341');
    expect(q?.get('radiusMiles')).toBe('25');
    expect(q?.get('limit')).toBe('5');
    expect(q?.get('offset')).toBe('10');
  });

  it('sends no filters when none were given', async () => {
    const captured: { url?: URL } = {};
    server.use(capturing(captured));

    await client().events.list();

    // Presence before absence: the request was made and its query is readable.
    expect(captured.url).toBeDefined();
    expect(captured.url?.searchParams.toString()).toBe('');
  });

  it('sends a zero offset rather than dropping it as falsy', async () => {
    // `if (offset)` would swallow 0 and silently return the first page.
    const captured: { url?: URL } = {};
    server.use(capturing(captured));

    await client().events.list({ offset: 0 });

    expect(captured.url?.searchParams.get('offset')).toBe('0');
  });

  it('sends a zero latitude rather than dropping it', async () => {
    // Latitude 0 is the equator, a real place a caller may search from.
    const captured: { url?: URL } = {};
    server.use(capturing(captured));

    await client().events.list({ lat: 0, lng: 0, radiusMiles: 25 });

    expect(captured.url?.searchParams.get('lat')).toBe('0');
    expect(captured.url?.searchParams.get('lng')).toBe('0');
  });
});

describe('an event location', () => {
  it('exposes the venue and its coordinates', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/events`, () =>
        HttpResponse.json({ events: [EVENT], total: 1 }),
      ),
    );

    const [event] = (await client().events.list()).events;

    expect(event.location).not.toBeNull();
    expect(event.location?.venueName).toBe('Riverside Racquet Club');
    expect(event.location?.latitude).toBe(30.2849);
    expect(event.location?.hasCoordinates).toBe(true);
  });

  it('⛔ reports missing coordinates as null, never 0', async () => {
    const unlocated = { ...EVENT, location: { city: 'Austin', state: 'TX' } };
    server.use(
      http.get(`${BASE_URL}/partner/events`, () =>
        HttpResponse.json({ events: [unlocated], total: 1 }),
      ),
    );

    const [event] = (await client().events.list()).events;

    // Presence of the parent FIRST — asserting `latitude` is not 0 against an
    // undefined location would pass while proving nothing.
    expect(event.location).not.toBeNull();
    expect(event.location?.city).toBe('Austin');
    expect(event.location?.latitude).toBeNull();
    expect(event.location?.longitude).toBeNull();
    expect(event.location?.hasCoordinates).toBe(false);
  });

  it('is null when the event has no location at all', async () => {
    const { location: _omitted, ...noLocation } = EVENT;
    server.use(
      http.get(`${BASE_URL}/partner/events`, () =>
        HttpResponse.json({ events: [noLocation], total: 1 }),
      ),
    );

    const [event] = (await client().events.list()).events;

    // The event is present; only its place is unknown.
    expect(event.eventId).toBe(12345);
    expect(event.location).toBeNull();
  });

  it('is immutable', async () => {
    server.use(
      http.get(`${BASE_URL}/partner/events`, () =>
        HttpResponse.json({ events: [EVENT], total: 1 }),
      ),
    );

    const [event] = (await client().events.list()).events;

    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.location)).toBe(true);
  });
});

describe('errors', () => {
  it('surfaces a rejected partial location filter as a validation error', async () => {
    // The API refuses lat without lng rather than ignoring it; the SDK must not
    // flatten that into an empty list.
    server.use(
      http.get(`${BASE_URL}/partner/events`, () =>
        HttpResponse.json(
          { message: 'A radius search needs lat, lng and radiusMiles together.' },
          { status: 400 },
        ),
      ),
    );

    await expect(client().events.list({ lat: 30.2849 })).rejects.toThrow(ValidationError);
  });
});
