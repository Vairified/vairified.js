/**
 * {@link EventsResource} — browse the Vairified event catalogue.
 *
 * @module
 */
import type { HttpTransport } from '../http.js';
import { EventsPage, SubmittedEvent } from '../models/event.js';
import type { EventsPageWire, PartnerEventSubmissionWire, SubmittedEventWire } from '../types.js';

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
   * @param options.radiusMiles - Search radius in miles.
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
   * @example
   * ```ts
   * const listing = await client.events.submit({
   *   partnerEventId: 'autumn-doubles-avon',
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
}
