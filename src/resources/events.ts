/**
 * {@link EventsResource} — the event catalogue, and your own listings in it.
 *
 * @module
 */

import { ValidationError } from '../errors.js';
import type { HttpTransport, QueryParams } from '../http.js';
import { EventsPage, PartnerEvent, SubmittedEvent, WithdrawnEvent } from '../models/event.js';
import { EventMembersResult, EventRosterResult } from '../models/event-members.js';
import type {
  EventListOptions,
  EventMembersResultWire,
  EventRosterResultWire,
  EventsPageWire,
  PartnerEventSubmission,
  PartnerEventWire,
  SubmittedEventWire,
  WithdrawnEventWire,
} from '../types.js';

/**
 * A date and time that states its own zone (`Z` or an offset), the same shape
 * the API accepts. The API refuses anything else; checking it here as well
 * fails a zoneless date before a request is spent on it, because without a
 * zone the instant meant cannot be known. Calendar validity (no 30 February)
 * is left to the API.
 */
const ZONED_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/;

/** Throw a {@link ValidationError} for a date field that is set and has no zone. */
function assertZoned(field: string, value: string | null | undefined): void {
  if (value === undefined || value === null) return;
  if (!ZONED_DATE_TIME.test(value)) {
    throw new ValidationError(
      `${field} must be a date and time with its time zone, e.g. 2026-11-14T09:00:00-05:00 or 2026-11-14T14:00:00Z`,
    );
  }
}

/**
 * The event catalogue, and your own listings in Vairified's events directory.
 *
 * ## Permissions
 *
 * - **Reading the catalogue** ({@link list}, {@link get}, {@link members})
 *   needs `key:event:read`, which comes with the TRUSTED package or is
 *   approved for your app on request.
 * - **Listing your own events** ({@link submit}, {@link withdraw},
 *   {@link setMembers}) needs `key:event:submit`, which comes with the VERIFIED package or is approved
 *   for your app on request. `key:write` and `key:admin` do not grant it. A
 *   key holding only `key:event:submit` can still read its OWN listings:
 *   `list({ mine: true })`, and `get` / `members` on its own event ids
 *   (anything else answers 404).
 *
 * A key without the scope gets a {@link VairifiedError} with `statusCode` 403.
 *
 * @category Resources
 */
export class EventsResource {
  readonly #http: HttpTransport;

  /** @internal */
  constructor(http: HttpTransport) {
    this.#http = http;
  }

  /**
   * List events — what is on, near a point, within a date range — one page at
   * a time.
   *
   * - **Location:** send `lat`, `lng` and `radiusMiles` together. One or two
   *   of them alone is a 400 rather than an ignored filter. `radiusMiles` is
   *   at most 250. An event with no coordinates is excluded from a radius
   *   search.
   * - **Dates:** `dateFrom`/`dateTo` match on OVERLAP, so a multi-day event is
   *   returned when the window falls anywhere inside it. Each must be a date
   *   and time **with its time zone**.
   * - **Your own listings:** `mine: true` returns only what your app submitted,
   *   each carrying its `partnerEventId`, `removed` and the fields you sent.
   *
   * Private, deleted and withdrawn events are never listed.
   *
   * @param options - Filters and pagination; see {@link EventListOptions}.
   * @returns {@link EventsPage} — this page's events and the total across pages.
   * @throws {@link ValidationError} before any request when `dateFrom` or
   *   `dateTo` has no time zone; and (400) for a filter the API refuses: a
   *   partial location, a radius over 250, an unknown type, or `mine` on a key
   *   not linked to a partner app.
   * @throws {@link VairifiedError} with `statusCode` 403 when the key lacks
   *   `key:event:read` (and, for `mine: true`, `key:event:submit`).
   * @category Events
   *
   * @example
   * ```ts
   * const page = await client.events.list({
   *   type: 'TOURNAMENT',
   *   lat: 30.2849,
   *   lng: -97.7341,
   *   radiusMiles: 25,
   *   dateFrom: '2026-11-01T00:00:00Z',
   * });
   * console.log(`${page.events.length} of ${page.total}`);
   *
   * // Reconcile your own listings
   * const mine = await client.events.list({ mine: true, limit: 100 });
   * for (const e of mine.events) {
   *   if (e.removed) continue; // taken down by Vairified; re-sending is refused
   *   console.log(e.partnerEventId, e.eventId);
   * }
   * ```
   */
  async list(options: EventListOptions = {}): Promise<EventsPage> {
    assertZoned('dateFrom', options.dateFrom);
    assertZoned('dateTo', options.dateTo);
    const query: QueryParams = {
      mine: options.mine,
      type: options.type,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      lat: options.lat,
      lng: options.lng,
      radiusMiles: options.radiusMiles,
      limit: options.limit,
      offset: options.offset,
    };
    const data = await this.#http.request<EventsPageWire>({
      method: 'GET',
      path: '/partner/events',
      query,
    });
    return new EventsPage(data);
  }

  /**
   * One event, by its integer id — typically the `eventId` from an
   * `event.created` webhook, or from {@link list}.
   *
   * On a listing your own app submitted, the event also carries your
   * `partnerEventId`, `removed` and the fields you sent.
   *
   * @param eventId - Integer event id. UUIDs are not accepted.
   * @throws {@link NotFoundError} when no such event exists, it was deleted, it
   *   is private and your app is not TRUSTED, it is a listing Vairified
   *   removed, or your key holds only `key:event:submit` and the event is not
   *   one of your listings.
   * @throws {@link VairifiedError} with `statusCode` 403 when the key holds
   *   neither `key:event:read` nor `key:event:submit`.
   * @category Events
   *
   * @example
   * ```ts
   * const event = await client.events.get(12345);
   * console.log(event.name, event.location?.city, event.createdBy?.memberId);
   * ```
   */
  async get(eventId: number): Promise<PartnerEvent> {
    const data = await this.#http.request<PartnerEventWire>({
      method: 'GET',
      path: `/partner/event/${encodeURIComponent(String(eventId))}`,
    });
    return new PartnerEvent(data);
  }

  /**
   * The players enrolled in an event, deduplicated, with each one's rating in
   * the event's sport — for seeding your own brackets and pairings.
   *
   * **On one of your own listings** the roster is readable by your app only
   * (to any other app it answers 404). It includes members who signed up on
   * Vairified and are **waiting for you** (`enrollmentStatus: 'PENDING'`), with
   * `source` and `lapsed` on every row; send them in your list
   * ({@link setMembers}) to confirm them. This read is also how you recover a
   * registration notice you missed. A member who has not allowed you their
   * profile, or who disconnected your app, comes back with their member number
   * and status only: their name, `isVairified` and `isVairPlus` are `null`.
   *
   * @param eventId - Integer event id.
   * @throws {@link NotFoundError} under the same conditions as {@link get}, and
   *   for another partner's listing.
   * @throws {@link VairifiedError} with `statusCode` 403 when the key holds
   *   neither `key:event:read` nor `key:event:submit`.
   * @category Events
   *
   * @example
   * ```ts
   * const roster = await client.events.members(12345);
   * for (const m of roster.members) {
   *   console.log(m.memberId, m.rating, m.isVairPlus);
   * }
   *
   * // On your own listing: who signed up on Vairified and is waiting for you?
   * const waiting = roster.members.filter((m) => m.enrollmentStatus === 'PENDING');
   * ```
   */
  async members(eventId: number): Promise<EventMembersResult> {
    const data = await this.#http.request<EventMembersResultWire>({
      method: 'GET',
      path: `/partner/event/${encodeURIComponent(String(eventId))}/members`,
    });
    return new EventMembersResult(data);
  }

  /**
   * List one of YOUR events in Vairified's events directory, or bring the
   * listing up to date.
   *
   * Players see it on that sport's events pages with your app's public name on
   * a badge. A player who registers on Vairified is held as pending for you
   * (you get an `event.registration` webhook and see them in {@link members})
   * and finishes on your `registrationUrl`; no payment happens on Vairified.
   * Your list ({@link setMembers}) is what confirms them.
   *
   * ⛔ **Re-submitting is how you edit.** The listing is keyed by your own
   * `partnerEventId`: the same id updates the same listing, keeping its
   * Vairified event number and page address. A listing you withdrew is
   * restored by submitting it again. Leaving a field out keeps its current
   * value; sending `null` clears it.
   *
   * **Cancel** with `status: 'CANCELLED'`; send `'UPCOMING'` to list it again.
   * An event whose end has passed can no longer be submitted (withdraw it
   * instead).
   *
   * `startDate` and `endDate` are both required, and neither can be cleared: a
   * submission without an end date is refused (400) with a message saying the
   * end date is required. Dates must carry their time zone, and
   * `maxSpots`/`maxTeams` are at most 100,000 — see
   * {@link PartnerEventSubmission}. A date with no time zone is
   * refused here, before the request is sent; every other field is checked by
   * the API, and the submission is sent as given (an omitted field stays
   * omitted, a `null` is sent as `null`).
   *
   * @param submission - The event to list.
   * @returns {@link SubmittedEvent} with Vairified's id and whether it was created.
   * @throws {@link ValidationError} before any request when `startDate`,
   *   `endDate` or `registrationDeadline` has no time zone; and (400) for a
   *   field the API refuses (the
   *   field-level messages are on `err.response`) — including a missing
   *   `endDate` — an unknown or retired `sportCode`, or an event that has
   *   already finished.
   * @throws {@link VairifiedError} with `statusCode` 403 when the key lacks
   *   `key:event:submit`, is not linked to a partner app, or the listing was
   *   removed by Vairified (re-sending it will keep failing; contact
   *   Vairified).
   * @throws {@link VairifiedError} with `statusCode` 409 when the listing
   *   changed while saving. Send it again.
   * @category Events
   *
   * @example
   * ```ts
   * const listing = await client.events.submit({
   *   partnerEventId: 'autumn-doubles-avon',
   *   sportCode: 'pickleball',
   *   name: 'Autumn Doubles - Avon',
   *   type: 'TOURNAMENT',
   *   registrationUrl: 'https://example.com/register/autumn-doubles',
   *   startDate: '2026-11-14T09:00:00-05:00',
   *   endDate: '2026-11-15T17:00:00-05:00',
   *   maxTeams: 32,
   *   location: { city: 'Avon', state: 'IN' },
   * });
   * console.log(listing.created ? 'listed' : 'updated', listing.eventId);
   * ```
   */
  async submit(submission: PartnerEventSubmission): Promise<SubmittedEvent> {
    assertZoned('startDate', submission.startDate);
    assertZoned('endDate', submission.endDate);
    assertZoned('registrationDeadline', submission.registrationDeadline);
    const data = await this.#http.request<SubmittedEventWire>({
      method: 'POST',
      path: '/partner/events',
      body: submission,
    });
    return new SubmittedEvent(data);
  }

  /**
   * Take one of your listings out of the directory, by the `partnerEventId`
   * you submitted it under.
   *
   * Reversible: submitting the same `partnerEventId` again restores it at the
   * same Vairified event number and page address. Idempotent: withdrawing a
   * listing that is already out of the directory succeeds with
   * `withdrawn: false`, so a batch is safe to retry.
   *
   * @param partnerEventId - Your identifier for the listing.
   * @returns {@link WithdrawnEvent}
   * @throws {@link NotFoundError} when you have no listing with that id.
   * @throws {@link VairifiedError} with `statusCode` 403 when the key lacks
   *   `key:event:submit` or is not linked to a partner app.
   * @category Events
   *
   * @example
   * ```ts
   * const result = await client.events.withdraw('autumn-doubles-avon');
   * console.log(result.withdrawn ? 'withdrawn' : 'was already out');
   * ```
   */
  async withdraw(partnerEventId: string): Promise<WithdrawnEvent> {
    const data = await this.#http.request<WithdrawnEventWire>({
      method: 'DELETE',
      path: `/partner/events/${encodeURIComponent(partnerEventId)}`,
    });
    return new WithdrawnEvent(data);
  }

  /**
   * Send your WHOLE confirmed list for one of your listings, by Vairified
   * member number, keyed by the `partnerEventId` you submitted it under. Send
   * it whenever your roster changes; the listing's Vairified page then shows
   * these members as going.
   *
   * ⛔ **The whole list, every time.** A member confirmed before and missing now
   * is cancelled (their Vairified page shows it as cancelled by your app, and
   * they can register again). An empty list clears the roster. Sending the same
   * list again changes nothing. A list longer than the listing's capacity is
   * accepted. At most 2000 member numbers; repeated numbers count once.
   *
   * **Members who signed up on Vairified** and are waiting for you (`PENDING`
   * in {@link members}) are confirmed when your list includes them, and left
   * waiting when it does not.
   *
   * **Who you may list:** a member who gave your app the events permission
   * (`user:event:register`, asked for in your Connect link), a player your app
   * created, or anyone with a current Vairified sign-up on this listing. A
   * TRUSTED app may list any Vairified member who has not disconnected it. A
   * member who disconnected your app, TRUSTED or not, can be listed only where
   * they hold a current Vairified sign-up on this listing. Anyone else comes
   * back in {@link EventRosterResult.refused} with the reason
   * (`NO_EVENTS_PERMISSION`, `DISCONNECTED`, or `UNKNOWN_MEMBER` for a number
   * that no longer names a member, whose place is then left as it was);
   * everyone else on the list is still applied.
   *
   * No registration notice is sent for changes your own list makes. The list
   * is sent as given; the API checks it.
   *
   * @param partnerEventId - Your identifier for the listing.
   * @param memberIds - Every member confirmed on the listing, by member number.
   * @returns {@link EventRosterResult} — the counts, and who was refused.
   * @throws {@link ValidationError} (400) for a list the API refuses: more than
   *   2000 numbers, or anything that is not a whole member number.
   * @throws {@link NotFoundError} when you have no listing with that id.
   * @throws {@link VairifiedError} with `statusCode` 403 when the key lacks
   *   `key:event:submit`, is not linked to a partner app, or the listing was
   *   removed by Vairified.
   * @throws {@link VairifiedError} with `statusCode` 409 when the listing is
   *   withdrawn (submit it again first) or cancelled.
   * @category Events
   *
   * @example
   * ```ts
   * const result = await client.events.setMembers('autumn-doubles-avon', [4873327, 4873330]);
   * console.log(result.added, result.confirmed, result.unchanged, result.removed);
   * for (const r of result.refused) {
   *   console.log(r.memberId, r.reason, r.message); // e.g. DISCONNECTED
   * }
   * ```
   */
  async setMembers(
    partnerEventId: string,
    memberIds: readonly number[],
  ): Promise<EventRosterResult> {
    const data = await this.#http.request<EventRosterResultWire>({
      method: 'PUT',
      path: `/partner/events/${encodeURIComponent(partnerEventId)}/members`,
      body: { memberIds },
    });
    return new EventRosterResult(data);
  }
}
