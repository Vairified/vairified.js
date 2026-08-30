/**
 * {@link PartnerEvent}, {@link EventLocation} and {@link EventsPage} — the event
 * listing models.
 *
 * @module
 */
import type {
  EventsPageWire,
  PartnerEventClubWire,
  PartnerEventLocationWire,
  PartnerEventWire,
} from '../types.js';

/**
 * Where an event is held.
 *
 * ⛔ `latitude` and `longitude` are `null` when the event has never been
 * geocoded, never `0`. Zero is a real coordinate in the Gulf of Guinea, so using
 * it as "unknown" would place every un-located event on one pin in the ocean —
 * and a map would look like it were working.
 *
 * @category Events
 */
export class EventLocation {
  readonly venueName: string | null;
  readonly address: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly zip: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;

  /** @internal */
  constructor(wire: PartnerEventLocationWire) {
    this.venueName = wire.venueName ?? null;
    this.address = wire.address ?? null;
    this.city = wire.city ?? null;
    this.state = wire.state ?? null;
    this.zip = wire.zip ?? null;
    this.latitude = wire.latitude ?? null;
    this.longitude = wire.longitude ?? null;
    Object.freeze(this);
  }

  /** Whether this location can be placed on a map. */
  get hasCoordinates(): boolean {
    return this.latitude != null && this.longitude != null;
  }
}

/** The club organising an event. @category Events */
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
 * An event in the Vairified catalogue.
 *
 * `eventId` is the integer identifier every event-scoped endpoint takes — the
 * partner API does not accept UUIDs.
 *
 * @category Events
 */
export class PartnerEvent {
  readonly eventId: number;
  readonly name: string;
  readonly type: string;
  readonly status: string;
  readonly sport: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly club: EventClub | null;
  readonly location: EventLocation | null;
  readonly hostName: string | null;
  readonly isPrivate: boolean;
  readonly maxSpots: number | null;
  readonly maxTeams: number | null;
  readonly createdAt: string;

  /** @internal */
  constructor(wire: PartnerEventWire) {
    this.eventId = wire.eventId;
    this.name = wire.name;
    this.type = wire.type;
    this.status = wire.status;
    this.sport = wire.sport;
    this.startDate = wire.startDate ?? null;
    this.endDate = wire.endDate ?? null;
    this.club = wire.club ? new EventClub(wire.club) : null;
    this.location = wire.location ? new EventLocation(wire.location) : null;
    this.hostName = wire.hostName ?? null;
    this.isPrivate = wire.isPrivate;
    this.maxSpots = wire.maxSpots ?? null;
    this.maxTeams = wire.maxTeams ?? null;
    this.createdAt = wire.createdAt;
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
  readonly total: number;

  /** @internal */
  constructor(wire: EventsPageWire) {
    this.events = Object.freeze(wire.events.map((e) => new PartnerEvent(e)));
    this.total = wire.total;
    Object.freeze(this);
  }
}
