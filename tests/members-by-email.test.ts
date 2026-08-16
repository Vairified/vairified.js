/**
 * Tests for `client.members.getByEmail()` — email → member lookup
 * (Vairified#995).
 */

import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import {
  AuthenticationError,
  MembersByEmailResult,
  Vairified,
  VairifiedError,
  ValidationError,
} from '../src/index.js';
import { API_KEY, BASE_URL, installServer, memberPayload, server } from './helpers.js';

installServer();

const client = (): Vairified => new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });

/** Capture the outgoing query so we can assert what went on the wire. */
function respondWith(body: unknown, captured?: { url?: URL }, status = 200): void {
  server.use(
    http.get(`${BASE_URL}/partner/members/by-email`, ({ request }) => {
      if (captured) captured.url = new URL(request.url);
      return HttpResponse.json(body, { status });
    }),
  );
}

describe('members.getByEmail — request shape', () => {
  it('sends the addresses comma-joined and omits sport when absent', async () => {
    const captured: { url?: URL } = {};
    respondWith({ matched: [], notFound: ['a@example.com', 'b@example.com'] }, captured);

    await client().members.getByEmail(['a@example.com', 'b@example.com']);

    expect(captured.url?.searchParams.get('emails')).toBe('a@example.com,b@example.com');
    expect(captured.url?.searchParams.has('sport')).toBe(false);
  });

  it('passes the sport filter through when supplied', async () => {
    const captured: { url?: URL } = {};
    respondWith({ matched: [], notFound: ['a@example.com'] }, captured);

    await client().members.getByEmail(['a@example.com'], { sport: 'pickleball' });

    expect(captured.url?.searchParams.get('sport')).toBe('pickleball');
  });
});

describe('members.getByEmail — client-side validation', () => {
  // These reject before any HTTP call. MSW is configured with
  // `onUnhandledRequest: 'error'`, so an accidental round trip would fail
  // the test rather than pass silently.
  it('rejects an empty list', async () => {
    await expect(client().members.getByEmail([])).rejects.toThrow(ValidationError);
  });

  it('rejects more than 100 addresses', async () => {
    const emails = Array.from({ length: 101 }, (_, i) => `p${i}@example.com`);
    await expect(client().members.getByEmail(emails)).rejects.toThrow(ValidationError);
  });

  it('accepts exactly 100 addresses', async () => {
    respondWith({ matched: [], notFound: [] });
    const emails = Array.from({ length: 100 }, (_, i) => `p${i}@example.com`);
    await expect(client().members.getByEmail(emails)).resolves.toBeInstanceOf(MembersByEmailResult);
  });

  it('rejects an address containing a comma rather than silently splitting it', async () => {
    // Joining on "," means an embedded comma would become two addresses
    // server-side and shift every subsequent result.
    await expect(client().members.getByEmail(['a@example.com,b@example.com'])).rejects.toThrow(
      ValidationError,
    );
  });
});

describe('members.getByEmail — response handling', () => {
  it('accounts for every requested address across matched and notFound', async () => {
    respondWith({
      matched: [{ email: 'ada@example.com', members: [memberPayload()] }],
      notFound: ['nobody@example.com'],
    });

    const result = await client().members.getByEmail(['ada@example.com', 'nobody@example.com']);

    const accounted = [...result.matched.map((m) => m.email), ...result.notFound];
    expect(accounted.sort()).toEqual(['ada@example.com', 'nobody@example.com']);
    expect(result.allResolved).toBe(false);
  });

  it('hydrates matches into Member models', async () => {
    respondWith({
      matched: [{ email: 'ada@example.com', members: [memberPayload()] }],
      notFound: [],
    });

    const result = await client().members.getByEmail(['ada@example.com']);
    const member = result.matched[0]?.sole;

    expect(member?.memberId).toBe(4873327);
    expect(member?.ratingFor('pickleball')).toBeCloseTo(3.915);
    expect(result.allResolved).toBe(true);
  });

  it('exposes multiple members for one address without picking one', async () => {
    respondWith({
      matched: [
        {
          email: 'shared@example.com',
          members: [memberPayload(), memberPayload({ memberId: 999 })],
        },
      ],
      notFound: [],
    });

    const result = await client().members.getByEmail(['shared@example.com']);
    const match = result.matched[0];

    expect(match?.members).toHaveLength(2);
    expect(match?.isAmbiguous).toBe(true);
    // `sole` refuses to guess when the address is ambiguous — the whole
    // point of the array shape is that a second match can never hide.
    expect(match?.sole).toBeNull();
    expect(result.memberCount).toBe(2);
  });

  it('looks an address up case-insensitively', async () => {
    respondWith({
      matched: [{ email: 'Ada@Example.com', members: [memberPayload()] }],
      notFound: [],
    });

    const result = await client().members.getByEmail(['Ada@Example.com']);

    expect(result.get('ada@example.com')?.sole?.memberId).toBe(4873327);
    expect(result.get('  ADA@EXAMPLE.COM  ')).not.toBeNull();
    expect(result.get('someone.else@example.com')).toBeNull();
  });

  it('tolerates an envelope missing its arrays', async () => {
    // Defensive: an older or partial deployment must not throw a
    // TypeError inside the SDK.
    respondWith({});
    const result = await client().members.getByEmail(['a@example.com']);

    expect(result.matched).toEqual([]);
    expect(result.notFound).toEqual([]);
  });

  it('freezes the result so callers cannot mutate it', async () => {
    respondWith({
      matched: [{ email: 'ada@example.com', members: [memberPayload()] }],
      notFound: ['x@example.com'],
    });

    const result = await client().members.getByEmail(['ada@example.com', 'x@example.com']);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.matched)).toBe(true);
    expect(Object.isFrozen(result.matched[0])).toBe(true);
    expect(Object.isFrozen(result.notFound)).toBe(true);
  });
});

describe('members.getByEmail — error mapping', () => {
  it('surfaces a scope denial as a VairifiedError', async () => {
    // The endpoint requires key:player:lookup, which is NOT implied by
    // key:player:search — a partner with only search access gets a 403.
    respondWith({ message: 'Insufficient scope. Required: key:player:lookup' }, undefined, 403);

    await expect(client().members.getByEmail(['a@example.com'])).rejects.toThrow(VairifiedError);
  });

  it('surfaces a bad API key as an AuthenticationError', async () => {
    respondWith({ message: 'Invalid API key' }, undefined, 401);

    await expect(client().members.getByEmail(['a@example.com'])).rejects.toThrow(
      AuthenticationError,
    );
  });

  it('surfaces a server-side cap rejection as a ValidationError', async () => {
    respondWith({ message: 'Too many emails: 101. Maximum 100 per request.' }, undefined, 400);

    await expect(client().members.getByEmail(['a@example.com'])).rejects.toThrow(ValidationError);
  });
});
