/**
 * HTTP 503 SCORE_ENTRY_PAUSED — the operator's score-entry pause during a
 * rating maintenance window. The body mirrors the API's exception filter:
 * `{ statusCode, message, error, code, retryAfter, timestamp, path }` plus a
 * `Retry-After` header.
 */

import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import {
  ScoreEntryPausedError,
  ServiceUnavailableError,
  Vairified,
  VairifiedError,
} from '../src/index.js';
import { API_KEY, BASE_URL, installServer, server } from './helpers.js';

installServer();

const PAUSED_MESSAGE = 'Score entry is paused for maintenance. Please try again shortly.';

function pausedBody(path: string, overrides: Record<string, unknown> = {}) {
  return {
    statusCode: 503,
    message: PAUSED_MESSAGE,
    error: 'SCORE_ENTRY_PAUSED',
    timestamp: '2026-10-15T12:00:00.000Z',
    path: `/api/v1${path}`,
    code: 'SCORE_ENTRY_PAUSED',
    retryAfter: 300,
    ...overrides,
  };
}

function pausedResponse(path: string, headers: Record<string, string> = { 'Retry-After': '300' }) {
  return HttpResponse.json(pausedBody(path), { status: 503, headers });
}

const batch = {
  sport: 'pickleball',
  matches: [
    {
      identifier: 'm1',
      teams: [['4873327'], ['4873328']],
      games: [{ scores: [11, 8] }],
    },
  ],
};

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected the call to throw');
}

describe('score entry paused (503 SCORE_ENTRY_PAUSED)', () => {
  const client = () => new Vairified({ apiKey: API_KEY, baseUrl: BASE_URL });

  it('matches.submit throws ScoreEntryPausedError with retryAfter and code', async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE_URL}/partner/matches`, () => {
        calls++;
        return pausedResponse('/partner/matches');
      }),
    );

    const err = await caught(client().matches.submit(batch));

    expect(err).toBeInstanceOf(ScoreEntryPausedError);
    expect(err).toBeInstanceOf(ServiceUnavailableError);
    expect(err).toBeInstanceOf(VairifiedError);
    const paused = err as ScoreEntryPausedError;
    expect(paused.name).toBe('ScoreEntryPausedError');
    expect(paused.code).toBe('SCORE_ENTRY_PAUSED');
    expect(paused.statusCode).toBe(503);
    expect(paused.retryAfter).toBe(300);
    expect(paused.message).toBe(PAUSED_MESSAGE);
    expect((paused.response as { code: string }).code).toBe('SCORE_ENTRY_PAUSED');
    // The SDK never retries on its own: one call, one request.
    expect(calls).toBe(1);
  });

  it('matches.tournamentImport throws ScoreEntryPausedError', async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE_URL}/partner/tournament-import`, () => {
        calls++;
        return pausedResponse('/partner/tournament-import');
      }),
    );

    const err = await caught(
      client().matches.tournamentImport({ tournamentName: 'Spring Classic', matches: [] }),
    );

    expect(err).toBeInstanceOf(ScoreEntryPausedError);
    expect((err as ScoreEntryPausedError).retryAfter).toBe(300);
    expect(calls).toBe(1);
  });

  it('the Retry-After header wins over the body', async () => {
    server.use(
      http.post(`${BASE_URL}/partner/matches`, () =>
        pausedResponse('/partner/matches', { 'Retry-After': '120' }),
      ),
    );
    const err = await caught(client().matches.submit(batch));
    expect((err as ScoreEntryPausedError).retryAfter).toBe(120);
  });

  it("falls back to the body's retryAfter when the header is missing", async () => {
    server.use(
      http.post(`${BASE_URL}/partner/matches`, () => pausedResponse('/partner/matches', {})),
    );
    const err = await caught(client().matches.submit(batch));
    expect(err).toBeInstanceOf(ScoreEntryPausedError);
    expect((err as ScoreEntryPausedError).retryAfter).toBe(300);
  });

  it('leaves retryAfter undefined when neither header nor body gives a usable value', async () => {
    server.use(
      http.post(`${BASE_URL}/partner/matches`, () =>
        HttpResponse.json(pausedBody('/partner/matches', { retryAfter: undefined }), {
          status: 503,
          headers: { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' },
        }),
      ),
    );
    const err = await caught(client().matches.submit(batch));
    expect(err).toBeInstanceOf(ScoreEntryPausedError);
    expect((err as ScoreEntryPausedError).retryAfter).toBeUndefined();
  });

  it('a 503 without the code is a plain ServiceUnavailableError', async () => {
    server.use(
      http.post(`${BASE_URL}/partner/matches`, () =>
        HttpResponse.json(
          { statusCode: 503, message: 'Upstream down', error: 'Service Unavailable' },
          { status: 503, headers: { 'Retry-After': '30' } },
        ),
      ),
    );
    const err = await caught(client().matches.submit(batch));
    expect(err).toBeInstanceOf(ServiceUnavailableError);
    expect(err).not.toBeInstanceOf(ScoreEntryPausedError);
    expect((err as ServiceUnavailableError).statusCode).toBe(503);
    expect((err as ServiceUnavailableError).retryAfter).toBe(30);
  });

  it('a non-JSON 503 is a ServiceUnavailableError', async () => {
    server.use(
      http.post(
        `${BASE_URL}/partner/matches`,
        () => new HttpResponse('Service Unavailable', { status: 503 }),
      ),
    );
    const err = await caught(client().matches.submit(batch));
    expect(err).toBeInstanceOf(ServiceUnavailableError);
    expect((err as ServiceUnavailableError).message).toBe('Service Unavailable');
    expect((err as ServiceUnavailableError).retryAfter).toBeUndefined();
  });
});
