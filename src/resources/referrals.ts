/**
 * {@link ReferralsResource} — read and record ambassador referral credit.
 *
 * @module
 */

import { ValidationError } from '../errors.js';
import type { HttpTransport } from '../http.js';
import { AttributionResult, MembersAttributionResult } from '../models/attribution.js';
import type { AttributionResultWire, MembersAttributionResultWire } from '../types.js';

const MAX_IDS_PER_READ = 100;
const MAX_IDS_PER_WRITE = 500;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read and record which ambassador earns referral credit for a player.
 *
 * Each method needs its own API-key permission, granted per partner:
 * `key:referral:read` for {@link get} and `key:referral:write` for
 * {@link attribute}. Neither is implied by a general read, write or admin key —
 * reading attribution exposes who recruited whom, and writing it decides who
 * earns commission.
 *
 * @category Resources
 */
export class ReferralsResource {
  readonly #http: HttpTransport;

  /** @internal */
  constructor(http: HttpTransport) {
    this.#http = http;
  }

  /**
   * Who currently earns referral credit for these members.
   *
   * Use this before {@link attribute} to tell the two cases apart that matter:
   * a member already credited to your own event host (nothing to do) and one
   * credited to a different ambassador (a person should look, because claiming
   * it takes credit from them).
   *
   * @example
   * ```ts
   * const result = await client.referrals.get([4873327, 4873328]);
   *
   * for (const a of result.claimable) {
   *   console.log(a.memberId, 'has no credit yet');
   * }
   * console.log('no such member:', result.notFound);
   * ```
   *
   * @throws {@link ValidationError} If the list is empty or exceeds 100 ids.
   */
  async get(memberIds: readonly number[]): Promise<MembersAttributionResult> {
    if (memberIds.length === 0) {
      throw new ValidationError('At least one member id is required');
    }
    if (memberIds.length > MAX_IDS_PER_READ) {
      throw new ValidationError(`Maximum ${MAX_IDS_PER_READ} member ids per request`);
    }

    const wire = await this.#http.request<MembersAttributionResultWire>({
      method: 'GET',
      path: '/partner/members/attribution',
      query: { memberIds: memberIds.join(',') },
    });
    return new MembersAttributionResult({
      attributions: wire?.attributions ?? [],
      notFound: wire?.notFound ?? [],
    });
  }

  /**
   * Credit an ambassador for players their event recruited.
   *
   * `registrationPublishedAt` is the date the event's registration page was
   * **first published**. Accounts created before it did not come from the event
   * and are rejected with `account_predates_event`. VAIR applies that rule
   * itself, so every partner is held to the same one.
   *
   * VAIR cannot verify the date — it holds no record of your registration pages —
   * so the value you send is recorded for audit. Send the real one.
   *
   * Safe to retry: attribution is one-per-player forever, enforced by the
   * database, so a resubmitted player returns `already_attributed` and nothing
   * changes.
   *
   * @example
   * ```ts
   * const result = await client.referrals.attribute({
   *   referralCode: 'hillhurst-open',
   *   registrationPublishedAt: '2026-08-01',
   *   memberIds: [4873327, 4873328],
   * });
   *
   * console.log(result.attributed, 'newly credited');
   * console.log('need a human:', result.alreadyAttributed);
   * console.log('too old to credit:', result.predatedEvent);
   * ```
   *
   * @throws {@link ValidationError} If the list is empty or exceeds 500 ids, or
   * the date is not `YYYY-MM-DD`.
   */
  async attribute(input: {
    referralCode: string;
    registrationPublishedAt: string;
    memberIds: readonly number[];
  }): Promise<AttributionResult> {
    if (!input.referralCode.trim()) {
      throw new ValidationError('A referral code is required');
    }
    // Checked here so a typo fails immediately rather than as a 400 the caller
    // has to interpret — and because a wrong date silently changes who is
    // creditable, which is worse than an outright rejection.
    if (!ISO_DATE.test(input.registrationPublishedAt)) {
      throw new ValidationError(
        'registrationPublishedAt must be a calendar date formatted YYYY-MM-DD',
      );
    }
    if (input.memberIds.length === 0) {
      throw new ValidationError('At least one member id is required');
    }
    if (input.memberIds.length > MAX_IDS_PER_WRITE) {
      throw new ValidationError(`Maximum ${MAX_IDS_PER_WRITE} member ids per request`);
    }

    const wire = await this.#http.request<AttributionResultWire>({
      method: 'POST',
      path: '/partner/ambassador/attribution',
      body: {
        referralCode: input.referralCode.trim(),
        registrationPublishedAt: input.registrationPublishedAt,
        memberIds: [...input.memberIds],
      },
    });
    return new AttributionResult({
      attributed: wire?.attributed ?? 0,
      results: wire?.results ?? [],
    });
  }
}
