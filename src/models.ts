/**
 * Vairified SDK Models
 *
 * Rich model classes with methods for easy API interaction.
 *
 * @module
 */

import type { Vairified } from './client.js';
import type {
  MatchApiData,
  MatchInput,
  MatchResultData,
  MemberData,
  PlayerSearchData,
  RatingSplitData,
  RatingSplitsData,
  RatingUpdateData,
  SearchFilters,
  SearchResultsData,
} from './types.js';

/** Union type for player data from different endpoints */
type PlayerData = MemberData | PlayerSearchData;

/**
 * A single rating split with metadata.
 *
 * @category Models
 */
export class RatingSplit {
  /** The rating value */
  readonly rating: number;
  /** Abbreviation (e.g., "VG", "50+") */
  readonly abbr: string;
  /** Date of last match in this category */
  readonly datePlayed?: string;

  constructor(data: RatingSplitData | number) {
    if (typeof data === 'number') {
      this.rating = data;
      this.abbr = '';
    } else {
      const ratingVal = data.rating;
      this.rating = typeof ratingVal === 'string' ? Number.parseFloat(ratingVal) || 0 : ratingVal;
      this.abbr = data.abbr;
      this.datePlayed = data.date_played;
    }
  }
}

/**
 * Rating breakdown by category.
 *
 * Access ratings by category name or use convenience properties.
 *
 * @category Models
 */
export class RatingSplits {
  /** Map of category names to rating splits */
  readonly splits: Map<string, RatingSplit>;

  constructor(data?: RatingSplitsData) {
    this.splits = new Map();
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        this.splits.set(key, new RatingSplit(value));
      }
    }
  }

  /** Get rating for a category */
  get(category: string): number | undefined {
    return this.splits.get(category)?.rating;
  }

  /** Open division rating */
  get open(): number | undefined {
    return this.get('open') ?? this.get('VO');
  }

  /** Gender-specific rating (same gender doubles) */
  get gender(): number | undefined {
    return this.get('gender') ?? this.get('VG');
  }

  /** Mixed doubles rating */
  get mixed(): number | undefined {
    return this.get('mixed') ?? this.get('VM');
  }

  /** Recreational rating */
  get recreational(): number | undefined {
    return this.get('recreational') ?? this.get('R');
  }

  /** Singles rating */
  get singles(): number | undefined {
    return this.get('singles') ?? this.get('S');
  }

  /** Best available verified rating */
  get best(): number | undefined {
    const ratings = Array.from(this.splits.values())
      .map((s) => s.rating)
      .filter((r) => r > 0);
    return ratings.length > 0 ? Math.max(...ratings) : undefined;
  }

  /** Convert to plain object */
  toJSON(): Record<string, { rating: number; abbr: string }> {
    const result: Record<string, { rating: number; abbr: string }> = {};
    for (const [key, split] of this.splits) {
      result[key] = { rating: split.rating, abbr: split.abbr };
    }
    return result;
  }
}

/**
 * Check if data is from search endpoint (has displayName)
 */
function isSearchData(data: PlayerData): data is PlayerSearchData {
  return 'displayName' in data;
}

/**
 * A player in the Vairified system.
 *
 * From public search, only limited data is available (display name, location, rating).
 * For full profile data, use getMember() with OAuth consent.
 *
 * @category Models
 */
export class Player {
  /** External player ID (vair_mem_xxx format) */
  readonly id: string;
  /** Display name (First Name + Last Initial from search) */
  readonly displayName?: string;
  /** First name (only from connected member) */
  readonly firstName?: string;
  /** Last name (only from connected member) */
  readonly lastName?: string;
  /** Primary/overall rating (2.0-8.0) */
  readonly rating: number;
  /** Whether player is verified */
  readonly isVairified: boolean;
  /** Whether player has connected to your app */
  readonly isConnected: boolean;
  /** Ratings by category (only from connected member) */
  readonly ratingSplits: RatingSplits;
  /** City */
  readonly city?: string;
  /** State code */
  readonly state?: string;
  /** Country code */
  readonly country?: string;

  protected _client?: Vairified;

  constructor(data: PlayerData, client?: Vairified) {
    if (isSearchData(data)) {
      // Search format (limited data)
      this.id = data.id;
      this.displayName = data.displayName;
      this.rating = data.rating ?? 0;
      this.isVairified = data.isVairified ?? false;
      this.isConnected = data.isConnected ?? false;
      this.ratingSplits = new RatingSplits();
    } else {
      // Member format (full data)
      this.id = data.id;
      this.firstName = data.firstName ?? '';
      this.lastName = data.lastName ?? '';
      this.rating = data.rating ?? 0;
      this.isVairified = data.isVairified ?? false;
      this.isConnected = true; // If we have member data, they're connected
      this.ratingSplits = new RatingSplits(data.ratingSplits);
    }

    this.city = data.city;
    this.state = data.state;
    this.country = data.country;
    this._client = client;
  }

  /** Full name (or display name if full name not available) */
  get name(): string {
    if (this.firstName && this.lastName) {
      return `${this.firstName} ${this.lastName}`.trim();
    }
    return this.displayName ?? '';
  }

  /** Best verified rating */
  get verifiedRating(): number | undefined {
    return this.ratingSplits.best;
  }

  toString(): string {
    const verified = this.isVairified ? ' ✓' : '';
    return `${this.name} (${this.rating.toFixed(2)})${verified}`;
  }
}

/**
 * A member with full profile access (requires OAuth connection).
 *
 * Only accessible for players who have connected their account via OAuth.
 *
 * @category Models
 */
export class Member extends Player {
  /** Email address (only if profile:email scope granted) */
  readonly email?: string;
  /** Scopes the player granted to your app */
  readonly grantedScopes: string[];

  constructor(data: MemberData, client?: Vairified) {
    super(data, client);
    this.email = data.email;
    this.grantedScopes = data.grantedScopes ?? [];
  }

  /** Check if the player has granted a specific scope */
  hasScope(scope: string): boolean {
    return this.grantedScopes.includes(scope);
  }

  /** Refresh member data from API */
  async refresh(): Promise<Member> {
    if (!this._client) {
      throw new Error('Member not connected to client');
    }
    const updated = await this._client.getMember(this.id);
    Object.assign(this, updated);
    return this;
  }
}

/**
 * Generate a unique identifier for matches.
 */
function generateId(): string {
  return `SDK-${Math.random().toString(36).substring(2, 14)}`;
}

/**
 * A match to submit to the Vairified Partner API.
 *
 * @category Models
 *
 * @example
 * ```ts
 * // Doubles match: 11-9, 11-7
 * const match = new Match({
 *   event: 'Weekly League',
 *   bracket: '4.0 Doubles',
 *   date: new Date(),
 *   team1: ['player1_id', 'player2_id'],
 *   team2: ['player3_id', 'player4_id'],
 *   scores: [[11, 9], [11, 7]],
 * });
 *
 * // Singles match: 11-8, 9-11, 11-6
 * const match = new Match({
 *   event: 'Club Singles',
 *   bracket: 'Open Singles',
 *   date: new Date(),
 *   team1: ['player1_id'],
 *   team2: ['player2_id'],
 *   scores: [[11, 8], [9, 11], [11, 6]],
 * });
 * ```
 */
export class Match {
  /** Event/tournament name */
  readonly event: string;
  /** Bracket/division name */
  readonly bracket: string;
  /** Match date */
  readonly date: Date;
  /** Team 1 player IDs */
  readonly team1: readonly string[];
  /** Team 2 player IDs */
  readonly team2: readonly string[];
  /** Game scores */
  readonly scores: readonly [number, number][];
  /** Match type */
  readonly matchType: string;
  /** Match source */
  readonly source: string;
  /** Location */
  readonly location?: string;
  /** Unique identifier */
  readonly identifier: string;
  /** Match ID (set after submission) */
  id?: string;

  constructor(data: MatchInput) {
    this.event = data.event;
    this.bracket = data.bracket;
    this.date = data.date instanceof Date ? data.date : new Date(data.date);
    this.team1 = data.team1;
    this.team2 = data.team2;
    this.scores = data.scores;
    this.matchType = data.matchType ?? 'SIDEOUT';
    this.source = data.source ?? 'PARTNER';
    this.location = data.location;
    this.identifier = data.identifier ?? generateId();
  }

  /** Match format: SINGLES or DOUBLES */
  get format(): 'SINGLES' | 'DOUBLES' {
    return this.team1.length === 1 ? 'SINGLES' : 'DOUBLES';
  }

  /** Team that won (1 or 2). Returns 0 if tie. */
  get winner(): 0 | 1 | 2 {
    let t1Wins = 0;
    let t2Wins = 0;
    for (const [s1, s2] of this.scores) {
      if (s1 > s2) t1Wins++;
      else if (s2 > s1) t2Wins++;
    }
    if (t1Wins > t2Wins) return 1;
    if (t2Wins > t1Wins) return 2;
    return 0;
  }

  /** Score summary like "11-9, 11-7" */
  get scoreSummary(): string {
    return this.scores.map(([s1, s2]) => `${s1}-${s2}`).join(', ');
  }

  /** Convert to API request format */
  toJSON(): MatchApiData {
    const player1A = this.team1[0];
    const player1B = this.team2[0];
    if (!player1A || !player1B) {
      throw new Error('Match must have at least one player per team');
    }

    const teamA: MatchApiData['teamA'] = { player1: player1A };
    const teamB: MatchApiData['teamB'] = { player1: player1B };

    if (this.team1[1]) teamA.player2 = this.team1[1];
    if (this.team2[1]) teamB.player2 = this.team2[1];

    // Add game scores to teams
    const gameKeys = ['game1', 'game2', 'game3', 'game4', 'game5'] as const;
    for (let i = 0; i < Math.min(this.scores.length, 5); i++) {
      const score = this.scores[i];
      const key = gameKeys[i];
      if (score && key) {
        teamA[key] = score[0];
        teamB[key] = score[1];
      }
    }

    return {
      identifier: this.identifier,
      bracket: this.bracket,
      event: this.event,
      format: this.format,
      matchDate: this.date.toISOString(),
      matchSource: this.source,
      matchType: this.matchType,
      location: this.location,
      teamA,
      teamB,
    };
  }
}

/**
 * Result of a match submission.
 *
 * @category Models
 */
export class MatchResult {
  /** Whether submission succeeded */
  readonly success: boolean;
  /** Number of matches processed */
  readonly numMatches: number;
  /** Number of games recorded */
  readonly numGames: number;
  /** Whether this was a dry-run (validation only) */
  readonly dryRun: boolean;
  /** Human-readable result message */
  readonly message?: string;
  /** List of validation/processing errors */
  readonly errors: string[];

  constructor(data: MatchResultData) {
    this.success = data.success;
    this.numMatches = data.numMatches;
    this.numGames = data.numGames;
    this.dryRun = data.dryRun ?? false;
    this.message = data.message;
    this.errors = data.errors ?? [];
  }

  /** Alias for dryRun */
  get isDryRun(): boolean {
    return this.dryRun;
  }

  /** Returns true if submission succeeded without errors */
  get ok(): boolean {
    return this.success && this.errors.length === 0;
  }
}

/**
 * A rating change notification.
 *
 * @category Models
 */
export class RatingUpdate {
  /** External player ID (vair_mem_xxx format) */
  readonly id: string;
  /** Member name */
  readonly memberName?: string;
  /** Previous rating */
  readonly previousRating: number;
  /** New rating */
  readonly newRating: number;
  /** When the change occurred */
  readonly changedAt: Date;
  /** Updated rating splits */
  readonly ratingSplits: RatingSplits;

  private _client?: Vairified;

  constructor(data: RatingUpdateData, client?: Vairified) {
    this.id = data.id;
    this.memberName = data.memberName;
    this.previousRating = data.previousRating ?? 0;
    this.newRating = data.newRating ?? 0;
    this.changedAt = data.changedAt ? new Date(data.changedAt) : new Date();
    this.ratingSplits = new RatingSplits(data.ratingSplits);
    this._client = client;
  }

  /** Amount of rating change */
  get change(): number {
    return this.newRating - this.previousRating;
  }

  /** Whether rating improved */
  get improved(): boolean {
    return this.change > 0;
  }

  /** Fetch the member associated with this update */
  async getMember(): Promise<Member> {
    if (!this._client) {
      throw new Error('Update not connected to client');
    }
    return this._client.getMember(this.id);
  }

  toString(): string {
    const direction = this.improved ? '↑' : '↓';
    const name = this.memberName ? ` (${this.memberName})` : '';
    return `${this.id}${name}: ${this.previousRating.toFixed(2)} ${direction} ${this.newRating.toFixed(2)}`;
  }
}

/**
 * Paginated search results.
 *
 * @category Models
 */
export class SearchResults implements Iterable<Player> {
  /** List of players */
  readonly players: Player[];
  /** Total matching players */
  readonly total: number;
  /** Current page */
  readonly page: number;
  /** Results per page */
  readonly limit: number;

  private _client?: Vairified;
  private _filters: SearchFilters;

  constructor(data: SearchResultsData, client?: Vairified, filters: SearchFilters = {}) {
    this.players = data.players.map((p) => new Player(p, client));
    this.total = data.total;
    this.page = data.page;
    this.limit = data.limit;
    this._client = client;
    this._filters = filters;
  }

  /** Whether more results are available */
  get hasMore(): boolean {
    return this.page * this.limit < this.total;
  }

  /** Total number of pages */
  get pages(): number {
    return this.limit > 0 ? Math.ceil(this.total / this.limit) : 0;
  }

  /** Number of players in current page */
  get length(): number {
    return this.players.length;
  }

  /** Get player by index */
  at(index: number): Player | undefined {
    return this.players[index];
  }

  /** Iterate over players */
  [Symbol.iterator](): Iterator<Player> {
    return this.players[Symbol.iterator]();
  }

  /** Fetch next page of results */
  async nextPage(): Promise<SearchResults> {
    if (!this._client) {
      throw new Error('Results not connected to client');
    }
    if (!this.hasMore) {
      throw new Error('No more pages');
    }

    return this._client.search({
      ...this._filters,
      page: this.page + 1,
    });
  }
}
