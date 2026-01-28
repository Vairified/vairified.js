/**
 * Vairified SDK Errors
 *
 * @module
 */

/**
 * Base error class for Vairified SDK errors.
 *
 * @category Errors
 */
export class VairifiedError extends Error {
  /** HTTP status code */
  statusCode?: number;
  /** Response body */
  response?: unknown;

  constructor(message: string, statusCode?: number, response?: unknown) {
    super(message);
    this.name = 'VairifiedError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

/**
 * Error thrown when API rate limit is exceeded.
 *
 * @category Errors
 */
export class RateLimitError extends VairifiedError {
  /** Seconds to wait before retrying */
  retryAfter?: number;

  constructor(message = 'Rate limit exceeded', retryAfter?: number, response?: unknown) {
    super(message, 429, response);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Error thrown when API key is invalid or missing.
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
 * Error thrown when a requested resource is not found.
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
 * Error thrown when request validation fails.
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
 * Error thrown when an OAuth operation fails.
 *
 * This can occur during authorization, token exchange, refresh, or revocation.
 *
 * @category Errors
 */
export class OAuthError extends VairifiedError {
  /** OAuth error code (e.g., 'invalid_grant', 'expired_token') */
  errorCode?: string;

  constructor(message = 'OAuth error', errorCode?: string, response?: unknown) {
    super(message, undefined, response);
    this.name = 'OAuthError';
    this.errorCode = errorCode;
  }
}
