/**
 * {@link EventsResource} — browse the Vairified event catalogue.
 *
 * @module
 */
import type { HttpTransport } from '../http.js';
import { EventsPage, SubmittedEvent, WithdrawnEvent } from '../models/event.js';
import type {
  EventsPageWire,
  PartnerEventSubmissionWire,
  SubmittedEventWire,
  WithdrawnEventWire,
} from '../types.js';

/**
 * The event catalogue.
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
   * List events — what is on, near a point, within a date range.
   *
   * ⛔ `lat`, `lng` and `radiusMiles` go together. Sending one or two of them is
   * rejected by the API rather than ignored, because a half-applied location
   * filter would quietly return events nowhere near the point given. An event
   * with no coordinates is excluded from a radius search: it cannot be known to
   * be within the radius.
   *
   * Dates match on OVERLAP, so a multi-day event is returned when the window
   * falls anywhere inside it.
   *
   * @param options - Filters and pagination.
   * @param options.type - Container type, e.g. `'TOURNAMENT'`, `'LEAGUE'`, `'OPEN_PLAY'`.
   * @param options.dateFrom - ISO 8601. Events that have not ended before this.
   * @param options.dateTo - ISO 8601. Events that have not started after this.
   * @param options.lat - Latitude of the search centre.
   * @param options.lng - Longitude of the search centre.
   * @param options.type - Must be a real container type (`'TOURNAMENT'`,
   *   `'LEAGUE'`, `'OPEN_PLAY'`, ...). An unrecognised value is rejected by the
   *   API rather than ignored, because a dropped filter returns the whole
   *   catalogue and looks exactly like a working request.
   * @param options.radiusMiles - Search radius in miles, **1 to 250**. Above 250
   *   is rejected rather than narrowed, matching the cap the internal events
   *   search enforces.
   * @param options.mine - Only the events YOU submitted. Use this to reconcile your
   *   own catalogue: compare what should be listed against what is, and submit or
   *   withdraw the difference. Withdrawn listings are not returned.
   * @param options.limit - Results per page (1-100, default 20).
   * @param options.offset - Pagination offset.
   * @returns {@link EventsPage} with the events and the total before pagination.
   * @category Events
   *
   * @example
   * ```ts
   * const { events, total } = await client.events.list({
   *   type: 'TOURNAMENT',
   *   lat: 30.2849,
   *   lng: -97.7341,
   *   radiusMiles: 25,
   * });
   * ```
   */
  async list(options?: {
    type?: string;
    dateFrom?: string;
    dateTo?: string;
    lat?: number;
    lng?: number;
    radiusMiles?: number;
    mine?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<EventsPage> {
    const query: Record<string, string | number> = {};
    if (options?.type) query.type = options.type;
    if (options?.dateFrom) query.dateFrom = options.dateFrom;
    if (options?.dateTo) query.dateTo = options.dateTo;
    if (options?.lat != null) query.lat = options.lat;
    if (options?.lng != null) query.lng = options.lng;
    if (options?.radiusMiles != null) query.radiusMiles = options.radiusMiles;
    if (options?.mine) query.mine = 'true';
    if (options?.limit != null) query.limit = options.limit;
    if (options?.offset != null) query.offset = options.offset;

    const data = await this.#http.request<EventsPageWire>({
      method: 'GET',
      path: '/partner/events',
      query,
    });

    return new EventsPage(data);
  }

  /**
   * Submit one of YOUR events for listing in the Vairified directory.
   *
   * Vairified shows the event and sends players to your registration page. No
   * registration and no payment happens on Vairified, and no player data comes
   * back to you through this call.
   *
   * ⛔ RE-SUBMITTING IS HOW YOU EDIT. The listing is addressed by
   * `partnerEventId` — your own identifier, not Vairified's — so submitting the
   * same one again updates the listing in place. Republish freely whenever a
   * price or a date changes; `created` on the result tells you which happened.
   * Your identifiers are scoped to you, so another partner using the same string
   * is a different listing and neither of you can affect the other's.
   *
   * ⛔ ONE SUBMISSION IS ONE PLACE AT ONE TIME. An event running at four venues
   * is four submissions, each with its own `partnerEventId`, its own coordinates
   * and its own `registrationUrl`. One row for four venues puts a single pin on
   * a map for an event happening in four places.
   *
   * `latitude` and `longitude` go together — one without the other is rejected,
   * because a listing with half a coordinate cannot be placed and would never
   * appear in a radius search.
   *
   * Requires the `key:event:submit` scope, granted per partner, and an API key
   * linked to your partner application.
   *
   * @param submission - The event to list.
   * @returns {@link SubmittedEvent} with Vairified's id and whether it was created.
   * @category Events
   *
   * `sportCode` is REQUIRED and has no default. A submitted event carries no
   * sport of its own, so defaulting is how a padel event ends up listed as
   * pickleball; an unknown code is rejected rather than falling back.
   *
   * @example
   * ```ts
   * const listing = await client.events.submit({
   *   partnerEventId: 'autumn-doubles-avon',
   *   sportCode: 'pickleball',
   *   name: 'Autumn Doubles - Avon',
   *   type: 'TOURNAMENT',
   *   registrationUrl: 'https://example.com/register/autumn-doubles',
   *   location: { city: 'Avon', state: 'IN', latitude: 39.7628, longitude: -86.3997 },
   * });
   * console.log(listing.created ? 'listed' : 'updated');
   * ```
   */
  async submit(submission: PartnerEventSubmissionWire): Promise<SubmittedEvent> {
    const data = await this.#http.request<SubmittedEventWire>({
      method: 'POST',
      path: '/partner/events',
      body: submission,
    });

    return new SubmittedEvent(data);
  }

  /**
   * Withdraw one of your listings, addressed by the same `partnerEventId` you
   * submitted it under.
   *
   * ⛔ WITHDRAW WHATEVER STOPS BEING REAL. A programme that is cancelled,
   * finished or unpublished on your own site keeps its directory row until you
   * say otherwise, and that row keeps sending players to a page that no longer
   * takes them. That is worse than never having listed it.
   *
   * It is REVERSIBLE: submitting the same `partnerEventId` again restores the
   * listing at the same Vairified id, so links you have already shared keep
   * working. It is also IDEMPOTENT — withdrawing something already withdrawn
   * succeeds with `withdrawn: false`, so a batch is safe to retry.
   *
   * You can only withdraw your own. An identifier that is not yours is reported
   * as not found rather than forbidden.
   *
   * @param partnerEventId - Your identifier for the listing.
   * @returns {@link WithdrawnEvent}
   * @category Events
   *
   * @example
   * ```ts
   * await client.events.withdraw('autumn-doubles-avon');
   * ```
   */
  async withdraw(partnerEventId: string): Promise<WithdrawnEvent> {
    const data = await this.#http.request<WithdrawnEventWire>({
      method: 'DELETE',
      path: `/partner/events/${encodeURIComponent(partnerEventId)}`,
    });

    return new WithdrawnEvent(data);
  }
}
