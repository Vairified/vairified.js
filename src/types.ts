/**
 * Vairified SDK Types
 *
 * @module
 */

/**
 * Options for initializing the Vairified client.
 *
 * @category Types
 */
export interface VairifiedOptions {
  /** API key for authentication */
  apiKey?: string;
  /** Environment preset: "production" (default), "staging", "local" */
  env?: 'production' | 'staging' | 'local';
  /** Override API base URL. Takes precedence over env. */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * A single rating split with metadata.
 *
 * @category Types
 */
export interface RatingSplitData {
  /** The rating value (may be string from API) */
  rating: string | number;
  /** Abbreviation (e.g., "VG", "50+") */
  abbr: string;
  /** Date of last match in this category */
  date_played?: string;
}

/**
 * Rating splits from API - map of category to rating data.
 *
 * @category Types
 */
export type RatingSplitsData = Record<string, RatingSplitData | number>;

/**
 * Player data from getMember endpoint (requires OAuth connection).
 *
 * @category Types
 */
export interface MemberData {
  /** External player ID (vair_mem_xxx format) */
  id: string;
  firstName?: string;
  lastName?: string;
  /** Email (only if profile:email scope granted) */
  email?: string;
  rating?: number;
  isVairified?: boolean;
  ratingSplits?: RatingSplitsData;
  city?: string;
  state?: string;
  country?: string;
  /** Scopes the player granted to your app */
  grantedScopes?: string[];
}

/**
 * Player data from search endpoint (public, limited data).
 *
 * @category Types
 */
export interface PlayerSearchData {
  /** External player ID (vair_mem_xxx format) */
  id: string;
  /** Display name (First Name + Last Initial for privacy) */
  displayName: string;
  city?: string;
  state?: string;
  country?: string;
  rating?: number;
  isVairified?: boolean;
  /** Whether player has connected to your app */
  isConnected?: boolean;
}

/**
 * Legacy player search data format (for backward compatibility).
 *
 * @category Types
 * @deprecated Use PlayerSearchData instead
 */
export interface LegacyPlayerSearchData {
  memberId: string;
  memberLongname: string;
  age?: number;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  gender?: string;
  primaryRating?: number;
  vairified?: boolean;
  wheelchair?: boolean;
  ratingSplits?: RatingSplitsData;
}

/**
 * Filters for player search.
 *
 * @category Types
 */
export interface SearchFilters {
  /** Name search (partial match) */
  name?: string;
  /** City filter */
  city?: string;
  /** State code (e.g., "TX") */
  state?: string;
  /** Country code (e.g., "US") */
  country?: string;
  /** ZIP/postal code */
  zipCode?: string;
  /** Minimum rating (2.0-8.0) */
  ratingMin?: number;
  /** Maximum rating (2.0-8.0) */
  ratingMax?: number;
  /** Gender filter */
  gender?: 'MALE' | 'FEMALE';
  /** Only verified players */
  vairifiedOnly?: boolean;
  /** Exact age */
  age?: number;
  /** Minimum age */
  ageMin?: number;
  /** Maximum age */
  ageMax?: number;
  /** Field to sort by */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Page number (1-indexed) */
  page?: number;
  /** Results per page (max 100) */
  limit?: number;
}

/**
 * Match input for creating a Match.
 *
 * @category Types
 */
export interface MatchInput {
  /** Event/tournament name */
  event: string;
  /** Bracket/division name */
  bracket: string;
  /** Match date and time */
  date: Date | string;
  /** Team 1 player IDs (1 for singles, 2 for doubles) */
  team1: [string] | [string, string];
  /** Team 2 player IDs (1 for singles, 2 for doubles) */
  team2: [string] | [string, string];
  /** Game scores as [team1Score, team2Score] tuples */
  scores: [number, number][];
  /** Match type (default: "SIDEOUT") */
  matchType?: string;
  /** Match source (default: "PARTNER") */
  source?: string;
  /** Location (optional) */
  location?: string;
  /** Unique identifier (auto-generated if not provided) */
  identifier?: string;
}

/**
 * Match data as sent to API.
 *
 * @category Types
 */
export interface MatchApiData {
  identifier: string;
  bracket: string;
  event: string;
  format: 'SINGLES' | 'DOUBLES';
  matchDate: string;
  matchSource: string;
  matchType: string;
  location?: string;
  teamA: {
    player1: string;
    player2?: string;
    game1?: number;
    game2?: number;
    game3?: number;
    game4?: number;
    game5?: number;
  };
  teamB: {
    player1: string;
    player2?: string;
    game1?: number;
    game2?: number;
    game3?: number;
    game4?: number;
    game5?: number;
  };
}

/**
 * Response from match submission.
 *
 * @category Types
 */
export interface MatchResultData {
  /** Whether submission succeeded */
  success: boolean;
  /** Number of matches processed */
  numMatches: number;
  /** Total number of games recorded */
  numGames: number;
  /** Whether this was a dry-run (validation only) */
  dryRun?: boolean;
  /** Human-readable result message */
  message?: string;
  /** List of validation/processing errors */
  errors?: string[];
}

/**
 * Rating update from API.
 *
 * @category Types
 */
export interface RatingUpdateData {
  /** External player ID (vair_mem_xxx format) */
  id: string;
  memberName?: string;
  previousRating?: number;
  newRating?: number;
  changedAt?: string;
  ratingSplits?: RatingSplitsData;
}

/**
 * Search results from API.
 *
 * @category Types
 */
export interface SearchResultsData {
  players: (PlayerSearchData | LegacyPlayerSearchData)[];
  total: number;
  page: number;
  limit: number;
}

/**
 * API error response structure.
 *
 * @category Types
 */
export interface ApiErrorResponse {
  message: string;
  statusCode?: number;
  error?: string;
}
