/**
 * Vairified SDK — error hierarchy.
 *
 * All SDK errors inherit from {@link VairifiedError}, so a single
 * `catch (err: unknown) { if (err instanceof VairifiedError) ... }`
 * covers everything. HTTP-status-specific subclasses (auth, not found,
 * rate limit, validation) are thrown automatically by the HTTP layer.
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
