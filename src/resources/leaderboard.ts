/**
 * {@link LeaderboardResource} — read-only leaderboard queries.
 *
 * @module
 */

import type { HttpTransport, QueryParams } from '../http.js';
import type { LeaderboardOptions, PlayerRankOptions } from '../types.js';

/**
 * Read-only leaderboard queries.
 *
 * @category Resources
 */
export class LeaderboardResource {
  readonly #http: HttpTransport;

  /** @internal */
  constructor(http: HttpTransport) {
    this.#http = http;
  }

  /** Fetch a leaderboard page with optional filters. */
  async list(options: LeaderboardOptions = {}): Promise<Record<string, unknown>> {
    const query: QueryParams = {
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
      category: options.category,
      ageBracket: options.ageBracket,
      scope: options.scope,
      state: options.state,
      city: options.city,
      clubId: options.clubId,
      gender: options.gender?.toUpperCase(),
      minGames: options.minGames,
      search: options.search,
      verifiedOnly: options.verifiedOnly === true ? true : undefined,
    };

    const data = await this.#http.request<Record<string, unknown> | undefined>({
      method: 'GET',
      path: '/leaderboard',
      query,
    });
    return data ?? {};
  }

  /** Fetch a specific player's rank plus nearby players. */
  async rank(playerId: string, options: PlayerRankOptions = {}): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      playerId,
      category: options.category ?? 'doubles',
      ageBracket: options.ageBracket ?? 'open',
      scope: options.scope ?? 'global',
      contextSize: options.contextSize ?? 5,
    };
    if (options.state !== undefined) body.state = options.state;
    if (options.city !== undefined) body.city = options.city;
    if (options.clubId !== undefined) body.clubId = options.clubId;

    const data = await this.#http.request<Record<string, unknown> | undefined>({
      method: 'POST',
      path: '/leaderboard/rank',
      body,
    });
    return data ?? {};
  }

  /** List available leaderboard categories, brackets, and scopes. */
  async categories(): Promise<Record<string, unknown>> {
    const data = await this.#http.request<Record<string, unknown> | undefined>({
      method: 'GET',
      path: '/leaderboard/categories',
    });
    return data ?? {};
  }
}
