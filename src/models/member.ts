/**
 * {@link Member} — partner-facing player record.
 *
 * @module
 */

import type {
  Gender,
  MemberStatusWire,
  PartnerMemberWire,
  RatingSplitWire,
  SportRatingWire,
} from '../types.js';
import { SportRating } from './sport-rating.js';

/**
 * Map-like wrapper around a player's sport → {@link SportRating}.
 *
 * Supports `.get(code)`, `.has(code)`, `.size`, and iteration so the
 * shape feels native:
 *
 * ```ts
 * member.sport.get('pickleball')?.rating
 * for (const [code, rating] of member.sport) { ... }
 * ```
 *
 * @category Members
 */
export class MemberSportMap {
  readonly #sports: ReadonlyMap<string, SportRating>;

  constructor(wire: Readonly<Record<string, SportRatingWire>> | undefined) {
    const entries = Object.entries(wire ?? {}).map(
      ([code, w]) => [code, new SportRating(w)] as const,
    );
    this.#sports = new Map(entries);
    Object.freeze(this);
  }

  get(sport: string): SportRating | undefined {
    return this.#sports.get(sport);
  }

  has(sport: string): boolean {
    return this.#sports.has(sport);
  }

  get size(): number {
    return this.#sports.size;
  }

  keys(): IterableIterator<string> {
    return this.#sports.keys();
  }

  values(): IterableIterator<SportRating> {
    return this.#sports.values();
  }

  entries(): IterableIterator<[string, SportRating]> {
    return this.#sports.entries();
  }

  [Symbol.iterator](): IterableIterator<[string, SportRating]> {
    return this.#sports.entries();
  }
}

/**
 * A partner-facing player record.
 *
 * Returned by {@link MembersResource.get} (full detail, requires an
 * active OAuth connection) and {@link MembersResource.search} (limited
 * detail for public search).
 *
 * Rating data lives under {@link sport} — keyed by sport code. The
 * backend returns only the sports the player has ratings in, or only
 * the sports requested via the `sport=` query filter. Use
 * {@link ratingFor} to fetch the primary rating for a specific sport
 * with a sensible default.
 *
 * @category Members
 */
export class Member {
  readonly memberId: number;
  readonly id: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  readonly displayName: string;
  readonly age: number | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly zip: string | null;
  readonly country: string | null;
  readonly gender: Gender | null;
  readonly status: MemberStatusWire;
  readonly sport: MemberSportMap;
  readonly activeLeagues: readonly string[] | null;
  readonly email: string | null;
  readonly grantedScopes: readonly string[] | null;

  constructor(wire: PartnerMemberWire) {
    this.memberId = wire.memberId;
    this.id = wire.id ?? null;
    this.firstName = wire.firstName;
    this.lastName = wire.lastName;
    this.fullName = wire.fullName;
    this.displayName = wire.displayName;
    this.age = wire.age ?? null;
    this.city = wire.city ?? null;
    this.state = wire.state ?? null;
    this.zip = wire.zip ?? null;
    this.country = wire.country ?? null;
    this.gender = wire.gender ?? null;
    this.status = Object.freeze({ ...wire.status });
    this.sport = new MemberSportMap(wire.sport);
    this.activeLeagues = wire.activeLeagues ? Object.freeze([...wire.activeLeagues]) : null;
    this.email = wire.email ?? null;
    this.grantedScopes = wire.grantedScopes ? Object.freeze([...wire.grantedScopes]) : null;
    Object.freeze(this);
  }

  /** Full name — alias for {@link fullName}, matching common usage. */
  get name(): string {
    return this.fullName;
  }

  /** The list of sport codes this player has ratings in. */
  get sports(): readonly string[] {
    return [...this.sport.keys()];
  }

  /**
   * Primary rating for a given sport.
   *
   * @param sport Sport code — defaults to `'pickleball'`.
   * @returns The primary rating value, or `null` if the player has no
   *   ratings for that sport.
   */
  ratingFor(sport = 'pickleball'): number | null {
    return this.sport.get(sport)?.rating ?? null;
  }

  /**
   * Get a specific rating split for a sport.
   *
   * @param key Split key (e.g. `'overall-open'`).
   * @param sport Sport code — defaults to `'pickleball'`.
   */
  split(key: string, sport = 'pickleball'): RatingSplitWire | null {
    return this.sport.get(sport)?.get(key) ?? null;
  }

  /** Compact summary for console output. */
  toString(): string {
    const primary = this.sport.values().next().value;
    if (primary) {
      return `Member #${this.memberId} '${this.displayName}' rating=${primary.rating.toFixed(
        3,
      )} ${primary.abbr}`;
    }
    return `Member #${this.memberId} '${this.displayName}'`;
  }
}
