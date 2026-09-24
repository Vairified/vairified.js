/**
 * {@link RatingUpdate} — a single rating change notification.
 *
 * @module
 */

import type { PartnerRatingUpdateWire, RatingSplitWire } from '../types.js';

/**
 * A single rating change notification.
 *
 * Returned by {@link MembersResource.ratingUpdates} — the **polling** endpoint,
 * and only that.
 *
 * :rotating_light: **This is NOT the `rating.updated` webhook payload.** It was,
 * once; the webhook has sent a full multi-sport snapshot since Vairified#899
 * and the two shapes have not matched since. The webhook's is
 * {@link RatingUpdatedEventDataWire}, reachable through `verifyWebhook`. This
 * sentence used to claim otherwise, and a later change believed it.
 *
 * @category Members
 */
export class RatingUpdate {
  readonly memberId: number;
  readonly id: string | null;
  readonly displayName: string | null;
  readonly sport: string | null;
  readonly previousRating: number | null;
  readonly newRating: number | null;
  readonly changedAt: string | null;
  readonly ratingSplits: Readonly<Record<string, RatingSplitWire>> | null;

  constructor(wire: PartnerRatingUpdateWire) {
    this.memberId = wire.memberId;
    this.id = wire.id ?? null;
    this.displayName = wire.displayName ?? null;
    this.sport = wire.sport ?? null;
    this.previousRating = wire.previousRating ?? null;
    this.newRating = wire.newRating ?? null;
    this.changedAt = wire.changedAt ?? null;
    this.ratingSplits = wire.ratingSplits ? Object.freeze({ ...wire.ratingSplits }) : null;
    Object.freeze(this);
  }

  /**
   * Rating change amount — `newRating - previousRating`. Returns `null`
   * if either rating is missing from the update payload.
   */
  get delta(): number | null {
    if (this.previousRating === null || this.newRating === null) {
      return null;
    }
    return this.newRating - this.previousRating;
  }

  /** `true` when the new rating is strictly higher than the previous. */
  get improved(): boolean {
    const delta = this.delta;
    return delta !== null && delta > 0;
  }

  toString(): string {
    const arrow = this.improved ? '↑' : '↓';
    const prev = this.previousRating !== null ? this.previousRating.toFixed(3) : '?';
    const next = this.newRating !== null ? this.newRating.toFixed(3) : '?';
    const name = this.displayName ? ` '${this.displayName}'` : '';
    return `RatingUpdate #${this.memberId}${name} ${prev} ${arrow} ${next}`;
  }
}
