/**
 * {@link PartnerEvent} and the models around it — the event catalogue, and
 * the results of submitting and withdrawing your own listings.
 *
 * @module
 */

import type {
  EventsPageWire,
  PartnerEventClubWire,
  PartnerEventCreatorWire,
  PartnerEventLocationWire,
  PartnerEventWire,
  SubmittedEventWire,
  WithdrawnEventWire,
} from '../types.js';

/**
 * Where an event is held.
 *
 * ⛔ `latitude` and `longitude` are `null` when the event has never been
 * geocoded, never `0`. Zero is a real coordinate in the Gulf of Guinea, so
 * using it as "unknown" would put every un-located event on one pin in the
 * ocean — and a map would look like it were working.
 *
 * @category Events
 */
export class EventLocation {
  readonly venueName: string | null;
  readonly address: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly zip: string | null;
  readonly country: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;

  /** @internal */
  constructor(wire: PartnerEventLocationWire) {
    this.venueName = wire.venueName ?? null;
    this.address = wire.address ?? null;
    this.city = wire.city ?? null;
    this.state = wire.state ?? null;
    this.zip = wire.zip ?? null;
    this.country = wire.country ?? null;
    this.latitude = wire.latitude ?? null;
    this.longitude = wire.longitude ?? null;
    Object.freeze(this);
  }

  /** Whether this location can be placed on a map. */
  get hasCoordinates(): boolean {
    return this.latitude != null && this.longitude != null;
  }
}

/**
 * The club organising an event. It names the organisation; {@link EventLocation}
 * names the place.
 *
 * @category Events
 */
export class EventClub {
  readonly name: string;
  readonly city: string | null;
  readonly state: string | null;

  /** @internal */
  constructor(wire: PartnerEventClubWire) {
    this.name = wire.name;
    this.city = wire.city ?? null;
    this.state = wire.state ?? null;
    Object.freeze(this);
  }
}

/**
 * The member who created an event, by public member id.
 *
 * @category Events
 */
export class EventCreator {
  readonly memberId: number;
  readonly firstName: string;
  readonly lastName: string;

  /** @internal */
  constructor(wire: PartnerEventCreatorWire) {
    this.memberId = wire.memberId;
    this.firstName = wire.firstName;
    this.lastName = wire.lastName;
    Object.freeze(this);
  }
}

/**
 * An event in the Vairified catalogue.
 *
 * `eventId` is the integer identifier every event-scoped endpoint takes — the
 * partner API does not accept UUIDs.
 *
 * ## Your own listings
 *
 * Every field from {@link removed} down is filled in **only on a listing your
 * own app submitted** with {@link EventsResource.submit}, under the names you
 * sent them; on anyone else's event each is `null`. {@link partnerEventId} is
 * the one to test: it is non-`null` exactly when the listing is yours.
 *
 * What comes back is not byte-for-byte what you sent: dates are UTC instants,
 * `status` is the live status (a finished event reads `COMPLETED`), and
 * `location` is the place Vairified resolved. Match listings by
 * `partnerEventId`, never by comparing every field.
 *
 * @category Events
 */
export class PartnerEvent {
  readonly eventId: number;
  /**
   * YOUR identifier for this listing — non-`null` only on events you submitted.
   * Another partner's identifiers are never returned to you.
   */
  readonly partnerEventId: string | null;
  readonly name: string;
  /** Event type, e.g. `'TOURNAMENT'`, `'LEAGUE'`, `'OPEN_PLAY'`. */
  readonly type: string;
  /** `'UPCOMING'`, `'IN_PROGRESS'`, `'COMPLETED'` or `'CANCELLED'`. */
  readonly status: string;
  /** Sport code, e.g. `'pickleball'`. */
  readonly sport: string;
  /** ISO 8601, UTC. */
  readonly startDate: string | null;
  /** ISO 8601, UTC. */
  readonly endDate: string | null;
  readonly club: EventClub | null;
  /** `null` for an online or not-yet-located event. */
  readonly location: EventLocation | null;
  readonly hostName: string | null;
  /** Points to win a game, when the event sets one. */
  readonly winScore: number | null;
  /** Win-by margin, when the event sets one. */
  readonly winBy: number | null;
  readonly isPrivate: boolean;
  readonly maxSpots: number | null;
  readonly maxTeams: number | null;
  /** Returned by {@link EventsResource.get} only; always `null` from the list. */
  readonly createdBy: EventCreator | null;
  /** ISO 8601 creation timestamp. */
  readonly createdAt: string;

  // ---- your own listings only ----

  /**
   * `true` when Vairified took your listing down. Re-sending it is refused, so
   * stop sending it. Only `list({ mine: true })` returns such a listing.
   */
  readonly removed: boolean | null;
  readonly description: string | null;
  readonly registrationUrl: string | null;
  readonly registrationDeadline: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly registrationFee: number | null;
  readonly playerFormat: string | null;
  readonly gender: string | null;
  readonly ratingMin: number | null;
  readonly ratingMax: number | null;
  readonly ratingType: string | null;
  readonly ratingSystem: string | null;
  readonly ageMin: number | null;
  readonly ageMax: number | null;
  readonly externalUrl: string | null;
  readonly sponsorName: string | null;
  readonly sponsorBannerUrl: string | null;
  /** The logo URL you sent. */
  readonly logoSourceUrl: string | null;
  /**
   * Vairified's stored copy of your logo — the one players see. `null` until it
   * is stored, and also when the image could not be used; with nothing stored,
   * submitting the same `logoUrl` again tries again.
   */
  readonly logoUrl: string | null;
  /** The free-form data you sent, returned as you sent it. */
  readonly extras: Readonly<Record<string, unknown>> | null;

  /** @internal */
  constructor(wire: PartnerEventWire) {
    this.eventId = wire.eventId;
    this.partnerEventId = wire.partnerEventId ?? null;
    this.name = wire.name;
    this.type = wire.type;
    this.status = wire.status;
    this.sport = wire.sport;
    this.startDate = wire.startDate ?? null;
    this.endDate = wire.endDate ?? null;
    this.club = wire.club ? new EventClub(wire.club) : null;
    this.location = wire.location ? new EventLocation(wire.location) : null;
    this.hostName = wire.hostName ?? null;
    this.winScore = wire.winScore ?? null;
    this.winBy = wire.winBy ?? null;
    this.isPrivate = wire.isPrivate;
    this.maxSpots = wire.maxSpots ?? null;
    this.maxTeams = wire.maxTeams ?? null;
    this.createdBy = wire.createdBy ? new EventCreator(wire.createdBy) : null;
    this.createdAt = wire.createdAt;

    this.removed = wire.removed ?? null;
    this.description = wire.description ?? null;
    this.registrationUrl = wire.registrationUrl ?? null;
    this.registrationDeadline = wire.registrationDeadline ?? null;
    this.contactEmail = wire.contactEmail ?? null;
    this.contactPhone = wire.contactPhone ?? null;
    this.registrationFee = wire.registrationFee ?? null;
    this.playerFormat = wire.playerFormat ?? null;
    this.gender = wire.gender ?? null;
    this.ratingMin = wire.ratingMin ?? null;
    this.ratingMax = wire.ratingMax ?? null;
    this.ratingType = wire.ratingType ?? null;
    this.ratingSystem = wire.ratingSystem ?? null;
    this.ageMin = wire.ageMin ?? null;
    this.ageMax = wire.ageMax ?? null;
    this.externalUrl = wire.externalUrl ?? null;
    this.sponsorName = wire.sponsorName ?? null;
    this.sponsorBannerUrl = wire.sponsorBannerUrl ?? null;
    this.logoSourceUrl = wire.logoSourceUrl ?? null;
    this.logoUrl = wire.logoUrl ?? null;
    this.extras = wire.extras ? Object.freeze({ ...wire.extras }) : null;
    Object.freeze(this);
  }
}

/**
 * A page of events, with the total before pagination.
 *
 * @category Events
 */
export class EventsPage {
  readonly events: readonly PartnerEvent[];
  /** Matching events across every page. */
  readonly total: number;

  /** @internal */
  constructor(wire: EventsPageWire) {
    this.events = Object.freeze((wire.events ?? []).map((e) => new PartnerEvent(e)));
    this.total = wire.total;
    Object.freeze(this);
  }
}

/**
 * A listing you submitted.
 *
 * `created` distinguishes the two things a submission can do. A partner that
 * believes it is creating and keeps seeing `false` is reusing a
 * `partnerEventId` it did not mean to.
 *
 * @category Events
 */
export class SubmittedEvent {
  /** The identifier you supplied, echoed back so a batch can be reconciled. */
  readonly partnerEventId: string;
  /**
   * Vairified's integer id for the listing. Stable across re-submissions,
   * withdrawal and restore; the id {@link EventsResource.get} takes.
   */
  readonly eventId: number;
  /** `true` when this call created the listing, `false` when it updated or restored one. */
  readonly created: boolean;

  /** @internal */
  constructor(wire: SubmittedEventWire) {
    this.partnerEventId = wire.partnerEventId;
    this.eventId = wire.eventId;
    this.created = wire.created;
    Object.freeze(this);
  }
}

/**
 * A listing you withdrew.
 *
 * `withdrawn` is `false` when it was already out of the directory. That is a
 * success, not an error — a reconciling partner retries whole batches, and
 * "already gone" is the expected state rather than a failure.
 *
 * @category Events
 */
export class WithdrawnEvent {
  /** The identifier you asked to withdraw, echoed back. */
  readonly partnerEventId: string;
  /** Vairified's integer id for the listing. */
  readonly eventId: number;
  /** `true` when this call withdrew it, `false` when it already was. */
  readonly withdrawn: boolean;

  /** @internal */
  constructor(wire: WithdrawnEventWire) {
    this.partnerEventId = wire.partnerEventId;
    this.eventId = wire.eventId;
    this.withdrawn = wire.withdrawn;
    Object.freeze(this);
  }
}
