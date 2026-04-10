/**
 * HTTP transport — internal. Not part of the public API.
 *
 * The transport is a thin wrapper around native `fetch` that:
 *
 * - Injects the API key header on every request.
 * - Serializes query params (dropping `undefined`) and JSON bodies.
 * - Applies a request timeout via `AbortController`.
 * - Maps non-2xx responses to the right typed exception.
 *
 * @internal
 * @module
 */

import {
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  VairifiedError,
  ValidationError,
} from './errors.js';
import type { ApiErrorResponse } from './types.js';

/**
 * Values accepted as query parameters.
 *
 * `null` and `undefined` are silently dropped. Arrays are joined with
 * `','`. Everything else is stringified.
 *
 * @internal
 */
export type QueryParams = Readonly<
  Record<string, string | number | boolean | readonly (string | number)[] | null | undefined>
>;

/**
 * Options passed to the internal HTTP layer.
 *
 * @internal
 */
export interface RequestOptions {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly query?: QueryParams;
  readonly body?: unknown;
}

/**
 * Transport configuration.
 *
 * @internal
 */
export interface TransportConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly timeoutMs: number;
  readonly fetch: typeof fetch;
}

/**
 * Internal HTTP client. Holds no state between requests — each call
 * builds a fresh `Request`, runs it, and returns the parsed body.
 *
 * @internal
 */
export class HttpTransport {
  readonly #config: TransportConfig;

  constructor(config: TransportConfig) {
    this.#config = config;
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const url = buildUrl(this.#config.baseUrl, options.path, options.query);

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new Error(`Request timed out after ${this.#config.timeoutMs}ms`)),
      this.#config.timeoutMs,
    );

    const headers: Record<string, string> = {
      'X-API-Key': this.#config.apiKey,
      Accept: 'application/json',
    };

    const init: RequestInit = {
      method: options.method,
      headers,
      signal: controller.signal,
    };

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await this.#config.fetch(url, init);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      await throwFromResponse(response);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T;
    }

    const text = await response.text();
    if (text.length === 0) {
      return undefined as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new VairifiedError(`Unable to parse response as JSON: ${text}`, response.status);
    }
  }
}

/**
 * Build a full URL from a base and relative path, appending query params.
 *
 * @internal
 */
export function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(cleanBase + cleanPath);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined) continue;
      if (Array.isArray(value)) {
        if (value.length === 0) continue;
        url.searchParams.set(key, value.join(','));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

/**
 * Parse an error response and throw the right typed exception.
 *
 * @internal
 */
async function throwFromResponse(response: Response): Promise<never> {
  const status = response.status;
  const text = await response.text().catch(() => '');

  let body: ApiErrorResponse | unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  let message: string;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const apiBody = body as ApiErrorResponse;
    message = apiBody.message || apiBody.error || text || `HTTP ${status}`;
  } else {
    message = text || `HTTP ${status}`;
  }

  switch (status) {
    case 400:
      throw new ValidationError(message, body);
    case 401:
      throw new AuthenticationError(message, body);
    case 404:
      throw new NotFoundError(message, body);
    case 429: {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfter = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : undefined;
      throw new RateLimitError(message, Number.isFinite(retryAfter) ? retryAfter : undefined, body);
    }
    default:
      throw new VairifiedError(message, status, body);
  }
}
