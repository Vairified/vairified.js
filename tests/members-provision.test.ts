/**
 * Tests for `client.members.provision()` — give each person a VAIR identity,
 * creating a ghost when VAIR holds no record for them.
 */

import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import {
  AuthenticationError,
  ProvisionMembersResult,
  ProvisionResult,
  Vairified,
  VairifiedError,
  ValidationError,
} from '../src/index.js';
import { API_KEY, BASE_URL, installServer, server } from './helpers.js';

installServer();

const client = (): Vairified => new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });
const pat = { email: 'Pat@Example.com', firstName: 'Pat', lastName: 'Rivera' };

/** Capture the outgoing body so we can assert what went on the wire. */
function respondWith(body: unknown, captured?: { body?: unknown }, status = 200): void {
  server.use(
    http.post(`${BASE_URL}/partner/members/provision`, async ({ request }) => {
      if (captured) captured.body = await request.json();
      return HttpResponse.json(body, { status });
    }),
  );
}

describe('members.provision — request shape', () => {
  it('POSTs the members and the sport', async () => {
    const captured: { body?: unknown } = {};
    respondWith({ results: [] }, captured);

    await client().members.provision([pat], { sport: 'pickleball' });

    expect(captured.body).toEqual({ sport: 'pickleball', members: [pat] });
  });

  it('omits sport when absent', async () => {
    const captured: { body?: unknown } = {};
    respondWith({ results: [] }, captured);

    await client().members.provision([pat]);

    expect(captured.body).toEqual({ members: [pat] });
  });
});

describe('members.provision — results', () => {
  it('returns a created ghost with its memberId', async () => {
    respondWith({ results: [{ ref: 'pat@example.com', status: 'created', memberId: 4900123 }] });

    const result = await client().members.provision([pat]);

    expect(result).toBeInstanceOf(ProvisionMembersResult);
    const one = result.get('Pat@Example.com ');
    expect(one).toBeInstanceOf(ProvisionResult);
    expect(one?.isCreated).toBe(true);
    expect(one?.memberId).toBe(4900123);
    expect(one?.error).toBeNull();
  });

  it('reports an existing record without an id', async () => {
    respondWith({ results: [{ ref: 'pat@example.com', status: 'exists' }] });

    const one = (await client().members.provision([pat])).get('pat@example.com');

    expect(one?.exists).toBe(true);
    expect(one?.memberId).toBeNull();
  });

  it('never exposes an id on a non-created result, even if one is sent', async () => {
    respondWith({ results: [{ ref: 'pat@example.com', status: 'exists', memberId: 1001 }] });

    const one = (await client().members.provision([pat])).get('pat@example.com');

    expect(one?.memberId).toBeNull();
  });

  it('carries the API message for an invalid entry', async () => {
    respondWith({
      results: [
        {
          ref: '#0',
          status: 'invalid',
          error: {
            code: 'MISSING_CONTACT',
            message: 'An email address or phone number is required.',
          },
        },
      ],
    });

    const result = await client().members.provision([{ firstName: 'No', lastName: 'Contact' }]);

    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]?.error).toEqual({
      code: 'MISSING_CONTACT',
      message: 'An email address or phone number is required.',
    });
  });

  it('splits a mixed batch and looks up a phone ref as sent', async () => {
    respondWith({
      results: [
        { ref: 'pat@example.com', status: 'created', memberId: 1 },
        { ref: '+1-555-0100', status: 'exists' },
        { ref: '#2', status: 'invalid', error: { code: 'MISSING_NAME', message: 'x' } },
      ],
    });

    const result = await client().members.provision([pat, pat, pat]);

    expect(result.created).toHaveLength(1);
    expect(result.existing).toHaveLength(1);
    expect(result.invalid).toHaveLength(1);
    expect(result.get(' +1-555-0100')?.exists).toBe(true);
  });

  it('is frozen', async () => {
    respondWith({ results: [{ ref: 'pat@example.com', status: 'created', memberId: 1 }] });

    const result = await client().members.provision([pat]);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.results)).toBe(true);
    expect(Object.isFrozen(result.results[0])).toBe(true);
  });
});

describe('members.provision — client-side validation', () => {
  // These reject before any HTTP call; MSW errors on unhandled requests.
  it('rejects an empty list', async () => {
    await expect(client().members.provision([])).rejects.toThrow(ValidationError);
  });

  it('rejects more than 100 members', async () => {
    const members = Array.from({ length: 101 }, (_, i) => ({ ...pat, email: `p${i}@example.com` }));
    await expect(client().members.provision(members)).rejects.toThrow(ValidationError);
  });

  it('accepts exactly 100 members', async () => {
    respondWith({ results: [] });
    const members = Array.from({ length: 100 }, (_, i) => ({ ...pat, email: `p${i}@example.com` }));
    await expect(client().members.provision(members)).resolves.toBeInstanceOf(
      ProvisionMembersResult,
    );
  });
});

describe('members.provision — error mapping', () => {
  it('surfaces a missing scope or untrusted app as a 403 VairifiedError', async () => {
    respondWith(
      { message: 'Provisioning also requires the `key:player:lookup` scope' },
      undefined,
      403,
    );

    const error = await client()
      .members.provision([pat])
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VairifiedError);
    expect((error as VairifiedError).statusCode).toBe(403);
  });

  it('surfaces a bad API key as an AuthenticationError', async () => {
    respondWith({ message: 'Invalid API key' }, undefined, 401);
    await expect(client().members.provision([pat])).rejects.toThrow(AuthenticationError);
  });

  it('surfaces a rejected request shape as a ValidationError', async () => {
    respondWith({ message: 'members must contain no more than 100 elements' }, undefined, 400);
    await expect(client().members.provision([pat])).rejects.toThrow(ValidationError);
  });
});
