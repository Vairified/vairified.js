/**
 * Vairified SDK — error hierarchy.
 *
 * All SDK errors inherit from {@link VairifiedError}, so a single
 * `catch (err: unknown) { if (err instanceof VairifiedError) ... }`
 * covers everything. HTTP-status-specific subclasses (auth, permission,
 * not found, rate limit, validation, service unavailable) are thrown
 * automatically by the HTTP layer.
 *
 * @module
 */

/**
 * Base class for every error thrown by the Vairified SDK.
 *
 * @category Errors
 */
export class VairifiedError extends Error {
  /** HTTP status code (if the error came from an API response). */
  readonly statusCode?: number;
  /** Raw response body parsed as JSON when available. */
  readonly response?: unknown;

  constructor(message: string, statusCode?: number, response?: unknown) {
    super(message);
    this.name = 'VairifiedError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

/**
 * Thrown on HTTP 429 responses. Carries the `Retry-After` header value
 * when the server provides one.
 *
 * @category Errors
 */
export class RateLimitError extends VairifiedError {
  /** Seconds to wait before retrying, or `undefined` if the server didn't say. */
  readonly retryAfter?: number;

  constructor(message = 'Rate limit exceeded', retryAfter?: number, response?: unknown) {
    super(message, 429, response);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Thrown on HTTP 503 — the API is temporarily refusing this request.
 * Carries the wait the server asked for, from the `Retry-After` header (or the
 * body's `retryAfter` when the header is missing).
 *
 * The SDK never retries on its own. A 503 is safe to retry later, but wait at
 * least {@link retryAfter} seconds first: retrying in a tight loop only adds
 * load to a service that has said it is not taking the request.
 *
 * @category Errors
 */
export class ServiceUnavailableError extends VairifiedError {
  /** Seconds to wait before retrying, or `undefined` if the server didn't say. */
  readonly retryAfter?: number;

  constructor(message = 'Service unavailable', retryAfter?: number, response?: unknown) {
    super(message, 503, response);
    this.name = 'ServiceUnavailableError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Thrown on HTTP 503 with code `SCORE_ENTRY_PAUSED`: Vairified has paused
 * score entry for a rating maintenance window. Only writes that create or
 * re-rate matches are refused (`matches.submit()`, `matches.tournamentImport()`);
 * reads keep working.
 *
 * Nothing was saved. Resubmit the same payload after {@link retryAfter}
 * seconds (the API currently asks for 300). The SDK does not retry for you.
 *
 * @category Errors
 */
export class ScoreEntryPausedError extends ServiceUnavailableError {
  /** The API's error code for this refusal. */
  readonly code = 'SCORE_ENTRY_PAUSED' as const;

  constructor(
    message = 'Score entry is paused for maintenance',
    retryAfter?: number,
    response?: unknown,
  ) {
    super(message, retryAfter, response);
    this.name = 'ScoreEntryPausedError';
  }
}

/**
 * Thrown on HTTP 401 — invalid or missing API key.
 *
 * @category Errors
 */
export class AuthenticationError extends VairifiedError {
  constructor(message = 'Invalid API key', response?: unknown) {
    super(message, 401, response);
    this.name = 'AuthenticationError';
  }
}

/**
 * Thrown on HTTP 403 — the API key is valid but not allowed to do this: it
 * lacks the scope the route needs (e.g. `leaderboard:read`), the player has
 * not connected to your app, or the key's IP allow-list refuses the caller.
 *
 * @category Errors
 */
export class PermissionDeniedError extends VairifiedError {
  constructor(message = 'Permission denied', response?: unknown) {
    super(message, 403, response);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Thrown on HTTP 404 — the resource doesn't exist.
 *
 * @category Errors
 */
export class NotFoundError extends VairifiedError {
  constructor(message = 'Resource not found', response?: unknown) {
    super(message, 404, response);
    this.name = 'NotFoundError';
  }
}

/**
 * Thrown on HTTP 400 — the server rejected the request payload.
 *
 * Inspect {@link VairifiedError.response} for field-level details.
 *
 * @category Errors
 */
export class ValidationError extends VairifiedError {
  constructor(message = 'Validation error', response?: unknown) {
    super(message, 400, response);
    this.name = 'ValidationError';
  }
}

/**
 * Thrown by {@link OAuthResource} methods when authorization, token
 * exchange, refresh, or revocation fails.
 *
 * @category Errors
 */
export class OAuthError extends VairifiedError {
  /**
   * OAuth error code such as `'invalid_grant'`, `'invalid_scope'`,
   * or `'expired_token'`. Check this to branch on the specific failure.
   */
  readonly errorCode?: string;

  constructor(message = 'OAuth error', errorCode?: string, response?: unknown) {
    super(message, undefined, response);
    this.name = 'OAuthError';
    this.errorCode = errorCode;
  }
}

/**
 * Why a webhook was refused. Lets a handler distinguish "someone is forging
 * requests" from "our clock drifted" without parsing an error message.
 *
 * @category Errors
 */
export type WebhookRejectionReason =
  /**
   * No usable signing secret was supplied to {@link verifyWebhook}.
   *
   * This is **your** configuration, not an attack — almost always an unset
   * environment variable. It is separate from {@link signature_mismatch} on
   * purpose: reporting a missing secret as a mismatch sends people hunting an
   * attacker when the fix is one env var.
   */
  | 'no_secret_configured'
  /**
   * A caller-supplied option was not usable — a non-finite tolerance, a
   * negative window, a non-finite clock.
   *
   * Separate from {@link timestamp_out_of_tolerance} deliberately: that one
   * means "this delivery's clock disagrees with yours", and reporting a typo in
   * your own configuration under it sends people hunting clock skew on a
   * healthy box. Same reasoning as {@link no_secret_configured}.
   */
  | 'invalid_option'
  /** No `X-Vairified-Signature` header at all. */
  | 'missing_signature'
  /** Present but unparseable, or missing its `t` / `v1` parts. */
  | 'malformed_signature'
  /** Outside the tolerance window, in either direction. */
  | 'timestamp_out_of_tolerance'
  /** Parsed fine; no supplied secret produces this digest. */
  | 'signature_mismatch'
  /** Verified, but the body is not JSON, or is not a webhook envelope. */
  | 'malformed_body';

/**
 * Thrown when a webhook delivery cannot be trusted.
 *
 * :rotating_light: **The message never contains the signing secret, the
 * received digest, or the computed one.** Writing either digest into an error
 * puts a valid HMAC of the partner's own payload into their application logs,
 * where it is an oracle for anyone who can read them. Use {@link reason} to
 * branch; there is deliberately nothing finer-grained to log.
 *
 * @category Errors
 */
export class WebhookSignatureError extends VairifiedError {
  readonly reason: WebhookRejectionReason;

  constructor(reason: WebhookRejectionReason, message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
    this.reason = reason;
  }
}
