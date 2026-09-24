/**
 * Webhook signature verification.
 *
 * Standalone on purpose — a webhook receiver is an inbound HTTP handler. It
 * usually holds no API key, may never call the Partner API, and should not
 * have to construct a client just to check a signature.
 *
 * @module
 */

import { WebhookSignatureError } from '../errors.js';
import type {
  ConnectionRevokedEventWire,
  EventCreatedEventWire,
  MemberStatusEventWire,
  RatingUpdatedEventWire,
  VerifiedWebhookEvent,
} from '../types.js';

/**
 * How far apart the delivery's timestamp and your clock may be, in seconds.
 *
 * Five minutes, matching the scheme this signature format follows. The window
 * is what stops a captured delivery being replayed indefinitely — without it a
 * valid signature stays valid forever.
 */
export const DEFAULT_TOLERANCE_SECONDS = 300;

const SIGNATURE_HEADER = 'X-Vairified-Signature';

/** Options for {@link verifyWebhook}. */
export interface VerifyWebhookOptions {
  /**
   * Clock-skew allowance in seconds. Applied in **both** directions: a
   * delivery dated too far in the future is refused exactly as a stale one is.
   * A one-sided check would accept a forged future timestamp forever, which is
   * the replay hole the window exists to close.
   *
   * @defaultValue {@link DEFAULT_TOLERANCE_SECONDS}
   */
  toleranceSeconds?: number;

  /**
   * Current time in **seconds** since the epoch. Injectable for tests; you
   * should not need it in production.
   */
  nowSeconds?: number;
}

const encoder = new TextEncoder();

function toBytes(body: string | Uint8Array): Uint8Array {
  return typeof body === 'string' ? encoder.encode(body) : body;
}

/**
 * Parse `t=…,v1=…` into its parts.
 *
 * Deliberately tolerant of shape and strict about content: pairs may arrive in
 * any order and unknown keys are ignored, so adding a `v2=` later cannot break
 * a receiver built today. What is *not* tolerated is a missing `t` or `v1` —
 * those are the signature.
 */
function parseSignatureHeader(header: string): {
  timestamp: number;
  /**
   * The `t` value exactly as transmitted. The HMAC is built from THIS, not
   * from the re-stringified number: `t=01758700000` and `t=1758700000` are
   * different bytes, and signing the normalised form would let both verify
   * against one digest. No exploit is known today — the window check and the
   * HMAC read the same value either way — but it is a split between "what was
   * checked" and "what was signed", and the moment anything starts reading the
   * raw `t` it becomes live.
   */
  rawTimestamp: string;
  signature: string;
} {
  let timestamp: number | null = null;
  let rawTimestamp: string | null = null;
  let signature: string | null = null;

  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't' && timestamp === null) {
      // Reject anything that is not a plain integer. `Number()` would happily
      // accept '1e9', ' 12 ' and '0x10'.
      if (!/^\d+$/.test(value)) {
        throw new WebhookSignatureError(
          'malformed_signature',
          `${SIGNATURE_HEADER} carried a timestamp that is not an integer`,
        );
      }
      timestamp = Number(value);
      rawTimestamp = value;
    } else if (key === 'v1' && signature === null) {
      signature = value;
    }
  }

  if (timestamp === null || rawTimestamp === null || signature === null) {
    throw new WebhookSignatureError(
      'malformed_signature',
      `${SIGNATURE_HEADER} must carry both a 't' and a 'v1' part`,
    );
  }
  return { timestamp, rawTimestamp, signature };
}

/**
 * Decode a hex digest to bytes.
 *
 * Case-insensitive by construction. The API emits lowercase today, and a
 * case-sensitive string comparison would be correct right up until it wasn't.
 */
// The `<ArrayBuffer>` argument is load-bearing, not decoration: a bare
// `Uint8Array` widens to `Uint8Array<ArrayBufferLike>`, which WebCrypto's
// `BufferSource` rejects because a SharedArrayBuffer-backed view could be
// mutated by another thread mid-verify.
/** A SHA-256 digest is 32 bytes; nothing longer can ever match one. */
const MAX_SIGNATURE_HEX = 64;

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  // Length-capped before the regex and the allocation. Without it an attacker
  // who knows the webhook URL can make us decode a multi-megabyte `v1` on
  // every request — bounded in practice only by the HTTP server's header
  // limit, which a partner is free to raise.
  if (hex.length > MAX_SIGNATURE_HEX) {
    throw new WebhookSignatureError(
      'malformed_signature',
      `${SIGNATURE_HEADER} carried a 'v1' value longer than a SHA-256 digest`,
    );
  }
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new WebhookSignatureError(
      'malformed_signature',
      `${SIGNATURE_HEADER} carried a 'v1' value that is not a hex digest`,
    );
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function assertEnvelope(value: unknown): asserts value is VerifiedWebhookEvent {
  if (typeof value !== 'object' || value === null) {
    throw new WebhookSignatureError('malformed_body', 'The webhook body is not a JSON object');
  }
  const o = value as Record<string, unknown>;
  for (const field of ['event', 'eventId', 'timestamp'] as const) {
    if (typeof o[field] !== 'string') {
      throw new WebhookSignatureError(
        'malformed_body',
        `The webhook body is missing a string '${field}'`,
      );
    }
  }
}

/**
 * Validate the shape of the events this SDK models richly.
 *
 * :rotating_light: **Checks presence and type. Never a VALUE.** An unfamiliar
 * `vairProStatus`, `reason` or any other enum-shaped string must pass — those
 * sets grow on the API's schedule, not this package's, and rejecting a new one
 * would break a live handler for a change that is not a break. What is checked
 * is that a field the caller will read is actually there and is the type they
 * will read it as.
 *
 * The alternative — filling a missing field with a default — is worse than
 * throwing here. These fields gate entitlement: a missing `isVairPlus` quietly
 * read as `false` denies entry to a member who paid, and nobody ever traces it.
 */
function assertKnownEventShape(event: VerifiedWebhookEvent): void {
  const bad = (field: string): never => {
    throw new WebhookSignatureError(
      'malformed_body',
      `A '${event.event}' event is missing a valid '${field}'`,
    );
  };

  if (event.event === 'member.status') {
    const d = event.data as Record<string, unknown> | undefined;
    if (typeof d !== 'object' || d === null) bad('data');
    const data = d as Record<string, unknown>;
    if (typeof data.memberId !== 'number') bad('data.memberId');
    if (typeof data.isVairPlus !== 'boolean') bad('data.isVairPlus');
    if (typeof data.isAmbassador !== 'boolean') bad('data.isAmbassador');
    if (typeof data.changedAt !== 'string') bad('data.changedAt');
    if (typeof data.vairifiedRatingStatus !== 'string') bad('data.vairifiedRatingStatus');
    if (data.vairProStatus !== null && typeof data.vairProStatus !== 'string') {
      bad('data.vairProStatus');
    }
    // `sports` is OPTIONAL and its absence is meaningful — "we were not
    // permitted to tell you", which is not the same claim as "holds no
    // certifications". It is never defaulted to `{}` here, and must not be.
    if (data.sports !== undefined && (typeof data.sports !== 'object' || data.sports === null)) {
      bad('data.sports');
    }
  } else if (event.event === 'connection.revoked') {
    const d = event.data as Record<string, unknown> | undefined;
    if (typeof d !== 'object' || d === null) bad('data');
    const data = d as Record<string, unknown>;
    if (typeof data.reason !== 'string') bad('data.reason');
    if (typeof data.revokedAt !== 'string') bad('data.revokedAt');
  } else if (event.event === 'rating.updated') {
    const d = event.data as Record<string, unknown> | undefined;
    if (typeof d !== 'object' || d === null) bad('data');
    const data = d as Record<string, unknown>;
    if (typeof data.memberId !== 'number') bad('data.memberId');
    if (typeof data.changedAt !== 'string') bad('data.changedAt');
    // Emitted on EVERY rating.updated delivery, on both variants — unlike
    // `member.status`, where it is declared and not yet sent. A partner cannot
    // discard a stale snapshot without it, so a missing one is a real defect.
    if (typeof data.sequence !== 'string') bad('data.sequence');
    // Absent on the notification variant (no `user:rating:read`), so optional —
    // but present must mean an object, or the caller's sport lookup throws.
    if (data.sports !== undefined && (typeof data.sports !== 'object' || data.sports === null)) {
      bad('data.sports');
    }
  } else if (event.event === 'event.created') {
    const d = event.data as Record<string, unknown> | undefined;
    if (typeof d !== 'object' || d === null) bad('data');
    const data = d as Record<string, unknown>;
    // NOT the envelope's string `eventId` — this one is the event's public
    // number. They shadow each other by name and share nothing else, so a
    // caller that confuses them gets a silent type error without this check.
    if (typeof data.eventId !== 'number') bad('data.eventId');
    if (typeof data.name !== 'string') bad('data.name');
    if (typeof data.sport !== 'string') bad('data.sport');
    if (typeof data.createdAt !== 'string') bad('data.createdAt');
  }
}

/**
 * Verify a webhook delivery and return it typed.
 *
 * @param rawBody - The **exact bytes** of the request body. This is the part
 *   people get wrong: the signature covers what was sent, so a body that has
 *   been parsed and re-serialised (`express.json()`, FastAPI's parsed body)
 *   produces different bytes and every signature fails. Capture the raw body.
 * @param signatureHeader - The `X-Vairified-Signature` header value.
 * @param secret - Your webhook signing secret, or **several**. Pass both the
 *   old and the new around a rotation: deliveries already queued were signed
 *   with the old secret and keep arriving for hours afterwards, so a verifier
 *   that knows only the new one discards them.
 * @param options - See {@link VerifyWebhookOptions}.
 * @returns The verified event. Narrow on `event` to reach the typed members.
 * @throws {@link WebhookSignatureError} for every refusal; read `reason`.
 *
 * @remarks
 * :rotating_light: **Deduplicate on the BODY's `eventId`, never on the
 * `X-Vairified-Event-Id` header.** Delivery is at-least-once, so a retry can
 * present the same event twice — but that header is **outside the signature**.
 * An attacker who captures one delivery can replay it inside the tolerance
 * window with a fresh header value, and header-based deduplication will let it
 * through every time. The body's `eventId` is covered by the HMAC; the header
 * is a convenience for routing, not an identity you can trust.
 *
 * Replay inside the window is otherwise unprevented by design: the timestamp
 * tolerance is the only replay control this function applies, so your own
 * deduplication is what stops a captured delivery being applied twice.
 *
 * :rotating_light: **`await` it.** It is async because it uses Web Crypto, which
 * has no synchronous HMAC. Forgetting the `await` on a *valid* signature hands
 * your code a Promise whose `.data` is `undefined` — an entitlement check then
 * reads falsy and denies a member who paid, silently. On an *invalid* one it is
 * an unhandled rejection, which on Node >=24 exits the process. This function
 * never returns a boolean, precisely so that mistake cannot be quiet.
 *
 * @example
 * ```ts
 * import { verifyWebhook, isMemberStatusEvent, WebhookSignatureError } from 'vairified';
 *
 * app.post('/hooks/vair', express.raw({ type: 'application/json' }), async (req, res) => {
 *   try {
 *     const event = await verifyWebhook(
 *       req.body,                                  // a Buffer — the raw bytes
 *       req.header('X-Vairified-Signature') ?? '',
 *       [process.env.VAIR_WEBHOOK_SECRET, process.env.VAIR_WEBHOOK_SECRET_PREVIOUS],
 *     );
 *     // Narrow with the exported guards — `event.event === '…'` cannot narrow
 *     // while the unknown-event fallback is part of the union.
 *     if (isMemberStatusEvent(event)) {
 *       console.log(event.data.memberId, event.data.isVairPlus);
 *     }
 *     res.sendStatus(204);
 *   } catch (err) {
 *     if (err instanceof WebhookSignatureError) return res.sendStatus(400);
 *     throw err;
 *   }
 * });
 * ```
 *
 * @category Webhooks
 */
export async function verifyWebhook(
  rawBody: string | Uint8Array,
  signatureHeader: string | null | undefined,
  // Deliberately tolerant of `undefined` entries rather than demanding
  // `string`: in practice this is fed straight from `process.env`, and forcing
  // a `!` at the call site is what turned an unset variable into a crash
  // instead of a refusal. Absent values are filtered and reported as
  // `no_secret_configured`.
  secret: string | undefined | null | readonly (string | undefined | null)[],
  options: VerifyWebhookOptions = {},
): Promise<VerifiedWebhookEvent> {
  // Validated BEFORE anything else, and never allowed to escape as a
  // `TypeError`. The common single-secret call is
  // `verifyWebhook(body, sig, process.env.VAIR_WEBHOOK_SECRET!)`; with that
  // variable unset the `!` is a lie and `undefined` arrives here. Reaching
  // `.filter` on it threw a raw TypeError, which this function's own
  // documented handler rethrows — an unhandled rejection, and on Node >=24 a
  // process exit, reachable by anyone who can POST to the endpoint.
  const candidates = typeof secret === 'string' ? [secret] : Array.isArray(secret) ? secret : [];
  // `trim()` first: a whitespace-only secret passes a bare length check and is
  // then reported as a signature mismatch, i.e. as an attack, when it is a
  // misconfiguration.
  const secrets = candidates.filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0,
  );
  if (secrets.length === 0) {
    throw new WebhookSignatureError(
      'no_secret_configured',
      'No usable signing secret was supplied',
    );
  }

  if (!signatureHeader) {
    throw new WebhookSignatureError(
      'missing_signature',
      `No ${SIGNATURE_HEADER} header was supplied`,
    );
  }

  // A non-finite window disables the check entirely, because every comparison
  // against NaN is false. `Number(process.env.SOMETHING_UNSET)` is NaN, so the
  // obvious way to make the tolerance configurable silently removes replay
  // protection and nothing warns. Refuse instead of falling back to a default:
  // a caller who passed a bad value should find out, not be quietly corrected.
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new WebhookSignatureError(
      'invalid_option',
      'toleranceSeconds must be a finite, non-negative number',
    );
  }
  if (!Number.isFinite(now)) {
    throw new WebhookSignatureError('invalid_option', 'nowSeconds must be a finite number');
  }

  const { timestamp, rawTimestamp, signature } = parseSignatureHeader(signatureHeader);

  // Window check BEFORE the hex decode: it is the cheap test, and doing it
  // first means a garbage `v1` never reaches an allocation.
  // Two-sided — a future-dated delivery is as refused as a stale one.
  if (Math.abs(now - timestamp) > tolerance) {
    throw new WebhookSignatureError(
      'timestamp_out_of_tolerance',
      `The delivery timestamp is outside the ${tolerance}s tolerance`,
    );
  }

  const signatureBytes = hexToBytes(signature);

  const bodyBytes = toBytes(rawBody);
  const prefix = encoder.encode(`${rawTimestamp}.`);
  const signed = new Uint8Array(prefix.length + bodyBytes.length);
  signed.set(prefix, 0);
  signed.set(bodyBytes, prefix.length);

  // `crypto.subtle.verify` does the comparison inside the primitive, so there
  // is no digest equality check to get wrong. WebCrypto rather than
  // `node:crypto` because this package imports no Node builtins and runs on
  // every runtime with a Web Crypto implementation.
  let matched = false;
  for (const candidate of secrets) {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(candidate),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    // Deliberately no early exit: every supplied secret is tried.
    matched = (await crypto.subtle.verify('HMAC', key, signatureBytes, signed)) || matched;
  }

  if (!matched) {
    throw new WebhookSignatureError(
      'signature_mismatch',
      'The webhook signature did not match any supplied secret',
    );
  }

  // :rotating_light: Parse the bytes that were SIGNED, not the caller's buffer.
  //
  // `signed` is a private copy taken before any `await`; `bodyBytes` may be a
  // live view into the caller's memory. Two awaits happen above, so a server
  // that recycles its read buffer — uWebSockets.js documents that its
  // ArrayBuffer is only valid for the duration of the callback — can have the
  // arena reused while we are still verifying. Decoding `bodyBytes` here meant
  // verifying one payload and handing back another: measured, a signature
  // verified over `isVairPlus:true` returned `isVairPlus:false` and a
  // different member. A verifier that returns unsigned data is not a verifier.
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(signed.subarray(prefix.length)));
  } catch {
    throw new WebhookSignatureError('malformed_body', 'The webhook body is not valid JSON');
  }

  assertEnvelope(parsed);
  assertKnownEventShape(parsed);
  return parsed;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------
//
// `VerifiedWebhookEvent` cannot discriminate on `event` alone, and that is not
// an oversight in the union — it is unavoidable while a catch-all is a member.
// `UnknownWebhookEventWire.event` is `string`, which is comparable to every
// literal, so it survives `e.event === 'member.status'` and collapses `data`
// to `unknown`. A branded discriminant was measured and does not help either.
//
// So narrowing is done with guards. The alternative — telling partners to cast
// — would publish an unchecked cast on webhook data as the documented pattern,
// which is exactly what the malformed-event guard exists to make unnecessary.

/**
 * Narrow a verified event to `member.status`.
 *
 * @example
 * ```ts
 * const event = await verifyWebhook(rawBody, header, secret);
 * if (isMemberStatusEvent(event)) {
 *   // `event.data` is fully typed here.
 *   if (!event.data.isVairPlus) denyEntry(event.data.memberId);
 * }
 * ```
 *
 * @category Webhooks
 */
export function isMemberStatusEvent(event: VerifiedWebhookEvent): event is MemberStatusEventWire {
  return event.event === 'member.status';
}

/**
 * Narrow a verified event to `connection.revoked`.
 *
 * :warning: `data.reason` is an open set — `player_deleted` and
 * `player_disconnected` today, more later. Never branch on it exhaustively.
 *
 * @category Webhooks
 */
export function isConnectionRevokedEvent(
  event: VerifiedWebhookEvent,
): event is ConnectionRevokedEventWire {
  return event.event === 'connection.revoked';
}

/**
 * Narrow a verified event to `rating.updated` — the event that makes up
 * almost all real traffic.
 *
 * `data` is the same shape {@link MembersResource.ratingUpdates} returns when
 * polling, so one handler can serve both paths.
 *
 * @category Webhooks
 */
export function isRatingUpdatedEvent(event: VerifiedWebhookEvent): event is RatingUpdatedEventWire {
  return event.event === 'rating.updated';
}

/**
 * Narrow a verified event to `event.created`.
 *
 * :warning: `data.eventId` is a **number** and is not the envelope's string
 * `eventId`. Deduplicate on the envelope's; refer to the event by `data`'s.
 *
 * @category Webhooks
 */
export function isEventCreatedEvent(event: VerifiedWebhookEvent): event is EventCreatedEventWire {
  return event.event === 'event.created';
}
