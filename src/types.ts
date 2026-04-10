/**
 * Vairified SDK — Partner API v1 wire types.
 *
 * These are the raw shapes the server returns or accepts. Request
 * types (e.g. {@link MatchBatch}, {@link SearchFilters}) are used as-is
 * by the SDK. Response types (e.g. {@link PartnerMemberWire}) are
 * wrapped in class instances by the SDK — see the `models/` folder.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Client options
// ---------------------------------------------------------------------------

/**
 * Environment preset for the Vairified API.
 *
 * @category Client
 */
export type VairifiedEnvironment = 'production' | 'staging' | 'local';

/**
 * Options passed to the {@link Vairified} constructor.
 *
 * @category Client
 */
export interface VairifiedOptions {
  /** Partner API key (`vair_pk_...`). Falls back to `VAIRIFIED_API_KEY`. */
  apiKey?: string;
  /** Environment preset. Falls back to `VAIRIFIED_ENV` or `'production'`. */
  env?: VairifiedEnvironment;
  /** Explicit base URL. Takes precedence over `env`. */
  baseUrl?: string;
  /** Request timeout in milliseconds. Defaults to 30_000 (30s). */
  timeoutMs?: number;
  /**
   * Inject a custom `fetch` implementation. Defaults to the global
   * `fetch`. Useful for test shims or non-Node environments.
   */
  fetch?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Normalized gender tokens emitted by the Partner API.
 *
 * @category Members
 */
export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';

// ---------------------------------------------------------------------------
// Rating data
// ---------------------------------------------------------------------------

/**
 * Raw rating split — one slice of a player's rating for a specific
 * category × age bracket.
 *
 * @category Members
 */
export interface RatingSplitWire {
  readonly rating: number;
  readonly abbr: string;
}

/**
 * Raw sport rating — a player's ratings for one sport.
 *
 * @category Members
 */
export interface SportRatingWire {
  readonly rating: number;
  readonly abbr: string;
  readonly ratingSplits: Readonly<Record<string, RatingSplitWire>>;
}

// ---------------------------------------------------------------------------
// Member
// ---------------------------------------------------------------------------

/**
 * Grouped member status flags.
 *
 * @category Members
 */
export interface MemberStatusWire {
  readonly isVairified: boolean;
  readonly isWheelchair: boolean;
  readonly isAmbassador: boolean;
  readonly isRater: boolean;
  readonly isConnected: boolean;
}

/**
 * Raw partner-facing member record returned by the Partner API.
 *
 * @category Members
 */
export interface PartnerMemberWire {
  readonly memberId: number;
  readonly id?: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  readonly displayName: string;
  readonly age?: number;
  readonly city?: string;
  readonly state?: string;
  readonly zip?: string;
  readonly country?: string;
  readonly gender?: Gender;
  readonly status: MemberStatusWire;
  readonly sport?: Readonly<Record<string, SportRatingWire>>;
  readonly activeLeagues?: readonly string[];
  readonly email?: string;
  readonly grantedScopes?: readonly string[];
}

// ---------------------------------------------------------------------------
// Rating updates
// ---------------------------------------------------------------------------

/**
 * Raw rating change notification.
 *
 * @category Members
 */
export interface PartnerRatingUpdateWire {
  readonly memberId: number;
  readonly id?: string;
  readonly displayName?: string;
  readonly sport?: string;
  readonly previousRating?: number;
  readonly newRating?: number;
  readonly changedAt?: string;
  readonly ratingSplits?: Readonly<Record<string, RatingSplitWire>>;
}

// ---------------------------------------------------------------------------
// Search filters (request)
// ---------------------------------------------------------------------------

/**
 * Filters accepted by {@link MembersResource.search}.
 *
 * Most callers pass these as keyword arguments directly to `search()`;
 * the SDK serializes them to query parameters for you.
 *
 * @category Members
 */
export interface SearchFilters {
  /** Sport code (e.g. `'pickleball'`) or list of codes. */
  sport?: string | readonly string[];
  /** Partial name match (first or last). */
  name?: string;
  /** Exact numeric member ID. */
  memberId?: number | string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
  location?: string;
  gender?: Gender | Lowercase<Gender>;
  /** When `true`, only return verified players. */
  vairifiedOnly?: boolean;
  /** When `true`, only return wheelchair players. */
  wheelchair?: boolean;
  /** Lower rating bound (2.0–8.0). */
  ratingMin?: number;
  /** Upper rating bound (2.0–8.0). */
  ratingMax?: number;
  /** Exact age. */
  age?: number;
  /** Lower age bound. */
  ageMin?: number;
  /** Upper age bound. */
  ageMax?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  /** Page size requested per HTTP request (server cap 100). Default 20. */
  pageSize?: number;
  /**
   * Maximum total results to iterate. When set, the async iterator
   * stops after yielding this many items, regardless of page count.
   */
  maxResults?: number;
}

// ---------------------------------------------------------------------------
// Match submission (request)
// ---------------------------------------------------------------------------

/**
 * One scored game within a {@link MatchInput}.
 *
 * `scores` contains one integer per team, in the same order as the
 * parent match's `teams` list. For a standard 2-team game that's
 * `[team1Score, team2Score]`. Longer lists are supported for
 * n-team matches.
 *
 * All other fields override the parent match's defaults for this
 * specific game (e.g. a championship game played to 15 when the rest
 * of the match was to 11).
 *
 * @category Matches
 */
export interface GameInput {
  readonly scores: readonly number[];
  readonly identifier?: string;
  readonly winScore?: number;
  readonly winBy?: number;
}

/**
 * One match to submit in a {@link MatchBatch}.
 *
 * A match is n-team × n-game:
 *
 * - `teams: [['p1', 'p2'], ['p3', 'p4']]` — standard doubles
 * - `teams: [['p1'], ['p2']]` — singles
 * - `teams: [['p1'], ['p2'], ['p3']]` — 3-way round robin
 *
 * Scores in each {@link GameInput} are parallel to the `teams` order.
 *
 * @category Matches
 */
export interface MatchInput {
  readonly identifier: string;
  readonly teams: readonly (readonly string[])[];
  readonly games: readonly GameInput[];

  // Optional per-match overrides of batch-level defaults
  readonly sport?: string;
  readonly bracket?: string;
  readonly event?: string;
  readonly location?: string;
  readonly matchDate?: string;
  readonly matchSource?: string;
  readonly matchType?: string;
  readonly winScore?: number;
  readonly winBy?: number;
  readonly extras?: Readonly<Record<string, unknown>>;
  readonly originalId?: string;
  readonly originalType?: string;
  readonly clubId?: number;
}

/**
 * Compressed bulk match submission.
 *
 * Top-level fields are defaults applied to every match in the
 * {@link matches} list. Any match can override any field. `sport`,
 * `winScore`, and `winBy` are **required** at the batch level — partners
 * must tell the rater which sport the matches are in and what the
 * winning conditions were so scores can be interpreted correctly.
 *
 * @category Matches
 */
export interface MatchBatch {
  readonly sport: string;
  readonly winScore: number;
  readonly winBy: number;
  readonly matches: readonly MatchInput[];

  // Optional batch-level defaults inherited by every match
  readonly bracket?: string;
  readonly event?: string;
  readonly location?: string;
  readonly matchDate?: string;
  readonly matchSource?: string;
  readonly matchType?: string;
  readonly extras?: Readonly<Record<string, unknown>>;
  readonly identifier?: string;
  readonly originalId?: string;
  readonly originalType?: string;
  readonly clubId?: number;
  readonly dryRun?: boolean;
}

// ---------------------------------------------------------------------------
// Match submission — response
// ---------------------------------------------------------------------------

/**
 * Raw result from a batch submission.
 *
 * @category Matches
 */
export interface MatchBatchResultWire {
  readonly success: boolean;
  readonly numMatches: number;
  readonly numGames: number;
  readonly dryRun?: boolean;
  readonly message?: string;
  readonly errors?: readonly string[];
}

// ---------------------------------------------------------------------------
// Leaderboards
// ---------------------------------------------------------------------------

/**
 * Filters for {@link LeaderboardResource.list}.
 *
 * @category Leaderboards
 */
export interface LeaderboardOptions {
  readonly category?: string;
  readonly ageBracket?: string;
  readonly scope?: string;
  readonly state?: string;
  readonly city?: string;
  readonly clubId?: string;
  readonly gender?: Gender | Lowercase<Gender>;
  readonly verifiedOnly?: boolean;
  readonly minGames?: number;
  readonly limit?: number;
  readonly offset?: number;
  readonly search?: string;
}

/**
 * Options for {@link LeaderboardResource.rank}.
 *
 * @category Leaderboards
 */
export interface PlayerRankOptions {
  readonly category?: string;
  readonly ageBracket?: string;
  readonly scope?: string;
  readonly state?: string;
  readonly city?: string;
  readonly clubId?: string;
  /** Number of players on either side of the target. Default 5. */
  readonly contextSize?: number;
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/**
 * Error envelope commonly returned by the Partner API on non-2xx status.
 *
 * @category Errors
 */
export interface ApiErrorResponse {
  readonly message?: string;
  readonly error?: string;
  readonly statusCode?: number;
}
