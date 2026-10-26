/**
 * {@link EventMember} and {@link EventMembersResult} — an event's roster — and
 * {@link EventRosterResult}, what sending your own listing's members did.
 *
 * @module
 */

import type {
  EventMemberSource,
  EventMembersResultWire,
  EventRosterRefusalReason,
  EventRosterRefusalWire,
  EventRosterResultWire,
  OpenEnum,
  PartnerEventMemberWire,
} from '../types.js';

/**
 * One player enrolled in an event — enough to seed your own brackets and
 * pairings. For fuller rating data, look the member up with
 * `client.members.getBulk()`.
 *
 * ## On your own listings
 *
 * The row follows the member's connection to your app. A connected member
 * (or any member, for a TRUSTED app, or a placeholder your app created) comes
 * with every field. A member who never connected your app, or who disconnected
 * it, comes back with `memberId`, `enrollmentStatus`, `isPaid`, `source` and
 * `lapsed` only: the profile fields ({@link firstName}, {@link lastName},
 * {@link isVairified}, {@link isVairPlus}) and {@link rating} are then `null`.
 * A member Vairified staff added who never connected your app also carries
 * their name. {@link source} and
 * {@link lapsed} are filled in on your own listings only; on every other event
 * they are `null` and every profile field is present.
 *
 * @category Events
 */
export class EventMember {
  readonly memberId: number;
  /** `null` on your own listing when the member never connected your app, or disconnected it. */
  readonly firstName: string | null;
  /** `null` on your own listing when the member never connected your app, or disconnected it. */
  readonly lastName: string | null;
  /**
   * The player's overall-open rating **in the event's sport**, truncated to 3
   * decimals. `null` when the player has no rating yet, or (on your own
   * listing) never connected your app or disconnected it.
   */
  readonly rating: number | null;
  /**
   * Whether the player has completed VAIRification. `null` on your own listing
   * when the member never connected your app, or disconnected it.
   */
  readonly isVairified: boolean | null;
  /**
   * Whether the player holds a **paid VAIR+ membership**. Not {@link isPaid},
   * which is about this event's entry fee; the two are independent. `null` on
   * your own listing when the member never connected your app, or disconnected
   * it.
   */
  readonly isVairPlus: boolean | null;
  /**
   * `'PENDING'`, `'CONFIRMED'`, `'COMPLETED'` or `'CANCELLED'`. On your own
   * listing, `'PENDING'` means the member signed up on Vairified and is
   * **waiting for you**: send them in your list
   * ({@link EventsResource.setMembers}) to confirm them. `'CONFIRMED'` means
   * your list confirmed them.
   */
  readonly enrollmentStatus: OpenEnum<'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'>;
  /** Whether the player has paid for their slot **on this event**. */
  readonly isPaid: boolean;
  /**
   * Your own listings only: where the sign-up came from — `'PARTNER_LIST'`
   * (your list), `'VAIR_SIGNUP'` (the member registered on Vairified) or
   * `'STAFF_ADD'` (Vairified staff registered them). `null` on any other event.
   */
  readonly source: EventMemberSource | null;
  /**
   * Your own listings only: `true` when the member was still waiting for you
   * when the event started. A lapsed sign-up never counts as attended; send the
   * member in your list to confirm them anyway, if they have another reason to
   * be on it. `null` on any other event.
   */
  readonly lapsed: boolean | null;

  /** @internal */
  constructor(wire: PartnerEventMemberWire) {
    this.memberId = wire.memberId;
    this.firstName = wire.firstName ?? null;
    this.lastName = wire.lastName ?? null;
    this.rating = wire.rating ?? null;
    this.isVairified = wire.isVairified ?? null;
    this.isVairPlus = wire.isVairPlus ?? null;
    this.enrollmentStatus = wire.enrollmentStatus;
    this.isPaid = wire.isPaid;
    this.source = wire.source ?? null;
    this.lapsed = wire.lapsed ?? null;
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

/**
 * A member your list named that was not applied, and why. Everyone else on the
 * list was applied.
 *
 * @category Events
 */
export class EventRosterRefusal {
  /** The member number you sent. */
  readonly memberId: number;
  /** See {@link EventRosterRefusalReason}. An open set: never branch on it exhaustively. */
  readonly reason: EventRosterRefusalReason;
  /** A sentence saying why, e.g. "This member hasn't connected your app." */
  readonly message: string;

  /** @internal */
  constructor(wire: EventRosterRefusalWire) {
    this.memberId = wire.memberId;
    this.reason = wire.reason;
    this.message = wire.message;
    Object.freeze(this);
  }
}

/**
 * What sending your whole confirmed list for one listing did
 * ({@link EventsResource.setMembers}).
 *
 * The four counts are of members, after repeated numbers were counted once.
 * Sending the same list again reports everyone as {@link unchanged}.
 *
 * @category Events
 */
export class EventRosterResult {
  /** Your identifier for the listing, echoed back. */
  readonly partnerEventId: string;
  /** Vairified's integer id for the listing. */
  readonly eventId: number;
  /** Members newly confirmed by this list. */
  readonly added: number;
  /** Members who had signed up on Vairified and are now confirmed by this list. */
  readonly confirmed: number;
  /** Members already confirmed; nothing changed. */
  readonly unchanged: number;
  /** Confirmed members this list left off, now cancelled by you. */
  readonly removed: number;
  /** Members not applied, with the reason. Empty when everyone was applied. */
  readonly refused: readonly EventRosterRefusal[];

  /** @internal */
  constructor(wire: EventRosterResultWire) {
    this.partnerEventId = wire.partnerEventId;
    this.eventId = wire.eventId;
    this.added = wire.added;
    this.confirmed = wire.confirmed;
    this.unchanged = wire.unchanged;
    this.removed = wire.removed;
    this.refused = Object.freeze((wire.refused ?? []).map((r) => new EventRosterRefusal(r)));
    Object.freeze(this);
  }
}
