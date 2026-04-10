/**
 * {@link Vairified} — the main entry point of the SDK.
 *
 * @module
 */

import { HttpTransport } from './http.js';
import {
  LeaderboardResource,
  MatchesResource,
  MembersResource,
  OAuthResource,
} from './resources/index.js';
import type { VairifiedEnvironment, VairifiedOptions } from './types.js';

/**
 * Environment preset → base URL mapping.
 *
 * Partners can switch between production, staging, and local development
 * without memorizing hostnames.
 *
 * @category Client
 */
export const ENVIRONMENTS: Readonly<Record<VairifiedEnvironment, string>> = Object.freeze({
  production: 'https://api-next.vairified.com/api/v1',
  staging: 'https://api-staging.vairified.com/api/v1',
  local: 'http://localhost:3001/api/v1',
});

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Async client for the Vairified Partner API.
 *
 * The client is organized around sub-resources that mirror the REST
 * structure — {@link members}, {@link matches}, {@link oauth},
 * {@link leaderboard}. Each sub-resource is a thin wrapper around the
 * HTTP transport on this object.
 *
 * ## Lifecycle
 *
 * The client holds no persistent connections itself — it's safe to
 * create one per request if you want. But for typical usage, wrap it
 * in `await using` so resources are cleaned up deterministically:
 *
 * ```ts
 * await using client = new Vairified({ apiKey: 'vair_pk_xxx' });
 *
 * const member = await client.members.get('vair_mem_xxx');
 * console.log(member.name, member.ratingFor('pickleball'));
 *
 * for await (const m of client.members.search({ city: 'Austin' })) {
 *   console.log(m.name);
 * }
 * ```
 *
 * `await using` requires TypeScript 5.2+ and Node 20+. If you can't
 * use it, just call `await client.close()` manually when you're done.
 *
 * @category Client
 */
export class Vairified {
  /** The resolved API key this client is using. */
  readonly apiKey: string;
  /** The resolved base URL (production, staging, local, or custom). */
  readonly baseUrl: string;
  /** The resolved environment name. */
  readonly env: VairifiedEnvironment;
  /** Request timeout in milliseconds. */
  readonly timeoutMs: number;

  /** Member operations — get, search, find, ratingUpdates. */
  readonly members: MembersResource;
  /** Match submission — submit, testWebhook. */
  readonly matches: MatchesResource;
  /** OAuth flow — authorize, exchangeToken, refresh, revoke. */
  readonly oauth: OAuthResource;
  /** Leaderboard queries — list, rank, categories. */
  readonly leaderboard: LeaderboardResource;

  readonly #transport: HttpTransport;

  constructor(options: VairifiedOptions = {}) {
    const apiKey = options.apiKey ?? process.env.VAIRIFIED_API_KEY ?? '';
    if (apiKey.length === 0) {
      throw new Error('API key required. Pass { apiKey } or set VAIRIFIED_API_KEY.');
    }
    this.apiKey = apiKey;

    if (options.baseUrl) {
      this.baseUrl = options.baseUrl.replace(/\/+$/, '');
      this.env = options.env ?? 'production';
    } else {
      const envName = (options.env ??
        (process.env.VAIRIFIED_ENV as VairifiedEnvironment | undefined) ??
        'production') as VairifiedEnvironment;
      if (options.env && !(envName in ENVIRONMENTS)) {
        throw new Error(
          `Unknown environment: ${envName}. Use one of: ${Object.keys(ENVIRONMENTS).join(', ')}`,
        );
      }
      this.env = envName;
      this.baseUrl = ENVIRONMENTS[envName] ?? ENVIRONMENTS.production;
    }

    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    this.#transport = new HttpTransport({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      timeoutMs: this.timeoutMs,
      fetch: options.fetch ?? fetch,
    });

    this.members = new MembersResource(this.#transport);
    this.matches = new MatchesResource(this.#transport);
    this.oauth = new OAuthResource(this.#transport);
    this.leaderboard = new LeaderboardResource(this.#transport);
  }

  /**
   * API usage statistics for the current API key.
   *
   * Returns rate-limit status, request counts, and quota usage.
   */
  async usage(): Promise<Record<string, unknown>> {
    const data = await this.#transport.request<Record<string, unknown> | undefined>({
      method: 'GET',
      path: '/partner/usage',
    });
    return data ?? {};
  }

  /**
   * Release any resources held by the client.
   *
   * The current transport is stateless, so this is a no-op today, but
   * partners should still call it (or use `await using`) so the SDK
   * can add connection pooling later without breaking them.
   */
  async close(): Promise<void> {
    // Nothing to release today. Kept as an explicit hook so future
    // transports (keep-alive, HTTP/2) can release their pools.
  }

  /**
   * Explicit resource management hook — enables
   * `await using client = new Vairified({ ... })` (TypeScript 5.2+).
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  /** Compact summary for console output. */
  toString(): string {
    return `Vairified { env: '${this.env}', baseUrl: '${this.baseUrl}' }`;
  }
}
