/**
 * {@link EventsResource} — browse the Vairified event catalogue.
 *
 * @module
 */
import type { HttpTransport } from '../http.js';
import { EventsPage } from '../models/event.js';
import type { EventsPageWire } from '../types.js';

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
}
