/**
 * {@link SportRating} — a player's ratings for one sport.
 *
 * @module
 */

import type { RatingSplitWire, SportRatingWire } from '../types.js';

/**
 * A player's ratings for a single sport.
 *
 * The top-level `rating` / `abbr` is the primary rating for that sport
 * (conventionally the overall-open bracket). Every category × age
 * bracket the player has played is also available via {@link get},
 * {@link has}, subscript-style access, and iteration.
 *
 * ```ts
 * const pb = member.sport.get('pickleball');
 * if (pb) {
 *   console.log(pb.rating, pb.abbr);                 // 3.915 VO
 *   console.log(pb.get('overall-open')?.rating);     // 3.915
 *   console.log(pb.has('singles-40+'));              // false
 *   console.log(pb.size);                            // 3
 *   for (const [key, split] of pb) {
 *     console.log(key, split.rating);
 *   }
 * }
 * ```
 *
 * @category Members
 */
export class SportRating {
  /** Primary rating for this sport. */
  readonly rating: number;
  /** Category abbreviation for the primary rating (e.g. `'VO'`). */
  readonly abbr: string;

  readonly #splits: ReadonlyMap<string, RatingSplitWire>;

  constructor(wire: SportRatingWire) {
    this.rating = wire.rating;
    this.abbr = wire.abbr;
    this.#splits = new Map(Object.entries(wire.ratingSplits ?? {}));
    Object.freeze(this);
  }

  /**
   * Look up a rating split by key (e.g. `'overall-open'`,
   * `'singles-12-13'`, `'gender-40+'`). Returns `undefined` if the
   * player has no rating for that bracket.
   */
  get(key: string): RatingSplitWire | undefined {
    return this.#splits.get(key);
  }

  /** Whether the player has a rating for the given split key. */
  has(key: string): boolean {
    return this.#splits.has(key);
  }

  /** Number of rating splits. */
  get size(): number {
    return this.#splits.size;
  }

  /** All split keys the player has ratings for. */
  keys(): IterableIterator<string> {
    return this.#splits.keys();
  }

  /** All rating splits the player has. */
  values(): IterableIterator<RatingSplitWire> {
    return this.#splits.values();
  }

  /** `[key, split]` pairs for every rating split. */
  entries(): IterableIterator<[string, RatingSplitWire]> {
    return this.#splits.entries();
  }

  /**
   * `for (const [key, split] of sportRating) { ... }` — iterate every
   * rating split the player has in this sport.
   */
  [Symbol.iterator](): IterableIterator<[string, RatingSplitWire]> {
    return this.#splits.entries();
  }
}
