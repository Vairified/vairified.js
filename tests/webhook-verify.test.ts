/**
 * Webhook signature verification — Vairified#1275.
 *
 * Covers the signature scheme, the replay window, secret rotation, forward
 * compatibility, and the shape guards.
 */

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  compareSequence,
  DEFAULT_TOLERANCE_SECONDS,
  dedupeKey,
  isConnectionRevokedEvent,
  isEventCreatedEvent,
  isMemberStatusEvent,
  isNewerSequence,
  isRatingUpdatedEvent,
  type VerifiedWebhookEvent,
  verifyWebhook,
  WebhookSignatureError,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// The shared golden vector
// ---------------------------------------------------------------------------
//
// Generated ONCE from the backend's own signing path
// (`partner-webhook.processor.ts:552,560-563`) and pasted here as literals.
// It is NOT computed by this SDK, on purpose: a vector this package derives
// would only prove the package agrees with itself. The identical literals are
// asserted in vairified.py's `test_webhook_verify.py`, which is the only thing
// in either repo that measures parity rather than re-reasoning it.
//
// The body carries two things deliberately: non-ASCII characters, and NO
// `sports` key (the member-declined-rating-scope cohort, which production
// contains none of today).
const GOLDEN = {
  secret: 'whsec_golden_vector_do_not_use_in_production',
  timestamp: 1758700000,
  header: 't=1758700000,v1=bb0909efd0c4aa80d22af4c8bfd0cc1d2482acf1a2e5d6ddc99bb94e7fb653d7',
  body: '{"event":"member.status","eventId":"evt_0000000000000000000000000000abcd","timestamp":"2026-09-24T12:00:00.000Z","data":{"memberId":7204743,"isVairPlus":true,"isAmbassador":false,"vairProStatus":null,"vairifiedRatingStatus":"COMPLETED","changedAt":"2026-09-24T12:00:00.000Z","displayName":"Renée Ōsaka-Müller ✓"}}',
} as const;

/** Sign a body the way the backend does, for cases the golden vector doesn't cover. */
function sign(body: string, secret: string, timestamp: number): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

const NOW = GOLDEN.timestamp;
const at = (nowSeconds: number = NOW) => ({ nowSeconds });

async function expectRejection(
  promise: Promise<unknown>,
  reason: string,
): Promise<WebhookSignatureError> {
  await expect(promise).rejects.toBeInstanceOf(WebhookSignatureError);
  const err: WebhookSignatureError = await promise.then(
    () => {
      throw new Error('expected a rejection, but it resolved');
    },
    (e: unknown) => e as WebhookSignatureError,
  );
  expect(err.reason).toBe(reason);
  return err;
}

// mutation-checked 2026-09-24: changed the signed-payload separator from `.`
// to `:` in verify.ts -> all 4 of these red (17 across the file), messages name
// the signature mismatch. That mutant is the right one here: these are positive
// tests, so forcing the HMAC check to pass leaves them green — it is the
// PAYLOAD CONSTRUCTION they are load-bearing on, not the comparison.
describe('verifyWebhook — the shared golden vector', () => {
  it('verifies the backend-generated vector byte for byte', async () => {
    const event = await verifyWebhook(GOLDEN.body, GOLDEN.header, GOLDEN.secret, at());
    expect(event.event).toBe('member.status');
    expect(event.eventId).toBe('evt_0000000000000000000000000000abcd');
  });

  it('verifies the same vector passed as bytes, not text', async () => {
    const bytes = new TextEncoder().encode(GOLDEN.body);
    const event = await verifyWebhook(bytes, GOLDEN.header, GOLDEN.secret, at());
    expect(event.event).toBe('member.status');
  });

  it('exposes memberId as a number and carries no internal UUID', async () => {
    const event = await verifyWebhook(GOLDEN.body, GOLDEN.header, GOLDEN.secret, at());
    if (!isMemberStatusEvent(event)) throw new Error('narrowing failed');
    expect(typeof event.data.memberId).toBe('number');
    expect(JSON.stringify(event.data)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it('leaves an absent `sports` absent — never {}', async () => {
    const event = await verifyWebhook(GOLDEN.body, GOLDEN.header, GOLDEN.secret, at());
    if (!isMemberStatusEvent(event)) throw new Error('narrowing failed');
    // The distinction this asserts: "we were not permitted to tell you" must
    // stay distinguishable from "holds no certifications". Defaulting to {}
    // silently converts the first into the second.
    expect(event.data.sports).toBeUndefined();
    expect('sports' in event.data).toBe(false);
  });
});

// mutation-checked 2026-09-24: forced `crypto.subtle.verify`'s result to a
// constant `true` -> 3 red (tampered body, the message-leak check, and the
// rotation none-match case), messages name the signature mismatch.
describe('verifyWebhook — refusals', () => {
  it('refuses a body altered by one byte', async () => {
    const tampered = GOLDEN.body.replace('"isVairPlus":true', '"isVairPlus":fals');
    await expectRejection(
      verifyWebhook(`${tampered}e`, GOLDEN.header, GOLDEN.secret, at()),
      'signature_mismatch',
    );
  });

  it('refuses a missing header', async () => {
    await expectRejection(
      verifyWebhook(GOLDEN.body, null, GOLDEN.secret, at()),
      'missing_signature',
    );
    await expectRejection(verifyWebhook(GOLDEN.body, '', GOLDEN.secret, at()), 'missing_signature');
  });

  it('refuses a header missing its t or v1 part', async () => {
    const digest = GOLDEN.header.split('v1=')[1] as string;
    await expectRejection(
      verifyWebhook(GOLDEN.body, `v1=${digest}`, GOLDEN.secret, at()),
      'malformed_signature',
    );
    await expectRejection(
      verifyWebhook(GOLDEN.body, `t=${GOLDEN.timestamp}`, GOLDEN.secret, at()),
      'malformed_signature',
    );
    await expectRejection(
      verifyWebhook(GOLDEN.body, 'total nonsense', GOLDEN.secret, at()),
      'malformed_signature',
    );
  });

  // mutation-checked 2026-09-24: replaced the integer guard on `t` with
  // `if (false)` -> 1 red, exactly this test, message names the coerced
  // timestamp. That rejection had no mutant covering it before this.
  it('refuses a non-integer timestamp rather than coercing it', async () => {
    const digest = GOLDEN.header.split('v1=')[1] as string;
    await expectRejection(
      verifyWebhook(GOLDEN.body, `t=1.7587e9,v1=${digest}`, GOLDEN.secret, at()),
      'malformed_signature',
    );
  });

  it('refuses a v1 that is not a hex digest', async () => {
    await expectRejection(
      verifyWebhook(GOLDEN.body, `t=${GOLDEN.timestamp},v1=zzzz`, GOLDEN.secret, at()),
      'malformed_signature',
    );
  });

  it('accepts the pairs in any order and ignores unknown keys', async () => {
    const digest = GOLDEN.header.split('v1=')[1] as string;
    // A future `v2=` must not break a receiver written today.
    const reordered = `v2=deadbeef,v1=${digest},t=${GOLDEN.timestamp}`;
    const event = await verifyWebhook(GOLDEN.body, reordered, GOLDEN.secret, at());
    expect(event.event).toBe('member.status');
  });

  // mutation-checked 2026-09-24: narrowed hexToBytes' charset to `[0-9a-f]`
  // -> 1 red, exactly this test. Case-insensitive comparison had no mutant
  // covering it before this.
  it('compares the digest case-insensitively', async () => {
    const digest = GOLDEN.header.split('v1=')[1] as string;
    const upper = `t=${GOLDEN.timestamp},v1=${digest.toUpperCase()}`;
    const event = await verifyWebhook(GOLDEN.body, upper, GOLDEN.secret, at());
    expect(event.event).toBe('member.status');
  });

  it('never names the secret or either digest in the message', async () => {
    const err = await expectRejection(
      verifyWebhook(GOLDEN.body, GOLDEN.header, 'the-wrong-secret', at()),
      'signature_mismatch',
    );
    const digest = GOLDEN.header.split('v1=')[1] as string;
    expect(err.message).not.toContain('the-wrong-secret');
    expect(err.message).not.toContain(digest);
    expect(err.message).not.toMatch(/[0-9a-f]{32}/i);
  });
});

// mutation-checked 2026-09-24: replaced `Math.abs(now - timestamp)` with
// `now - timestamp` -> 1 red, and it is the FUTURE-dated case that goes red,
// which is the whole point of the row.
describe('verifyWebhook — the replay window is two-sided', () => {
  it('accepts a delivery inside the window', async () => {
    const event = await verifyWebhook(
      GOLDEN.body,
      GOLDEN.header,
      GOLDEN.secret,
      at(NOW + DEFAULT_TOLERANCE_SECONDS - 1),
    );
    expect(event.event).toBe('member.status');
  });

  it('refuses a stale delivery', async () => {
    await expectRejection(
      verifyWebhook(
        GOLDEN.body,
        GOLDEN.header,
        GOLDEN.secret,
        at(NOW + DEFAULT_TOLERANCE_SECONDS + 1),
      ),
      'timestamp_out_of_tolerance',
    );
  });

  it('refuses a FUTURE-dated delivery — the half a one-sided check misses', async () => {
    // A forged future timestamp would otherwise stay valid indefinitely, which
    // is exactly the replay hole the window exists to close.
    await expectRejection(
      verifyWebhook(
        GOLDEN.body,
        GOLDEN.header,
        GOLDEN.secret,
        at(NOW - DEFAULT_TOLERANCE_SECONDS - 1),
      ),
      'timestamp_out_of_tolerance',
    );
  });
});

// mutation-checked 2026-09-24: made the secrets loop `break` on the first
// candidate -> 1 red, the message names the rotation case.
describe('verifyWebhook — secret rotation', () => {
  it('accepts a delivery signed with the OLD secret when both are supplied', async () => {
    // The real scenario: a partner rotates in the dev portal, and deliveries
    // already queued keep arriving signed with the old secret for hours.
    const event = await verifyWebhook(
      GOLDEN.body,
      GOLDEN.header,
      ['whsec_the_brand_new_one', GOLDEN.secret],
      at(),
    );
    expect(event.event).toBe('member.status');
  });

  it('still refuses when none of the supplied secrets match', async () => {
    await expectRejection(
      verifyWebhook(GOLDEN.body, GOLDEN.header, ['nope', 'also-nope'], at()),
      'signature_mismatch',
    );
  });

  it('refuses when no usable secret is supplied at all', async () => {
    // Reported as its OWN reason, not as a mismatch: an unset env var is a
    // misconfiguration, and calling it a mismatch sends people hunting an
    // attacker. See the missing-secret block below.
    await expectRejection(
      verifyWebhook(GOLDEN.body, GOLDEN.header, [], at()),
      'no_secret_configured',
    );
    await expectRejection(
      verifyWebhook(GOLDEN.body, GOLDEN.header, '', at()),
      'no_secret_configured',
    );
  });
});

// mutation-checked 2026-09-24: added `reason` to a closed value check in
// assertKnownEventShape -> 1 red, the message names player_disconnected.
describe('verifyWebhook — forward compatibility', () => {
  it('verifies an event type this SDK does not model, and hands it back opaquely', async () => {
    const body = JSON.stringify({
      event: 'something.invented.later',
      eventId: 'evt_future',
      timestamp: '2026-09-24T12:00:00.000Z',
      data: { anything: ['at', 'all'] },
    });
    const event: VerifiedWebhookEvent = await verifyWebhook(
      body,
      sign(body, GOLDEN.secret, NOW),
      GOLDEN.secret,
      at(),
    );
    expect(event.event).toBe('something.invented.later');
    expect(event.data).toEqual({ anything: ['at', 'all'] });
  });

  it('accepts an unfamiliar VALUE inside a known event', async () => {
    // Not hypothetical: `connection.revoked` carried only `player_deleted`
    // until the OAuth branch added `player_disconnected`. A closed union here
    // would have broken every partner the day that merged.
    const body = JSON.stringify({
      event: 'connection.revoked',
      eventId: 'evt_revoked',
      timestamp: '2026-09-24T12:00:00.000Z',
      data: {
        memberId: 7204743,
        reason: 'player_disconnected',
        revokedAt: '2026-09-24T12:00:00.000Z',
      },
    });
    const event = await verifyWebhook(body, sign(body, GOLDEN.secret, NOW), GOLDEN.secret, at());
    if (!isConnectionRevokedEvent(event)) throw new Error('narrowing failed');
    expect(event.data.reason).toBe('player_disconnected');
  });

  it('accepts an unfamiliar vairProStatus rather than rejecting it', async () => {
    const body = GOLDEN.body.replace('"vairProStatus":null', '"vairProStatus":"SUSPENDED"');
    const event = await verifyWebhook(body, sign(body, GOLDEN.secret, NOW), GOLDEN.secret, at());
    if (!isMemberStatusEvent(event)) throw new Error('narrowing failed');
    expect(event.data.vairProStatus).toBe('SUSPENDED');
  });
});

// mutation-checked 2026-09-24: replaced the `bad('data.isVairPlus')` throw with
// `data.isVairPlus = false` -> 1 red, and the message names the field, which is
// the behaviour the row exists to protect.
describe('verifyWebhook — a signed but malformed event raises', () => {
  it('raises when an entitlement field is missing, rather than defaulting it', async () => {
    // Defaulting `isVairPlus` to false would deny entry to a member who paid,
    // silently, with nothing to trace. A loud failure is recoverable.
    const body = GOLDEN.body.replace('"isVairPlus":true,', '');
    const err = await expectRejection(
      verifyWebhook(body, sign(body, GOLDEN.secret, NOW), GOLDEN.secret, at()),
      'malformed_body',
    );
    expect(err.message).toContain('isVairPlus');
  });

  it('raises when a field is present but the wrong type', async () => {
    const body = GOLDEN.body.replace('"memberId":7204743', '"memberId":"7204743"');
    await expectRejection(
      verifyWebhook(body, sign(body, GOLDEN.secret, NOW), GOLDEN.secret, at()),
      'malformed_body',
    );
  });

  it('raises on a body that is not a webhook envelope', async () => {
    const body = JSON.stringify({ hello: 'world' });
    await expectRejection(
      verifyWebhook(body, sign(body, GOLDEN.secret, NOW), GOLDEN.secret, at()),
      'malformed_body',
    );
  });

  it('raises on a body that is not JSON at all', async () => {
    const body = 'not json';
    await expectRejection(
      verifyWebhook(body, sign(body, GOLDEN.secret, NOW), GOLDEN.secret, at()),
      'malformed_body',
    );
  });

  it('does NOT raise when only the optional sports key is absent', async () => {
    // The guard must distinguish "optional and absent" from "required and
    // missing" — the absent-vs-empty rule depends on this not being over-strict.
    const event = await verifyWebhook(GOLDEN.body, GOLDEN.header, GOLDEN.secret, at());
    expect(event.event).toBe('member.status');
  });
});

describe('verifyWebhook — a sports block when the scope WAS granted', () => {
  it('surfaces per-sport standing as a plain map', async () => {
    const withSports = GOLDEN.body.replace(
      '"vairProStatus":null',
      '"sports":{"pickleball":{"isVairPro":true,"isRater":true,"isVairProStatus":"ACTIVE"}},"vairProStatus":"ACTIVE"',
    );
    const event = await verifyWebhook(
      withSports,
      sign(withSports, GOLDEN.secret, NOW),
      GOLDEN.secret,
      at(),
    );
    if (!isMemberStatusEvent(event)) throw new Error('narrowing failed');
    expect(event.data.sports?.pickleball?.isVairPro).toBe(true);
    expect(event.data.sports?.padel).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Source-enforced rules. NOT mutation-checkable, and deliberately NOT
// marked as such: swapping a constant-time comparison for `===` returns the
// same value for every input, so no behavioural test can go red on it. These
// assert the source instead, which is the only thing that can.
// ---------------------------------------------------------------------------

describe('source discipline', () => {
  const srcDir = new URL('../src/', import.meta.url);

  async function readAllSources(): Promise<Array<[string, string]>> {
    const { readdir, readFile } = await import('node:fs/promises');
    const out: Array<[string, string]> = [];
    const walk = async (dir: URL, prefix: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          await walk(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`);
        } else if (entry.name.endsWith('.ts')) {
          out.push([`${prefix}${entry.name}`, await readFile(new URL(entry.name, dir), 'utf8')]);
        }
      }
    };
    await walk(srcDir, '');
    return out;
  }

  it('imports no Node builtins anywhere in src/', async () => {
    // The package advertises zero runtime dependencies and runs on every
    // runtime with Web Crypto. A single `node:` import silently ends that.
    const offenders = (await readAllSources())
      // The dynamic form is included deliberately: this very file uses
      // `await import('node:fs/promises')` twice, so a check that matched only
      // the static form would miss the exact shape its own author reached for.
      .filter(([, source]) =>
        /from\s+['"]node:|require\(\s*['"]node:|import\(\s*['"]node:/.test(source),
      )
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('never compares digests with === or !== in the verifier', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('webhooks/verify.ts', srcDir), 'utf8');
    // The comparison must happen inside `crypto.subtle.verify`, which is
    // constant-time. Any hand-rolled equality on a digest is the defect.
    expect(source).toContain('crypto.subtle.verify');
    // Comparing a digest-shaped name against `null`/`undefined` is a presence
    // check, not a timing-sensitive equality — the parser legitimately does
    // `signature === null`. What must never appear is a digest compared to
    // another value.
    expect(source).not.toMatch(
      /(signature|digest|computed|expected)\w*\s*[=!]==(?!\s*(?:null|undefined)\b)/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Failure paths the review found untested
// ---------------------------------------------------------------------------

// mutation-checked 2026-09-24 (CORRECTED after review): restored the old
// `JSON.parse(decode(bodyBytes))` -> 1 red, failing on `expected true to be
// false` -- the SWAPPED FIELD, which is the behaviour this row exists to
// protect. The first version of this marker claimed the same mutant named the
// swapped isVairPlus; it did not. The mutation was 1 byte longer, got
// truncated by the subarray, and died on invalid JSON without ever reaching
// the assertion. Re-run after making the swap equal-length and valid JSON.
describe('verifyWebhook — the delivered body is the VERIFIED body', () => {
  it('ignores a caller buffer mutated while verification is awaiting', async () => {
    // A server that recycles its read buffer can overwrite the body while we
    // are still inside WebCrypto. Verification must not bless the replacement.
    const good = GOLDEN.body;
    // Equal length AND valid JSON, so restoring the old live-buffer parse reds
    // on the SWAPPED FIELD rather than on a parse error. The first version of
    // this test was 1 byte longer, got truncated by the subarray, and the
    // mutant died on invalid JSON without ever exercising the assertion.
    const evil = good.replace('"isAmbassador":false', '"isAmbassador":true ');
    const enc = new TextEncoder();
    const buf = new Uint8Array(enc.encode(good));
    const evilBytes = enc.encode(evil);
    const pending = verifyWebhook(buf, GOLDEN.header, GOLDEN.secret, at());
    // Overwrite in place, byte-wise: the body is non-ASCII, so slicing by
    // characters would not line up with the buffer's byte length.
    buf.set(evilBytes.subarray(0, Math.min(evilBytes.length, buf.length)));
    const event = await pending;
    if (!isMemberStatusEvent(event)) throw new Error('narrowing failed');
    expect(event.data.isAmbassador).toBe(false);
  });
});

// mutation-checked 2026-09-24: deleted the Number.isFinite guard -> 2 red, and
// the stale-delivery case is accepted again, which is the whole finding.
describe('verifyWebhook — a non-finite window is refused, not ignored', () => {
  it('refuses a NaN tolerance instead of disabling the replay check', async () => {
    // `Number(process.env.UNSET)` is NaN, and every comparison against NaN is
    // false — so the naive version accepted a ten-year-old delivery.
    await expectRejection(
      verifyWebhook(GOLDEN.body, GOLDEN.header, GOLDEN.secret, {
        toleranceSeconds: Number(undefined),
      }),
      // `invalid_option`, not the clock reason: this is the caller's own
      // configuration, and reporting it as clock skew sends people hunting
      // drift on a healthy box.
      'invalid_option',
    );
  });

  it('refuses a negative tolerance and a NaN clock', async () => {
    await expectRejection(
      verifyWebhook(GOLDEN.body, GOLDEN.header, GOLDEN.secret, { toleranceSeconds: -1 }),
      'invalid_option',
    );
    await expectRejection(
      verifyWebhook(GOLDEN.body, GOLDEN.header, GOLDEN.secret, { nowSeconds: Number('x') }),
      'invalid_option',
    );
  });
});

// mutation-checked 2026-09-24: reverted to the bare `.filter()` on the raw
// argument -> 2 red with a TypeError instead of WebhookSignatureError, which
// is precisely the crash the row exists to stop.
describe('verifyWebhook — a missing secret is a refusal, not a crash', () => {
  it('reports an absent secret as no_secret_configured, never a TypeError', async () => {
    // `process.env.VAIR_WEBHOOK_SECRET!` with the variable unset lands here.
    const err = await expectRejection(
      // biome-ignore lint/suspicious/noExplicitAny: the whole point is the
      // untyped value a `!` assertion lets through at a real call site.
      verifyWebhook(GOLDEN.body, GOLDEN.header, undefined as any, at()),
      'no_secret_configured',
    );
    expect(err).toBeInstanceOf(WebhookSignatureError);
  });

  it('reports an all-undefined secret list the same way', async () => {
    const err = await expectRejection(
      verifyWebhook(GOLDEN.body, GOLDEN.header, [undefined, undefined], at()),
      'no_secret_configured',
    );
    expect(err).toBeInstanceOf(WebhookSignatureError);
  });

  it('distinguishes a missing secret from a wrong one', async () => {
    // The distinction the reason enum exists for: misconfiguration vs attack.
    const wrong = await expectRejection(
      verifyWebhook(GOLDEN.body, GOLDEN.header, 'not-the-secret', at()),
      'signature_mismatch',
    );
    expect(wrong.reason).not.toBe('no_secret_configured');
  });
});

describe('verifyWebhook — the exact tolerance boundary', () => {
  it('accepts a delivery exactly at the boundary, in both directions', async () => {
    // The cheapest parity anchor available: Python must agree on this second.
    for (const now of [NOW + DEFAULT_TOLERANCE_SECONDS, NOW - DEFAULT_TOLERANCE_SECONDS]) {
      const event = await verifyWebhook(GOLDEN.body, GOLDEN.header, GOLDEN.secret, at(now));
      expect(event.event).toBe('member.status');
    }
  });
});

describe('verifyWebhook — an oversized signature is refused cheaply', () => {
  it('refuses a v1 longer than a SHA-256 digest without decoding it', async () => {
    await expectRejection(
      verifyWebhook(
        GOLDEN.body,
        `t=${GOLDEN.timestamp},v1=${'a'.repeat(100_000)}`,
        GOLDEN.secret,
        at(),
      ),
      'malformed_signature',
    );
  });
});

// mutation-checked 2026-09-24: made `isRatingUpdatedEvent` compare against
// 'rating.update' (singular) -> 1 red, the message names the narrowing failure.
describe('verifyWebhook — all four event types are typed', () => {
  it('types rating.updated as the SNAPSHOT the backend actually sends', async () => {
    // Built from `rating-change-dispatcher.service.ts:414-423`, not from the
    // polling model. The previous version of this test asserted `newRating`,
    // a field the emitter has not sent since Vairified#899 — it validated a
    // fiction and would have stayed green through every real delivery.
    const body = JSON.stringify({
      event: 'rating.updated',
      eventId: 'evt_rating',
      timestamp: '2026-09-24T12:00:00.000Z',
      data: {
        memberId: 7204743,
        sports: {
          pickleball: { rating: 3.58236, abbr: 'VO', ratingSplits: {}, isVairPro: false },
        },
        changedAt: '2026-09-24T12:00:00.000Z',
        sequence: '40217',
      },
    });
    const event = await verifyWebhook(body, sign(body, GOLDEN.secret, NOW), GOLDEN.secret, at());
    if (!isRatingUpdatedEvent(event)) throw new Error('narrowing failed');
    expect(event.data.sports?.pickleball?.rating).toBe(3.58236);
    // Emitted on EVERY delivery, unlike member.status — a partner cannot
    // discard a stale snapshot without it.
    expect(event.data.sequence).toBe('40217');
    expect(event.data.ratingDataWithheld).toBeUndefined();
  });

  it('types the notification variant, where the ratings are withheld', async () => {
    // The cohort production has none of today: webhook access granted, rating
    // access declined. `sports` is ABSENT, not empty.
    const body = JSON.stringify({
      event: 'rating.updated',
      eventId: 'evt_rating_withheld',
      timestamp: '2026-09-24T12:00:00.000Z',
      data: {
        memberId: 7204743,
        changedAt: '2026-09-24T12:00:00.000Z',
        sequence: '40218',
        ratingDataWithheld: true,
      },
    });
    const event = await verifyWebhook(body, sign(body, GOLDEN.secret, NOW), GOLDEN.secret, at());
    if (!isRatingUpdatedEvent(event)) throw new Error('narrowing failed');
    expect(event.data.ratingDataWithheld).toBe(true);
    expect(event.data.sports).toBeUndefined();
    expect(event.data.sequence).toBe('40218');
  });

  // mutation-checked 2026-09-24: deleted the `data.sequence` check from
  // assertKnownEventShape -> 1 red, exactly this row. Before this was added the
  // rating.updated guard asserted a shape nothing validated.
  it('raises when a rating.updated is missing its ordering token', async () => {
    // Previously unvalidated: the guard asserted a shape nothing checked.
    const body = JSON.stringify({
      event: 'rating.updated',
      eventId: 'evt_no_seq',
      timestamp: '2026-09-24T12:00:00.000Z',
      data: { memberId: 7204743, changedAt: '2026-09-24T12:00:00.000Z' },
    });
    const err = await expectRejection(
      verifyWebhook(body, sign(body, GOLDEN.secret, NOW), GOLDEN.secret, at()),
      'malformed_body',
    );
    expect(err.message).toContain('sequence');
  });

  it('types event.created, and its numeric eventId is not the envelope id', async () => {
    const body = JSON.stringify({
      event: 'event.created',
      eventId: 'evt_envelope',
      timestamp: '2026-09-24T12:00:00.000Z',
      data: {
        eventId: 55123,
        name: 'Weekly League',
        type: 'LEAGUE',
        status: 'PUBLISHED',
        sport: 'pickleball',
        startDate: null,
        endDate: null,
        club: null,
        hostName: null,
        winScore: 11,
        winBy: 2,
        isPrivate: false,
        maxSpots: null,
        maxTeams: null,
        createdBy: null,
        createdAt: '2026-09-24T12:00:00.000Z',
      },
    });
    const event = await verifyWebhook(body, sign(body, GOLDEN.secret, NOW), GOLDEN.secret, at());
    if (!isEventCreatedEvent(event)) throw new Error('narrowing failed');
    // The shadowing pair: envelope id is the DELIVERY, data id is the EVENT.
    expect(event.eventId).toBe('evt_envelope');
    expect(event.data.eventId).toBe(55123);
  });
});

// ---------------------------------------------------------------------------
// Decisions taken at CP-2, where the two SDKs had disagreed
// ---------------------------------------------------------------------------

describe('verifyWebhook — decisions that align the two SDKs', () => {
  // mutation-checked 2026-09-24: restored the old `data.sports === null` branch
  // so null was refused -> 1 red, exactly this row.
  it('accepts an explicit null sports the same as an omitted key', async () => {
    // Proxies and serialisers normalise missing keys into nulls, and both forms
    // mean "no per-sport data here". Python accepted this already; this is the
    // one place the two SDKs disagreed.
    const body = GOLDEN.body.replace('"vairProStatus":null', '"sports":null,"vairProStatus":null');
    const event = await verifyWebhook(body, sign(body, GOLDEN.secret, NOW), GOLDEN.secret, at());
    if (!isMemberStatusEvent(event)) throw new Error('narrowing failed');
    expect(event.data.sports ?? undefined).toBeUndefined();
  });

  // mutation-checked 2026-09-24: removed the deepFreeze call -> 1 red, the
  // mutation below succeeds silently.
  it('hands back a genuinely immutable event, not just a readonly-typed one', async () => {
    // `readonly` is erased at runtime. Every other model in this SDK is frozen
    // and the Python models raise on assignment, so without this the same
    // promise means two different things in the two languages.
    const event = await verifyWebhook(GOLDEN.body, GOLDEN.header, GOLDEN.secret, at());
    if (!isMemberStatusEvent(event)) throw new Error('narrowing failed');
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.data)).toBe(true);
    const before = event.data.isVairPlus;
    try {
      (event.data as { isVairPlus: boolean }).isVairPlus = !before;
    } catch {
      /* strict mode throws; sloppy mode silently ignores. Either is fine. */
    }
    expect(event.data.isVairPlus).toBe(before);
  });

  it('still hands over a sport block with fields missing, rather than refusing', async () => {
    // A refusal is retried ~13 times over ~3.4h and then dropped, so the
    // member's status silently stops updating at that partner. Handing it over
    // costs them one absent field. Python matches this.
    const body = GOLDEN.body.replace(
      '"vairProStatus":null',
      '"sports":{"pickleball":{"isVairPro":true}},"vairProStatus":"ACTIVE"',
    );
    const event = await verifyWebhook(body, sign(body, GOLDEN.secret, NOW), GOLDEN.secret, at());
    if (!isMemberStatusEvent(event)) throw new Error('narrowing failed');
    expect(event.data.sports?.pickleball?.isVairPro).toBe(true);
  });
});

describe('verifyWebhook — what the skeptic pass found', () => {
  // mutation-checked 2026-09-24: removed `fatal: true` from the TextDecoder ->
  // 1 red; the invalid byte was silently replaced with U+FFFD and verification
  // succeeded on text that is not what the signed bytes said.
  it('refuses a body that is not valid UTF-8, rather than substituting characters', async () => {
    const good = new TextEncoder().encode(GOLDEN.body);
    const bad = new Uint8Array(good);
    bad[bad.length - 3] = 0xff; // inside the JSON, still signable
    const { createHmac } = await import('node:crypto');
    const prefix = new TextEncoder().encode(`${NOW}.`);
    const signed = new Uint8Array(prefix.length + bad.length);
    signed.set(prefix, 0);
    signed.set(bad, prefix.length);
    const header = `t=${NOW},v1=${createHmac('sha256', GOLDEN.secret).update(signed).digest('hex')}`;
    await expectRejection(verifyWebhook(bad, header, GOLDEN.secret, at()), 'malformed_body');
  });

  it('hands over an array where the per-sport map belongs, rather than refusing', async () => {
    // :rotating_light: A DELIBERATE TRADE-OFF, not an oversight.
    //
    // Some serialisers render an empty map as an empty array. We hand it over.
    // The cost is real: a partner who looks up a sport in an array gets
    // undefined and may conclude the member holds no certification there — a
    // wrong entitlement answer that looks legitimate. The reason we accept that
    // cost is the alternative: refusing means the delivery is retried ~13 times
    // over ~3.4h and then dropped, so the member's status silently stops
    // updating at that partner, permanently, for every delivery and not just
    // the odd one. One bad lookup beats a dead feed.
    //
    // Partners are told in the type docs to check the value is a map before
    // indexing it. That is the mitigation, and it is documented rather than
    // enforced on purpose.
    const body = GOLDEN.body.replace('"vairProStatus":null', '"sports":[],"vairProStatus":null');
    const event = await verifyWebhook(body, sign(body, GOLDEN.secret, NOW), GOLDEN.secret, at());
    if (!isMemberStatusEvent(event)) throw new Error('narrowing failed');
    expect(Array.isArray(event.data.sports)).toBe(true);
  });

  it('still hands over an odd nested sport value, matching Python', async () => {
    // The depth decision: top level only, in both SDKs.
    const body = GOLDEN.body.replace(
      '"vairProStatus":null',
      '"sports":{"pickleball":null},"vairProStatus":null',
    );
    const event = await verifyWebhook(body, sign(body, GOLDEN.secret, NOW), GOLDEN.secret, at());
    if (!isMemberStatusEvent(event)) throw new Error('narrowing failed');
    expect('pickleball' in (event.data.sports ?? {})).toBe(true);
  });
});

describe('sequence helpers — shipped instead of documented', () => {
  // mutation-checked 2026-09-24: made compareSequence compare the strings
  // directly instead of via BigInt -> 3 red -- every power-of-ten crossing.
  // The 40217/40218 pair SURVIVES, because a string compare is accidentally
  // right when the operands are the same length. That is precisely why the
  // original defect went unnoticed.
  it.each([
    ['9999999', '10000000'],
    ['999', '1000'],
    ['9', '10'],
    ['40217', '40218'],
  ])('orders %s before %s across a power-of-ten crossing', (older, newer) => {
    // The whole reason these exist: `'10000000' > '9999999'` is false, so a
    // partner following the old documented instruction would discard every
    // later delivery for that member, permanently.
    expect(isNewerSequence(newer, older)).toBe(true);
    expect(isNewerSequence(older, newer)).toBe(false);
    expect(compareSequence(newer, older)).toBeGreaterThan(0);
  });

  it('treats the first delivery for a member as newer', () => {
    expect(isNewerSequence('1')).toBe(true);
    expect(isNewerSequence('1', null)).toBe(true);
    expect(isNewerSequence('1', '')).toBe(true);
  });

  it('does not treat an identical sequence as newer', () => {
    expect(isNewerSequence('40217', '40217')).toBe(false);
    expect(compareSequence('40217', '40217')).toBe(0);
  });

  it('dedupes on the signed body id, not the forgeable header', async () => {
    const event = await verifyWebhook(GOLDEN.body, GOLDEN.header, GOLDEN.secret, at());
    expect(dedupeKey(event)).toBe('evt_0000000000000000000000000000abcd');
    expect(dedupeKey(event)).toBe(event.eventId);
  });
});
