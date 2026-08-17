/**
 * {@link MemberAttribution}, {@link MembersAttributionResult} and
 * {@link AttributionResult} — ambassador referral credit.
 *
 * @module
 */

import type {
  AttributionOutcome,
  AttributionResultWire,
  MemberAttributionWire,
  MembersAttributionResultWire,
} from '../types.js';

/**
 * Who currently earns referral credit for one member.
 *
 * @category Referrals
 */
export class MemberAttribution {
  readonly memberId: number;
  /** True when some ambassador already holds credit for this member. */
  readonly attributed: boolean;
  /**
   * The member id of the ambassador holding the credit.
   *
   * Compare it against your own event host's member id to tell "already credited
   * to my host — nothing to do" from "credited to somebody else — a person needs
   * to look, because claiming it takes credit from them".
   *
   * `null` both when nobody holds credit and when credit is held by a record that
   * has no member id of its own, so check {@link attributed} to tell those apart.
   */
  readonly ambassadorMemberId: number | null;
  /** The date the credit was established (`YYYY-MM-DD`), or `null`. */
  readonly attributedAt: string | null;

  /** @internal */
  constructor(wire: MemberAttributionWire) {
    this.memberId = wire.memberId;
    this.attributed = wire.attributed;
    this.ambassadorMemberId = wire.ambassadorMemberId ?? null;
    this.attributedAt = wire.attributedAt ?? null;
    Object.freeze(this);
  }

  /** True when nobody holds credit yet, so this member can be claimed. */
  get isClaimable(): boolean {
    return !this.attributed;
  }

  /** True when credit is held by an ambassador OTHER than the one given. */
  heldBySomeoneOtherThan(ambassadorMemberId: number): boolean {
    return this.attributed && this.ambassadorMemberId !== ambassadorMemberId;
  }
}

/**
 * Attribution for a batch of members, plus the ids that matched nothing.
 *
 * @category Referrals
 */
export class MembersAttributionResult {
  readonly attributions: readonly MemberAttribution[];
  /**
   * Member ids that matched no member. Read this rather than diffing your input
   * against the results — every id you sent lands in one bucket or the other.
   */
  readonly notFound: readonly number[];

  /** @internal */
  constructor(wire: MembersAttributionResultWire) {
    this.attributions = Object.freeze(
      (wire.attributions ?? []).map((a) => new MemberAttribution(a)),
    );
    this.notFound = Object.freeze([...(wire.notFound ?? [])]);
    Object.freeze(this);
  }

  /** Attribution for one member id, or `undefined` if it was not returned. */
  get(memberId: number): MemberAttribution | undefined {
    return this.attributions.find((a) => a.memberId === memberId);
  }

  /** Members nobody holds credit for yet. */
  get claimable(): readonly MemberAttribution[] {
    return this.attributions.filter((a) => a.isClaimable);
  }
}

/**
 * Outcome of submitting attribution for a batch of members.
 *
 * @category Referrals
 */
export class AttributionResult {
  /** How many members were newly attributed by this request. */
  readonly attributed: number;
  /** One entry per member id supplied, in the order supplied. */
  readonly results: readonly Readonly<{ memberId: number; outcome: AttributionOutcome }>[];

  /** @internal */
  constructor(wire: AttributionResultWire) {
    this.attributed = wire.attributed;
    this.results = Object.freeze(
      (wire.results ?? []).map((r) => Object.freeze({ memberId: r.memberId, outcome: r.outcome })),
    );
    Object.freeze(this);
  }

  /** Member ids with the given outcome. */
  withOutcome(outcome: AttributionOutcome): readonly number[] {
    return this.results.filter((r) => r.outcome === outcome).map((r) => r.memberId);
  }

  /**
   * Members already credited to somebody. These are the ones worth a human
   * look — it may be your own host, or it may be another ambassador.
   */
  get alreadyAttributed(): readonly number[] {
    return this.withOutcome('already_attributed');
  }

  /**
   * Members rejected because their account pre-dates the event's registration
   * page. The event did not recruit them, so no credit is due.
   */
  get predatedEvent(): readonly number[] {
    return this.withOutcome('account_predates_event');
  }
}
