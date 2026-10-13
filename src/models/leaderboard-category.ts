/**
 * Leaderboard rating tracks — the `category` codes, the labels the API also
 * accepts, and {@link LeaderboardCategoryInfo} (one entry of
 * `GET /leaderboard/categories`).
 *
 * @module
 */

import type { OpenEnum } from '../types.js';

/**
 * Every leaderboard `category` code, in the order the API lists them.
 *
 * The first four are **verified** tracks — their boards list only players
 * verified in the sport. The last four are **recreational** tracks.
 *
 * @category Leaderboards
 */
export const LEADERBOARD_CATEGORIES = Object.freeze([
  'overall',
  'gender',
  'singles',
  'mixed',
  'recreational',
  'recreational_gender',
  'recreational_mixed',
  'recreational_singles',
] as const);

/**
 * A leaderboard `category` code: `overall` (VO), `gender` (VG), `singles`
 * (VS), `mixed` (VM), `recreational` (RO / Rv), `recreational_gender` (RG),
 * `recreational_mixed` (RM), `recreational_singles` (RS).
 *
 * @category Leaderboards
 */
export type LeaderboardCategory = (typeof LEADERBOARD_CATEGORIES)[number];

/**
 * The track labels the API accepts in place of a code, case-insensitively.
 * `S` (verified singles) and `R` / `Rv` (the recreational chain) are the legacy
 * partner abbreviations and keep resolving.
 *
 * @category Leaderboards
 */
export const LEADERBOARD_CATEGORY_LABELS = Object.freeze([
  'VO',
  'VG',
  'VM',
  'VS',
  'S',
  'RO',
  'Rv',
  'R',
  'RG',
  'RM',
  'RS',
] as const);

/**
 * A label the API maps to a {@link LeaderboardCategory}.
 *
 * @category Leaderboards
 */
export type LeaderboardCategoryLabel = (typeof LEADERBOARD_CATEGORY_LABELS)[number];

/**
 * What `category` accepts: a code or a label. Open-ended so a label in another
 * case (`'vs'`) — which the API accepts — still type-checks, and so a track the
 * API adds later does not need an SDK release. An unknown value is a 400
 * ({@link ValidationError}) listing every track.
 *
 * @category Leaderboards
 */
export type LeaderboardCategoryInput = OpenEnum<LeaderboardCategory | LeaderboardCategoryLabel>;

/**
 * Wire shape of one `GET /leaderboard/categories` entry.
 *
 * @category Leaderboards
 */
export interface LeaderboardCategoryInfoWire {
  readonly code: string;
  readonly name: string;
  readonly label: string;
  readonly verifiedOnly: boolean;
  /** Present on the recreational chain only. */
  readonly verifiedLabel?: string;
}

/**
 * One leaderboard track, as listed by
 * {@link LeaderboardResource.categoryList}.
 *
 * @category Leaderboards
 */
export class LeaderboardCategoryInfo {
  /** The `category` code to pass to `list()` / `rank()`. */
  readonly code: OpenEnum<LeaderboardCategory>;
  /** Display name (`'Doubles'`, `'Singles'`, `'Recreational'`, …). */
  readonly name: string;
  /** The label the web app shows for this track (`'VO'`, `'RO'`, `'RG'`, …). */
  readonly label: string;
  /** `true` for the verified tracks: their board lists only players verified in the sport. */
  readonly verifiedOnly: boolean;
  /**
   * The recreational chain's label for a player verified in the sport
   * (`'Rv'`); `null` on every other track.
   */
  readonly verifiedLabel: string | null;

  constructor(wire: LeaderboardCategoryInfoWire) {
    this.code = wire.code;
    this.name = wire.name;
    this.label = wire.label;
    this.verifiedOnly = wire.verifiedOnly;
    this.verifiedLabel = wire.verifiedLabel ?? null;
    Object.freeze(this);
  }

  toString(): string {
    return `LeaderboardCategoryInfo ${this.code} (${this.label})`;
  }
}
