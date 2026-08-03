/**
 * {@link MembersByEmailResult} — result of an email → member lookup.
 *
 * @module
 */

import type { MembersByEmailResultWire, PartnerMemberEmailMatchWire } from '../types.js';
import { Member } from './member.js';

/**
 * One requested address that resolved to at least one member.
 *
 * {@link members} is always an array. An email address is not a unique
 * key in VAIR — an unclaimed imported record can share an address with a
 * claimed account — so never assume a single element without checking.
 *
 * @category Members
 */
export class MemberEmailMatch {
  /** The address exactly as you supplied it, not as stored. */
  readonly email: string;
  /** Every member holding this address. Never empty. */
  readonly members: readonly Member[];

  /** @internal */
  constructor(wire: PartnerMemberEmailMatchWire) {
    this.email = wire.email;
    this.members = Object.freeze(wire.members.map((m) => new Member(m)));
    Object.freeze(this);
  }

  /**
   * The single member for this address, or `null` when the address is
   * ambiguous (more than one match).
   *
   * Use this rather than `members[0]` when a wrong link is worse than no
   * link — it refuses to guess instead of silently picking one.
   */
  get sole(): Member | null {
    return this.members.length === 1 ? (this.members[0] ?? null) : null;
  }

  /** Whether this address resolved to more than one member. */
  get isAmbiguous(): boolean {
    return this.members.length > 1;
  }

  toString(): string {
    return `MemberEmailMatch ${this.email} -> ${this.members.length} member(s)`;
  }
}

/**
 * Result of a {@link MembersResource.getByEmail} call.
 *
 * Every address you supplied appears in exactly one of {@link matched} or
 * {@link notFound} — the endpoint never silently drops one, so consume
 * {@link notFound} directly rather than diffing your input against the
 * results.
 *
 * A `notFound` address is not proof the person has no VAIR account:
 * unclaimed imported records are deliberately excluded from this lookup.
 *
 * @category Members
 */
export class MembersByEmailResult {
  readonly matched: readonly MemberEmailMatch[];
  /** Addresses that resolved to nothing, echoed as you supplied them. */
  readonly notFound: readonly string[];

  /** @internal */
  constructor(wire: MembersByEmailResultWire) {
    this.matched = Object.freeze(wire.matched.map((m) => new MemberEmailMatch(m)));
    this.notFound = Object.freeze([...wire.notFound]);
    Object.freeze(this);
  }

  /**
   * Look up one address's match, case-insensitively.
   *
   * Saves callers a linear scan and, more importantly, saves them from
   * matching case-sensitively against an address the server echoed back
   * in whatever case they originally sent.
   */
  get(email: string): MemberEmailMatch | null {
    const needle = email.trim().toLowerCase();
    return this.matched.find((m) => m.email.toLowerCase() === needle) ?? null;
  }

  /** Whether every requested address resolved to at least one member. */
  get allResolved(): boolean {
    return this.notFound.length === 0;
  }

  /** Total number of members across every matched address. */
  get memberCount(): number {
    return this.matched.reduce((n, m) => n + m.members.length, 0);
  }

  toString(): string {
    return `MembersByEmailResult matched=${this.matched.length} notFound=${this.notFound.length}`;
  }
}
