/**
 * Vairified SDK Client
 *
 * Main client for the Vairified Partner API.
 *
 * @module
 */

import {
  AuthenticationError,
  NotFoundError,
  OAuthError,
  RateLimitError,
  VairifiedError,
  ValidationError,
} from './errors.js';
import {
  type Match,
  MatchResult,
  Member,
  type Player,
  RatingUpdate,
  SearchResults,
} from './models.js';
import type { AuthorizationResponse, OAuthScope, TokenResponse } from './oauth.js';
import { DEFAULT_SCOPES, SCOPES } from './oauth.js';
import type {
  ApiErrorResponse,
  MatchResultData,
  MemberData,
  PlayerSearchData,
  RatingUpdateData,
  SearchFilters,
  SearchResultsData,
  VairifiedOptions,
} from './types.js';

// Environment URLs
// Note: "production" points to current active API
const ENVIRONMENTS = {
  production: 'https://api-next.vairified.com/api/v1',
  staging: 'https://api-staging.vairified.com/api/v1',
  local: 'http://localhost:3001/api/v1',
} as const;

/**
 * Available environment presets for the Vairified client.
 *
 * @category Client
 */
export type VairifiedEnvironment = keyof typeof ENVIRONMENTS;

const DEFAULT_BASE_URL = ENVIRONMENTS.production;
const DEFAULT_TIMEOUT = 30000;

/**
 * Client for the Vairified Partner API.
 *
 * @category Client
 *
 * @example
 * ```ts
 * const client = new Vairified({ apiKey: 'vair_pk_xxx' });
 *
 * // Get a member
 * const member = await client.getMember('user_123');
 * console.log(member.name, member.rating);
 *
 * // Search for players
 * const results = await client.search({ city: 'Austin', ratingMin: 4.0 });
 * for (const player of results) {
 *   console.log(player.name, player.rating);
 * }
 *
 * // Submit a match (doubles: 11-9, 11-7)
 * const match = new Match({
 *   event: 'Weekly League',
 *   bracket: '4.0 Doubles',
 *   date: new Date(),
 *   team1: ['p1', 'p2'],
 *   team2: ['p3', 'p4'],
 *   scores: [[11, 9], [11, 7]],
 * });
 * const result = await client.submitMatch(match);
 * if (result.ok) {
 *   console.log(`Submitted ${result.numGames} games`);
 * }
 * ```
 *
 * @remarks
 * If your API key has the "dry-run" scope, match submissions will be
 * validated but not persisted. This is useful for testing integrations.
 */
export class Vairified {
  /** API key */
  readonly apiKey: string;
  /** Base URL */
  readonly baseUrl: string;
  /** Environment name */
  readonly env: VairifiedEnvironment;
  /** Request timeout in ms */
  readonly timeout: number;

  constructor(options: VairifiedOptions = {}) {
    this.apiKey = options.apiKey || this.getEnvApiKey();
    if (!this.apiKey) {
      throw new Error('API key required. Pass apiKey option or set VAIRIFIED_API_KEY env var.');
    }

    // Resolve base URL from env or explicit baseUrl
    if (options.baseUrl) {
      this.baseUrl = options.baseUrl.replace(/\/$/, '');
      this.env = 'production';
    } else if (options.env) {
      this.baseUrl = ENVIRONMENTS[options.env];
      this.env = options.env;
    } else {
      // Default to VAIRIFIED_ENV or 'production'
      const envVar = this.getEnvVar('VAIRIFIED_ENV') as VairifiedEnvironment | undefined;
      const defaultEnv: VairifiedEnvironment =
        envVar && envVar in ENVIRONMENTS ? envVar : 'production';
      this.baseUrl = ENVIRONMENTS[defaultEnv] || DEFAULT_BASE_URL;
      this.env = defaultEnv;
    }

    this.timeout = options.timeout || DEFAULT_TIMEOUT;
  }

  private getEnvVar(name: string): string {
    if (typeof process !== 'undefined' && process.env?.[name]) {
      return process.env[name] as string;
    }
    return '';
  }

  private getEnvApiKey(): string {
    return this.getEnvVar('VAIRIFIED_API_KEY');
  }

  private getHeaders(): Record<string, string> {
    return {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private async handleError(response: Response): Promise<never> {
    let body: ApiErrorResponse | undefined;
    let message: string;

    try {
      body = (await response.json()) as ApiErrorResponse;
      message = body.message || response.statusText;
    } catch {
      message = response.statusText;
    }

    const status = response.status;

    if (status === 401) throw new AuthenticationError(message, body);
    if (status === 404) throw new NotFoundError(message, body);
    if (status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new RateLimitError(
        message,
        retryAfter ? Number.parseInt(retryAfter, 10) : undefined,
        body,
      );
    }
    if (status === 400) throw new ValidationError(message, body);

    throw new VairifiedError(message, status, body);
  }

  private async request<T>(
    method: string,
    path: string,
    options?: { params?: Record<string, string | number | boolean>; body?: unknown },
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;

    if (options?.params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) url += `?${queryString}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: this.getHeaders(),
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) await this.handleError(response);

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ---------------------------------------------------------------------------
  // Member Operations
  // ---------------------------------------------------------------------------

  /**
   * Get a connected member by their external ID.
   *
   * **Requires OAuth Connection**: The player must have connected their
   * account to your application via OAuth before you can access their data.
   *
   * @param playerId - External player ID (vair_mem_xxx format)
   * @returns Member object with profile and rating data
   * @throws NotFoundError if member is not found or invalid ID format
   * @throws ForbiddenError if player has not connected to your app
   *
   * @example
   * ```ts
   * const member = await client.getMember('vair_mem_0ABC123def456GHI789jk');
   * console.log(member.name, member.rating);
   * console.log(member.ratingSplits.open); // Open division rating
   * console.log(member.grantedScopes); // ['profile:read', 'rating:read']
   * ```
   */
  async getMember(playerId: string): Promise<Member> {
    const data = await this.request<MemberData>('GET', '/partner/member', {
      params: { id: playerId },
    });
    return new Member(data, this);
  }

  // ---------------------------------------------------------------------------
  // Search Operations
  // ---------------------------------------------------------------------------

  /**
   * Search for players.
   *
   * @param filters - Search filters
   * @returns SearchResults with players and pagination
   *
   * @example
   * ```ts
   * const results = await client.search({
   *   city: 'Austin',
   *   ratingMin: 4.0,
   *   vairifiedOnly: true,
   * });
   *
   * for (const player of results) {
   *   console.log(player.name, player.rating);
   * }
   *
   * // Pagination
   * if (results.hasMore) {
   *   const nextPage = await results.nextPage();
   * }
   * ```
   */
  async search(filters: SearchFilters = {}): Promise<SearchResults> {
    const params: Record<string, string | number | boolean> = {
      limit: filters.limit ?? 20,
    };

    if (filters.name) params.member = filters.name;
    if (filters.city) params.city = filters.city;
    if (filters.state) params.state = filters.state;
    if (filters.country) params.country = filters.country;
    if (filters.zipCode) params.zip = filters.zipCode;
    if (filters.ratingMin !== undefined) params.rating1 = filters.ratingMin;
    if (filters.ratingMax !== undefined) params.rating2 = filters.ratingMax;
    if (filters.gender) params.gender = filters.gender;
    if (filters.vairifiedOnly) params.vairified = true;
    if (filters.sortBy) {
      params.sortField = filters.sortBy;
      params.sortDirection = filters.sortOrder ?? 'desc';
    }

    // Age handling
    if (filters.age !== undefined) {
      params.ageFilterType = 'exact';
      params.age1 = filters.age;
    } else if (filters.ageMin !== undefined && filters.ageMax !== undefined) {
      params.ageFilterType = 'range';
      params.age1 = filters.ageMin;
      params.age2 = filters.ageMax;
    } else if (filters.ageMin !== undefined) {
      params.ageFilterType = 'above';
      params.age1 = filters.ageMin;
    } else if (filters.ageMax !== undefined) {
      params.ageFilterType = 'below';
      params.age1 = filters.ageMax;
    }

    // Pagination
    const page = filters.page ?? 1;
    if (page > 1) {
      params.offset = (page - 1) * (filters.limit ?? 20);
    }

    const data = await this.request<SearchResultsData | PlayerSearchData[]>(
      'GET',
      '/partner/search',
      {
        params,
      },
    );

    // Handle both array and object responses
    const normalized: SearchResultsData = Array.isArray(data)
      ? { players: data, total: data.length, page, limit: filters.limit ?? 20 }
      : data;

    return new SearchResults(normalized, this, filters);
  }

  /**
   * Find a single player by name.
   *
   * @param name - Player name to search for
   * @returns Player if found, undefined otherwise
   *
   * @example
   * ```ts
   * const player = await client.findPlayer('John Smith');
   * if (player) {
   *   console.log(player.rating);
   * }
   * ```
   */
  async findPlayer(name: string): Promise<Player | undefined> {
    const results = await this.search({ name, limit: 1 });
    return results.at(0);
  }

  // ---------------------------------------------------------------------------
  // Match Operations
  // ---------------------------------------------------------------------------

  /**
   * Submit a single match.
   *
   * @param match - Match object with teams and scores
   * @returns MatchResult with submission status
   *
   * @example
   * ```ts
   * const match = new Match({
   *   event: 'Weekly League',
   *   bracket: '4.0 Doubles',
   *   date: new Date(),
   *   team1: ['p1', 'p2'],
   *   team2: ['p3', 'p4'],
   *   scores: [[11, 9], [11, 7]],
   * });
   *
   * const result = await client.submitMatch(match);
   * if (result.ok) {
   *   console.log(`Submitted ${result.numGames} games`);
   * }
   * ```
   */
  async submitMatch(match: Match): Promise<MatchResult> {
    return this.submitMatches([match]);
  }

  /**
   * Submit multiple matches in a batch.
   *
   * @param matches - List of Match objects
   * @returns MatchResult with submission status
   *
   * @example
   * ```ts
   * const result = await client.submitMatches([match1, match2, match3]);
   * console.log(`Submitted ${result.numGames} games from ${result.numMatches} matches`);
   *
   * if (result.dryRun) {
   *   console.log('This was a dry run - no data persisted');
   * }
   * ```
   */
  async submitMatches(matches: Match[]): Promise<MatchResult> {
    const data = await this.request<MatchResultData>('POST', '/partner/matches', {
      body: { matches: matches.map((m) => m.toJSON()) },
    });
    return new MatchResult(data);
  }

  // ---------------------------------------------------------------------------
  // Rating Updates
  // ---------------------------------------------------------------------------

  /**
   * Get rating updates for subscribed members.
   *
   * Members are subscribed when you call getMember().
   *
   * @returns List of RatingUpdate objects
   *
   * @example
   * ```ts
   * const updates = await client.getRatingUpdates();
   * for (const update of updates) {
   *   console.log(`${update.memberId}: ${update.previousRating} → ${update.newRating}`);
   *   if (update.improved) {
   *     const member = await update.getMember();
   *     console.log(`${member.name} improved!`);
   *   }
   * }
   * ```
   */
  async getRatingUpdates(): Promise<RatingUpdate[]> {
    const data = await this.request<{ updates: RatingUpdateData[] }>(
      'GET',
      '/partner/rating-updates',
    );
    return (data.updates ?? []).map((u) => new RatingUpdate(u, this));
  }

  /**
   * Test webhook endpoint.
   *
   * @param webhookUrl - URL to send test webhook to
   * @returns Test result
   */
  async testWebhook(webhookUrl: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('POST', '/partner/webhook-test', {
      body: { webhookUrl },
    });
  }

  // ---------------------------------------------------------------------------
  // OAuth Operations
  // ---------------------------------------------------------------------------

  /**
   * Start an OAuth authorization flow.
   *
   * This creates a pending authorization and returns the URL where
   * users should be redirected to approve access.
   *
   * @param redirectUri - Your application's callback URL
   * @param scopes - Permission scopes to request (defaults to profile:read, rating:read)
   * @param state - CSRF protection state parameter (recommended)
   * @returns AuthorizationResponse with the URL to redirect users to
   * @throws OAuthError if the authorization fails to start
   *
   * @example
   * ```ts
   * const auth = await client.startOAuth(
   *   'https://myapp.com/callback',
   *   ['profile:read', 'rating:read', 'match:submit'],
   *   'random_csrf_token',
   * );
   * // Redirect user to auth.authorizationUrl
   * window.location.href = auth.authorizationUrl;
   * ```
   *
   * @category OAuth
   */
  async startOAuth(
    redirectUri: string,
    scopes: OAuthScope[] = [...DEFAULT_SCOPES],
    state?: string,
  ): Promise<AuthorizationResponse> {
    // Ensure profile:read is always included
    const scopeSet = new Set(scopes);
    scopeSet.add('profile:read');
    const scopeList = Array.from(scopeSet);

    // Validate scopes
    for (const scope of scopeList) {
      if (!(scope in SCOPES)) {
        throw new OAuthError(`Invalid scope: ${scope}`, 'invalid_scope');
      }
    }

    const data = await this.request<{
      authorizationUrl: string;
      code: string;
    }>('POST', '/partner/oauth/authorize', {
      body: {
        redirectUri,
        scope: scopeList.join(','),
        state,
      },
    });

    return {
      authorizationUrl: data.authorizationUrl,
      code: data.code,
      state,
    };
  }

  /**
   * Exchange an authorization code for access and refresh tokens.
   *
   * Call this after the user approves access and is redirected back
   * to your application with a code parameter.
   *
   * @param code - Authorization code from the callback URL
   * @param redirectUri - Must match the redirectUri used in startOAuth
   * @returns TokenResponse with access_token, refresh_token, and player_id
   * @throws OAuthError if the code is invalid or expired
   *
   * @example
   * ```ts
   * // After user is redirected to: https://myapp.com/callback?code=xxx
   * const tokens = await client.exchangeToken(
   *   new URL(window.location.href).searchParams.get('code')!,
   *   'https://myapp.com/callback',
   * );
   * // Store tokens.accessToken and tokens.refreshToken securely
   * // Use tokens.playerId to identify the connected player
   * ```
   *
   * @category OAuth
   */
  async exchangeToken(code: string, redirectUri: string): Promise<TokenResponse> {
    const data = await this.request<{
      accessToken: string;
      refreshToken?: string;
      expiresIn: number;
      scope: string;
      playerId: string;
    }>('POST', '/partner/oauth/token', {
      body: { code, redirectUri },
    });

    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn,
      scope: data.scope ? data.scope.split(',') : [],
      playerId: data.playerId,
    };
  }

  /**
   * Refresh an expired access token.
   *
   * Use this when an access token expires to obtain a new one
   * without requiring the user to re-authorize.
   *
   * @param refreshToken - The refresh token from a previous token exchange
   * @returns TokenResponse with new access_token and optionally a new refresh_token
   * @throws OAuthError if the refresh token is invalid or revoked
   *
   * @example
   * ```ts
   * try {
   *   const newTokens = await client.refreshAccessToken(storedRefreshToken);
   *   // Update stored tokens
   * } catch (e) {
   *   if (e instanceof OAuthError && e.errorCode === 'invalid_grant') {
   *     // Refresh token revoked, user needs to re-authorize
   *   }
   * }
   * ```
   *
   * @category OAuth
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    const data = await this.request<{
      accessToken: string;
      refreshToken?: string;
      expiresIn: number;
      scope: string;
      playerId: string;
    }>('POST', '/partner/oauth/refresh', {
      body: { refreshToken },
    });

    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn,
      scope: data.scope ? data.scope.split(',') : [],
      playerId: data.playerId,
    };
  }

  /**
   * Revoke a player's OAuth connection.
   *
   * This disconnects the player from your application. You will no
   * longer be able to access their data or submit matches on their behalf.
   *
   * @param playerId - The player's external ID (vair_mem_xxx format)
   * @throws OAuthError if the revocation fails
   *
   * @example
   * ```ts
   * await client.revokeConnection('vair_mem_0ABC123def456GHI789jk');
   * // Player is now disconnected
   * ```
   *
   * @category OAuth
   */
  async revokeConnection(playerId: string): Promise<void> {
    await this.request<{ success: boolean }>('POST', '/partner/oauth/revoke', {
      body: { playerId },
    });
  }

  /**
   * Get a list of available OAuth scopes.
   *
   * @returns List of scope objects with id, name, and description
   *
   * @example
   * ```ts
   * const scopes = await client.getAvailableScopes();
   * for (const scope of scopes) {
   *   console.log(`${scope.id}: ${scope.description}`);
   * }
   * ```
   *
   * @category OAuth
   */
  async getAvailableScopes(): Promise<Array<{ id: string; name: string; description: string }>> {
    const data = await this.request<{
      scopes: Array<{ id: string; name: string; description: string }>;
    }>('GET', '/partner/oauth/scopes');
    return data.scopes ?? [];
  }

  /**
   * Get API usage statistics for your partner account.
   *
   * @returns Usage statistics (requests, limits, etc.)
   *
   * @example
   * ```ts
   * const usage = await client.getUsage();
   * console.log(`Requests today: ${usage.requestsToday}`);
   * console.log(`Rate limit: ${usage.rateLimit}/hour`);
   * ```
   *
   * @category Client
   */
  async getUsage(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('GET', '/partner/usage');
  }

  // ---------------------------------------------------------------------------
  // Leaderboard Operations
  // ---------------------------------------------------------------------------

  /**
   * Get leaderboard data with filtering options.
   *
   * **Requires API Key Scope:** `leaderboard:read` or `read`
   *
   * @param options - Leaderboard filter options
   * @returns Leaderboard response with players and stats
   *
   * @example
   * ```ts
   * // Get global doubles leaderboard
   * const leaderboard = await client.getLeaderboard();
   *
   * // Get state-level singles leaderboard
   * const txLeaderboard = await client.getLeaderboard({
   *   category: 'singles',
   *   scope: 'state',
   *   state: 'TX',
   * });
   *
   * // Get 50+ age bracket
   * const seniorLeaderboard = await client.getLeaderboard({
   *   ageBracket: '50+',
   *   verifiedOnly: true,
   * });
   *
   * for (const player of leaderboard.players) {
   *   console.log(`#${player.rank} ${player.displayName}: ${player.rating}`);
   * }
   * ```
   *
   * @category Leaderboard
   */
  async getLeaderboard(options: LeaderboardOptions = {}): Promise<LeaderboardResponse> {
    const params: Record<string, string | number | boolean> = {};

    if (options.category) params.category = options.category;
    if (options.ageBracket) params.ageBracket = options.ageBracket;
    if (options.scope) params.scope = options.scope;
    if (options.state) params.state = options.state;
    if (options.city) params.city = options.city;
    if (options.clubId) params.clubId = options.clubId;
    if (options.gender) params.gender = options.gender;
    if (options.verifiedOnly) params.verifiedOnly = true;
    if (options.minGames !== undefined) params.minGames = options.minGames;
    if (options.limit !== undefined) params.limit = options.limit;
    if (options.offset !== undefined) params.offset = options.offset;
    if (options.search) params.search = options.search;

    return this.request<LeaderboardResponse>('GET', '/leaderboard', { params });
  }

  /**
   * Get a specific player's rank on the leaderboard.
   *
   * **Requires API Key Scope:** `leaderboard:read` or `read`
   *
   * @param playerId - External player ID (vair_mem_xxx format)
   * @param options - Leaderboard context options
   * @returns Player rank data with nearby players for context
   *
   * @example
   * ```ts
   * const rank = await client.getPlayerRank('vair_mem_xxx', {
   *   category: 'doubles',
   *   contextSize: 5,
   * });
   *
   * console.log(`Rank: #${rank.rank} (top ${rank.percentile}%)`);
   * console.log(`Points to next rank: ${rank.pointsToNextRank}`);
   *
   * // Show nearby players
   * for (const nearby of rank.nearbyPlayers) {
   *   console.log(`#${nearby.rank} ${nearby.displayName}`);
   * }
   * ```
   *
   * @category Leaderboard
   */
  async getPlayerRank(
    playerId: string,
    options: PlayerRankOptions = {},
  ): Promise<PlayerRankResponse> {
    const body = {
      playerId,
      category: options.category ?? 'doubles',
      ageBracket: options.ageBracket ?? 'open',
      scope: options.scope ?? 'global',
      state: options.state,
      city: options.city,
      clubId: options.clubId,
      contextSize: options.contextSize ?? 5,
    };

    return this.request<PlayerRankResponse>('POST', '/leaderboard/rank', { body });
  }

  /**
   * Get available leaderboard categories and brackets.
   *
   * **Requires API Key Scope:** `leaderboard:read` or `read`
   *
   * @returns Available categories, age brackets, and scopes
   *
   * @example
   * ```ts
   * const categories = await client.getLeaderboardCategories();
   *
   * console.log('Categories:', categories.categories.map(c => c.name));
   * console.log('Age Brackets:', categories.ageBrackets.map(b => b.name));
   * ```
   *
   * @category Leaderboard
   */
  async getLeaderboardCategories(): Promise<LeaderboardCategoriesResponse> {
    return this.request<LeaderboardCategoriesResponse>('GET', '/leaderboard/categories');
  }
}

// ---------------------------------------------------------------------------
// Leaderboard Types
// ---------------------------------------------------------------------------

/**
 * Options for leaderboard queries.
 * @category Leaderboard
 */
export interface LeaderboardOptions {
  /** Rating category: doubles, singles, mixed (default: doubles) */
  category?: 'doubles' | 'singles' | 'mixed';
  /** Age bracket: open, 40+, 50+, 60+, 70+ (default: open) */
  ageBracket?: string;
  /** Geographic scope: global, state, city, club (default: global) */
  scope?: 'global' | 'state' | 'city' | 'club';
  /** State code (required if scope is 'state') */
  state?: string;
  /** City name (required if scope is 'city') */
  city?: string;
  /** Club ID (required if scope is 'club') */
  clubId?: string;
  /** Filter by gender: male, female */
  gender?: 'male' | 'female';
  /** Only show VAIRified players */
  verifiedOnly?: boolean;
  /** Minimum games to appear (default: 10) */
  minGames?: number;
  /** Results per page (default: 50, max: 100) */
  limit?: number;
  /** Pagination offset */
  offset?: number;
  /** Search by player name */
  search?: string;
}

/**
 * Leaderboard API response.
 * @category Leaderboard
 */
export interface LeaderboardResponse {
  players: LeaderboardPlayer[];
  stats: {
    totalPlayers: number;
    verifiedPlayers: number;
    averageRating: number;
    totalGames: number;
  };
  filters: {
    category: string;
    ageBracket: string;
    scope: string;
    verifiedOnly: boolean;
    minGames: number;
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  cachedAt?: string;
}

/**
 * Player entry in leaderboard.
 * @category Leaderboard
 */
export interface LeaderboardPlayer {
  rank: number;
  externalId: string;
  displayName: string;
  city?: string;
  state?: string;
  country?: string;
  rating: number;
  gamesPlayed: number;
  isVairified: boolean;
  ratingChange?: number;
}

/**
 * Options for player rank query.
 * @category Leaderboard
 */
export interface PlayerRankOptions {
  /** Rating category (default: doubles) */
  category?: 'doubles' | 'singles' | 'mixed';
  /** Age bracket (default: open) */
  ageBracket?: string;
  /** Geographic scope (default: global) */
  scope?: 'global' | 'state' | 'city' | 'club';
  /** State code for state scope */
  state?: string;
  /** City name for city scope */
  city?: string;
  /** Club ID for club scope */
  clubId?: string;
  /** Number of nearby players to include (default: 5) */
  contextSize?: number;
}

/**
 * Player rank API response.
 * @category Leaderboard
 */
export interface PlayerRankResponse {
  playerId: string;
  rank: number;
  totalPlayers: number;
  percentile: number;
  rating: number;
  gamesPlayed: number;
  pointsToNextRank?: number;
  pointsBufferFromPrevious?: number;
  nearbyPlayers: LeaderboardPlayer[];
  category: string;
  ageBracket: string;
  scope: string;
}

/**
 * Available leaderboard categories response.
 * @category Leaderboard
 */
export interface LeaderboardCategoriesResponse {
  categories: Array<{ code: string; name: string }>;
  ageBrackets: Array<{ code: string; name: string; displayOrder: number }>;
  scopes: Array<{ code: string; name: string }>;
}
