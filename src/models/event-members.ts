/**
 * {@link EventMember} and {@link EventMembersResult} — an event's roster.
 *
 * @module
 */

import type { EventMembersResultWire, PartnerEventMemberWire } from '../types.js';

/**
 * One player enrolled in an event — enough to seed your own brackets and
 * pairings. For fuller rating data, look the member up with
 * `client.members.getBulk()`.
 *
 * @category Events
 */
export class EventMember {
  readonly memberId: number;
  readonly firstName: string;
  readonly lastName: string;
  /**
   * The player's overall-open rating **in the event's sport**, truncated to 3
   * decimals. `null` when the player has no rating yet.
   */
  readonly rating: number | null;
  /** Whether the player has completed VAIRification. */
  readonly isVairified: boolean;
  /**
   * Whether the player holds a **paid VAIR+ membership**. Not {@link isPaid},
   * which is about this event's entry fee; the two are independent.
   */
  readonly isVairPlus: boolean;
  /** `'PENDING'`, `'CONFIRMED'`, `'COMPLETED'` or `'CANCELLED'`. */
  readonly enrollmentStatus: string;
  /** Whether the player has paid for their slot **on this event**. */
  readonly isPaid: boolean;

  /** @internal */
  constructor(wire: PartnerEventMemberWire) {
    this.memberId = wire.memberId;
    this.firstName = wire.firstName;
    this.lastName = wire.lastName;
    this.rating = wire.rating ?? null;
    this.isVairified = wire.isVairified;
    this.isVairPlus = wire.isVairPlus;
    this.enrollmentStatus = wire.enrollmentStatus;
    this.isPaid = wire.isPaid;
    Object.freeze(this);
  }
}

/**
 * The deduplicated roster of an event. Players appear once however many
 * enrollment units they are in; cancelled enrollments and deleted players are
 * left out.
 *
 * @category Events
 */
export class EventMembersResult {
  /** The event's integer id, echoed back. */
  readonly eventId: number;
  /** The event's sport code. Each member's `rating` is in this sport. */
  readonly sport: string;
  readonly members: readonly EventMember[];

  /** @internal */
  constructor(wire: EventMembersResultWire) {
    this.eventId = wire.eventId;
    this.sport = wire.sport;
    this.members = Object.freeze((wire.members ?? []).map((m) => new EventMember(m)));
    Object.freeze(this);
  }
}
