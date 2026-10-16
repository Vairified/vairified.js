/**
 * {@link SportRating} — a player's ratings for one sport.
 *
 * @module
 */

import type { RatingSplitWire, SportRatingWire, VairProStatus } from '../types.js';

/**
 * One rating split as the SDK hands it over: the wire split with
 * {@link RatingSplit.label} always present (`null` when the API sent none).
 *
 * @category Members
 */
export interface RatingSplit extends RatingSplitWire {
  /**
   * The label the VAIRified web app shows for this split, bracket suffix
   * included — `VO`, `VG`, `VM`, `VS` (verified tracks), `RO` (the
   * recreational doubles chain, "Recreational Overall", for every player) and `RS` (recreational
   * singles), e.g. `VS12-13`. The API never sends provisional or asymmetric
   * splits; `null` only when an older API leaves the label out.
   *
   * Use this when you display a label. Since 0.9.0 {@link RatingSplitWire.abbr}
   * matches it on all six tracks (verified singles is `VS`, it was `S`; the
   * recreational chain is `RO`, it was `R` / `Rv`).
   */
  readonly label: string | null;
}

/**
 * Normalize a wire split into a frozen {@link RatingSplit}. Unknown keys a
 * newer API sends are carried through.
 *
 * @internal
 */
export function toRatingSplit(wire: RatingSplitWire): RatingSplit {
  return Object.freeze({ ...wire, label: wire.label ?? null });
}

/**
 * A player's ratings for a single sport.
 *
 * The top-level `rating` / `abbr` is the primary rating for that sport:
 * the verified overall-open rating (`VO`) for a player verified in the
 * sport, otherwise the recreational chain (`RO`). Every category × age
 * bracket the API sends is also available via {@link get}, {@link has},
 * {@link byLabel}, and iteration.
 *
 * Verified-track splits (`overall-*`, `gender-*`, `mixed-*`, `singles-*`)
 * are present only for a player verified in the sport — the API leaves them
 * out otherwise, so check {@link has} rather than assuming a key. Provisional
 * (`provisional-*`) and asymmetric (`asymmetric-*`) splits are never sent.
 *
 * ```ts
 * const pb = member.sport.get('pickleball');
 * if (pb) {
 *   console.log(pb.rating, pb.abbr);                 // 3.915 VO
 *   console.log(pb.get('overall-open')?.rating);     // 3.915
 *   console.log(pb.byLabel('VS')?.rating);           // verified singles, by web label
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
  /** Category abbreviation for the primary rating (e.g. `'VO'`, `'RO'`). */
  readonly abbr: string;
  /**
   * The web app's label for the primary rating (`'VO'`, `'RO'`), or
   * `null` when the API sent none. See {@link RatingSplit.label}.
   */
  readonly label: string | null;

  /** Player is VAIRified in this sport: has a verified VO / VG / VM / VS rating there. */
  readonly isVairified: boolean;
  /** Player is an active VAIR Pro (can rate) in this sport. Alias of {@link isVairPro}. */
  readonly isRater: boolean;
  /** Player is an active VAIR Pro (can rate) in this sport. */
  readonly isVairPro: boolean;
  /** VAIR-Pro lifecycle status in this sport (`'ACTIVE'` / `'PENDING'` / `null`). */
  readonly isVairProStatus: VairProStatus;

  readonly #splits: ReadonlyMap<string, RatingSplit>;

  constructor(wire: SportRatingWire) {
    this.rating = wire.rating;
    this.abbr = wire.abbr;
    this.label = wire.label ?? null;
    this.isVairified = wire.isVairified ?? false;
    this.isRater = wire.isRater ?? false;
    this.isVairPro = wire.isVairPro ?? false;
    this.isVairProStatus = wire.isVairProStatus ?? null;
    this.#splits = new Map(
      Object.entries(wire.ratingSplits ?? {}).map(([key, split]) => [key, toRatingSplit(split)]),
    );
    Object.freeze(this);
  }

  /**
   * Look up a rating split by key (e.g. `'overall-open'`,
   * `'singles-12-13'`, `'gender-40+'`). Returns `undefined` if the
   * player has no rating for that bracket.
   */
  get(key: string): RatingSplit | undefined {
    return this.#splits.get(key);
  }

  /**
   * Look up a rating split by the label the web app shows, bracket suffix
   * included (e.g. `'VS'`, `'VO40+'`, `'RS12-13'`, `'RO'`). Matches
   * {@link RatingSplit.label} exactly, as the API sends it. Returns
   * `undefined` when no split carries that label.
   */
  byLabel(label: string): RatingSplit | undefined {
    for (const split of this.#splits.values()) {
      if (split.label === label) return split;
    }
    return undefined;
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
  values(): IterableIterator<RatingSplit> {
    return this.#splits.values();
  }

  /** `[key, split]` pairs for every rating split. */
  entries(): IterableIterator<[string, RatingSplit]> {
    return this.#splits.entries();
  }

  /**
   * `for (const [key, split] of sportRating) { ... }` — iterate every
   * rating split the player has in this sport.
   */
  [Symbol.iterator](): IterableIterator<[string, RatingSplit]> {
    return this.#splits.entries();
  }
}
