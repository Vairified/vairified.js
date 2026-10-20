/**
 * {@link LeaderboardResource} — read-only leaderboard queries.
 *
 * @module
 */

import type { HttpTransport, QueryParams } from '../http.js';
import {
  LeaderboardCategoryInfo,
  type LeaderboardCategoryInfoWire,
} from '../models/leaderboard-category.js';
import type { LeaderboardOptions, PlayerRankOptions } from '../types.js';

/** Options that are accepted but never sent, each warned about once per process. */
const warnedDeprecations = new Set<string>();

function warnDeprecated(option: string, route: string): void {
  if (warnedDeprecations.has(option)) return;
  warnedDeprecations.add(option);
  console.warn(
    `[vairified] ${option} is deprecated and ignored: ${route} does not accept it ` +
      '(the API would refuse the request with a 400). It will be removed in a future release.',
  );
}

/**
 * Forget which deprecations were already logged — for tests only.
 *
 * @internal
 */
export function resetDeprecationWarnings(): void {
  warnedDeprecations.clear();
}

/**
 * Read-only leaderboard queries.
 *
 * Verified boards (`overall`, `gender`, `mixed`, `singles`) list only players
 * verified in the sport; the recreational boards (`recreational` / RD,
 * `recreational_singles` / RS) rank every player. Rank and percentile are
 * scoped to the sport.
 *
 * `list()` and `categories()` / `categoryList()` are public routes, but the
 * SDK always sends your key, and a key that is sent is checked: an invalid or
 * revoked key throws {@link AuthenticationError} (401), a key without
 * `leaderboard:read` throws {@link PermissionDeniedError} (403).
 *
 * @category Resources
 */
export class LeaderboardResource {
  readonly #http: HttpTransport;

  /** @internal */
  constructor(http: HttpTransport) {
    this.#http = http;
  }

  /**
   * Fetch a leaderboard page with optional filters. The query keys are exactly
   * the API's `LeaderboardQueryDto` fields — the API refuses any other key.
   */
  async list(options: LeaderboardOptions = {}): Promise<Record<string, unknown>> {
    if (options.clubId !== undefined)
      warnDeprecated('LeaderboardOptions.clubId', 'GET /leaderboard');
    const query: QueryParams = {
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
      sportCode: options.sportCode,
      category: options.category,
      ageBracket: options.ageBracket,
      scope: options.scope,
      state: options.state,
      city: options.city,
      gender: options.gender?.toUpperCase(),
      minGames: options.minGames,
      search: options.search,
      // Sent only when the caller sets it: true narrows to VAIRified players,
      // false or absent is no filter.
      verifiedOnly: options.verifiedOnly,
    };

    const data = await this.#http.request<Record<string, unknown> | undefined>({
      method: 'GET',
      path: '/leaderboard',
      query,
    });
    return data ?? {};
  }

  /**
   * Fetch a specific player's rank plus nearby players. The body keys are
   * exactly the API's `PlayerRankQueryDto` fields — the API refuses any other
   * key, which is why `contextSize` goes out as `context`.
   *
   * @param playerId The player's member id (canonical, e.g. `'4873327'`), their
   *   UUID, or `'@username'`. Anything else is a 404 ({@link NotFoundError}).
   */
  async rank(playerId: string, options: PlayerRankOptions = {}): Promise<Record<string, unknown>> {
    if (options.city !== undefined)
      warnDeprecated('PlayerRankOptions.city', 'POST /leaderboard/rank');
    if (options.clubId !== undefined) {
      warnDeprecated('PlayerRankOptions.clubId', 'POST /leaderboard/rank');
    }
    const body: Record<string, unknown> = {
      playerId,
      // 'overall' is the API's default track; the old 'doubles' code was retired.
      category: options.category ?? 'overall',
      ageBracket: options.ageBracket ?? 'open',
      scope: options.scope ?? 'global',
      context: options.contextSize ?? 5,
    };
    if (options.sportCode !== undefined) body.sportCode = options.sportCode;
    if (options.state !== undefined) body.state = options.state;

    const data = await this.#http.request<Record<string, unknown> | undefined>({
      method: 'POST',
      path: '/leaderboard/rank',
      body,
    });
    return data ?? {};
  }

  /**
   * List available leaderboard categories, brackets, scopes, and rating tiers
   * — the raw `GET /leaderboard/categories` body. For the categories as typed
   * models, use {@link categoryList}.
   */
  async categories(): Promise<Record<string, unknown>> {
    const data = await this.#http.request<Record<string, unknown> | undefined>({
      method: 'GET',
      path: '/leaderboard/categories',
    });
    return data ?? {};
  }

  /**
   * The leaderboard tracks as {@link LeaderboardCategoryInfo} models — code,
   * name, web label, and whether the board is verified-only.
   *
   * ```ts
   * for (const track of await client.leaderboard.categoryList()) {
   *   console.log(track.code, track.label, track.verifiedOnly); // 'singles' 'VS' true
   * }
   * ```
   */
  async categoryList(): Promise<readonly LeaderboardCategoryInfo[]> {
    const data = await this.categories();
    const entries = data.categories;
    if (!Array.isArray(entries)) return Object.freeze([]);
    return Object.freeze(
      entries.map((entry) => new LeaderboardCategoryInfo(entry as LeaderboardCategoryInfoWire)),
    );
  }
}
