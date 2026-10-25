/**
 * Vairified SDK — Partner API v1 wire types.
 *
 * These are the raw shapes the server returns or accepts. Request
 * types (e.g. {@link MatchBatch}, {@link SearchFilters}) are used as-is
 * by the SDK. Response types (e.g. {@link PartnerMemberWire}) are
 * wrapped in class instances by the SDK — see the `models/` folder.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Client options
// ---------------------------------------------------------------------------

/**
 * Environment preset for the Vairified API.
 *
 * @category Client
 */
export type VairifiedEnvironment = 'production' | 'staging' | 'local';

/**
 * Options passed to the {@link Vairified} constructor.
 *
 * @category Client
 */
export interface VairifiedOptions {
  /** Partner API key (`vair_pk_...`). Falls back to `VAIRIFIED_API_KEY`. */
  apiKey?: string;
  /** Environment preset. Falls back to `VAIRIFIED_ENV` or `'production'`. */
  env?: VairifiedEnvironment;
  /** Explicit base URL. Takes precedence over `env`. */
  baseUrl?: string;
  /** Request timeout in milliseconds. Defaults to 30_000 (30s). */
  timeoutMs?: number;
  /**
   * Inject a custom `fetch` implementation. Defaults to the global
   * `fetch`. Useful for test shims or non-Node environments.
   */
  fetch?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Normalized gender tokens emitted by the Partner API.
 *
 * @category Members
 */
export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';

// ---------------------------------------------------------------------------
// Rating data
// ---------------------------------------------------------------------------

/**
 * Raw rating split — one slice of a player's rating for a specific
 * category × age bracket.
 *
 * @category Members
 */
export interface RatingSplitWire {
  readonly rating: number;
  readonly abbr: string;
}

/**
 * Raw sport rating — a player's ratings for one sport.
 *
 * @category Members
 */
export interface SportRatingWire {
  readonly rating: number;
  readonly abbr: string;
  readonly ratingSplits: Readonly<Record<string, RatingSplitWire>>;
  // Per-sport status (Vairified#783). VAIRification and VAIR-Pro certs are
  // sport-scoped, so these live on each sport rather than the member `status`.
  // Optional so the SDK stays forward/backward-compatible with API responses
  // that predate #783; the model defaults them (isVairified/isRater/isVairPro →
  // false, isVairProStatus → null).
  readonly isVairified?: boolean;
  readonly isRater?: boolean;
  readonly isVairPro?: boolean;
  readonly isVairProStatus?: VairProStatus;
}

/**
 * VAIR-Pro lifecycle status in a sport: `'ACTIVE'` (approved, can rate),
 * `'PENDING'` (paid, awaiting approval), or `null` (not a VAIR Pro here).
 *
 * @category Members
 */
export type VairProStatus = 'PENDING' | 'ACTIVE' | null;

// ---------------------------------------------------------------------------
// Member
// ---------------------------------------------------------------------------

/**
 * Grouped member status flags — only the genuinely GLOBAL ones.
 *
 * VAIRification and VAIR-Pro status are per-sport (Vairified#783) and live on
 * each {@link SportRatingWire} entry (`member.sport.get(code)`), not here.
 *
 * @category Members
 */
export interface MemberStatusWire {
  readonly isWheelchair: boolean;
  readonly isAmbassador: boolean;
  /**
   * Whether the player currently holds a **paid VAIR+ membership** — the field to check when a
   * partner requires VAIR+ for entry.
   *
   * `false` covers both "never bought" and "bought once, no longer active", and is also `false`
   * during the automatic 30-day trial every new VAIR account receives: a trial is not a paid
   * membership.
   *
   * Not to be confused with the per-sport `isVairPro` / `isRater` on each
   * {@link SportRatingWire} — that is the VAIR **Pro** certified-rater programme, a different
   * product whose name differs by two characters.
   */
  readonly isVairPlus: boolean;
  readonly isConnected: boolean;
}

/**
 * Raw partner-facing member record returned by the Partner API.
 *
 * @category Members
 */
export interface PartnerMemberWire {
  readonly memberId: number;
  readonly id?: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  readonly displayName: string;
  readonly age?: number;
  readonly city?: string;
  readonly state?: string;
  readonly zip?: string;
  readonly country?: string;
  readonly memberSince?: string;
  readonly gender?: Gender;
  readonly status: MemberStatusWire;
  readonly sport?: Readonly<Record<string, SportRatingWire>>;
  readonly activeLeagues?: readonly string[];
  readonly email?: string;
  readonly grantedScopes?: readonly string[];
}

/**
 * One resolved address in a {@link MembersByEmailResultWire}.
 *
 * `members` is always an array: an email address is not a unique key in
 * VAIR, so one address can resolve to more than one member.
 *
 * @category Members
 */
export interface PartnerMemberEmailMatchWire {
  readonly email: string;
  readonly members: readonly PartnerMemberWire[];
}

/**
 * Raw envelope returned by `GET /partner/members/by-email`.
 *
 * Every requested address appears in exactly one of `matched` or
 * `notFound` — the endpoint never silently drops one.
 *
 * @category Members
 */
export interface MembersByEmailResultWire {
  readonly matched: readonly PartnerMemberEmailMatchWire[];
  readonly notFound: readonly string[];
}

// ---------------------------------------------------------------------------
// Rating updates
// ---------------------------------------------------------------------------

/**
 * Raw rating change notification.
 *
 * @category Members
 */
export interface PartnerRatingUpdateWire {
  readonly memberId: number;
  readonly id?: string;
  readonly displayName?: string;
  readonly sport?: string;
  readonly previousRating?: number;
  readonly newRating?: number;
  readonly changedAt?: string;
  readonly ratingSplits?: Readonly<Record<string, RatingSplitWire>>;
}

// ---------------------------------------------------------------------------
// Search filters (request)
// ---------------------------------------------------------------------------

/**
 * Filters accepted by {@link MembersResource.search}.
 *
 * Most callers pass these as keyword arguments directly to `search()`;
 * the SDK serializes them to query parameters for you.
 *
 * @category Members
 */
export interface SearchFilters {
  /** Sport code (e.g. `'pickleball'`) or list of codes. */
  sport?: string | readonly string[];
  /** Partial name match (first or last). */
  name?: string;
  /** Exact numeric member ID. */
  memberId?: number | string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
  location?: string;
  gender?: Gender | Lowercase<Gender>;
  /** When `true`, only return verified players. */
  vairifiedOnly?: boolean;
  /** When `true`, only return wheelchair players. */
  wheelchair?: boolean;
  /** Lower rating bound (2.0–8.0). */
  ratingMin?: number;
  /** Upper rating bound (2.0–8.0). */
  ratingMax?: number;
  /** Exact age. */
  age?: number;
  /** Lower age bound. */
  ageMin?: number;
  /** Upper age bound. */
  ageMax?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  /** Page size requested per HTTP request (server cap 100). Default 20. */
  pageSize?: number;
  /**
   * Maximum total results to iterate. When set, the async iterator
   * stops after yielding this many items, regardless of page count.
   */
  maxResults?: number;
}

// ---------------------------------------------------------------------------
// Match submission (request)
// ---------------------------------------------------------------------------

/**
 * One scored game within a {@link MatchInput}.
 *
 * `scores` contains one integer per team, in the same order as the
 * parent match's `teams` list. For a standard 2-team game that's
 * `[team1Score, team2Score]`. Longer lists are supported for
 * n-team matches.
 *
 * All other fields override the parent match's defaults for this
 * specific game (e.g. a championship game played to 15 when the rest
 * of the match was to 11).
 *
 * @category Matches
 */
export interface GameInput {
  readonly scores: readonly number[];
  readonly identifier?: string;
  readonly winScore?: number;
  readonly winBy?: number;
}

/**
 * One match to submit in a {@link MatchBatch}.
 *
 * A match is n-team × n-game:
 *
 * - `teams: [['p1', 'p2'], ['p3', 'p4']]` — standard doubles
 * - `teams: [['p1'], ['p2']]` — singles
 * - `teams: [['p1'], ['p2'], ['p3']]` — 3-way round robin
 *
 * Scores in each {@link GameInput} are parallel to the `teams` order.
 *
 * @category Matches
 */
export interface MatchInput {
  readonly identifier: string;
  readonly teams: readonly (readonly string[])[];
  readonly games: readonly GameInput[];

  // Optional per-match overrides of batch-level defaults
  readonly sport?: string;
  readonly bracket?: string;
  readonly event?: string;
  readonly location?: string;
  readonly matchDate?: string;
  readonly matchSource?: string;
  readonly matchType?: string;
  readonly winScore?: number;
  readonly winBy?: number;
  readonly extras?: Readonly<Record<string, unknown>>;
  readonly originalId?: string;
  readonly originalType?: string;
  readonly clubId?: number;
}

/**
 * Compressed bulk match submission.
 *
 * Top-level fields are defaults applied to every match in the
 * {@link matches} list. Any match can override any field. `sport`,
 * `winScore`, and `winBy` are **required** at the batch level — partners
 * must tell the rater which sport the matches are in and what the
 * winning conditions were so scores can be interpreted correctly.
 *
 * @category Matches
 */
export interface MatchBatch {
  readonly sport: string;
  readonly winScore: number;
  readonly winBy: number;
  readonly matches: readonly MatchInput[];

  // Optional batch-level defaults inherited by every match
  readonly bracket?: string;
  readonly event?: string;
  readonly location?: string;
  readonly matchDate?: string;
  readonly matchSource?: string;
  readonly matchType?: string;
  readonly extras?: Readonly<Record<string, unknown>>;
  readonly identifier?: string;
  readonly originalId?: string;
  readonly originalType?: string;
  readonly clubId?: number;
  readonly dryRun?: boolean;
}

// ---------------------------------------------------------------------------
// Match submission — response
// ---------------------------------------------------------------------------

/**
 * Raw result from a batch submission.
 *
 * @category Matches
 */
export interface MatchBatchResultWire {
  readonly success: boolean;
  readonly numMatches: number;
  readonly numGames: number;
  readonly dryRun?: boolean;
  readonly message?: string;
  readonly errors?: readonly string[];
}

// ---------------------------------------------------------------------------
// Leaderboards
// ---------------------------------------------------------------------------

/**
 * Filters for {@link LeaderboardResource.list}.
 *
 * @category Leaderboards
 */
export interface LeaderboardOptions {
  readonly category?: string;
  readonly ageBracket?: string;
  readonly scope?: string;
  readonly state?: string;
  readonly city?: string;
  readonly clubId?: string;
  readonly gender?: Gender | Lowercase<Gender>;
  readonly verifiedOnly?: boolean;
  readonly minGames?: number;
  readonly limit?: number;
  readonly offset?: number;
  readonly search?: string;
}

/**
 * Options for {@link LeaderboardResource.rank}.
 *
 * @category Leaderboards
 */
export interface PlayerRankOptions {
  readonly category?: string;
  readonly ageBracket?: string;
  readonly scope?: string;
  readonly state?: string;
  readonly city?: string;
  readonly clubId?: string;
  /** Number of players on either side of the target. Default 5. */
  readonly contextSize?: number;
}

// ---------------------------------------------------------------------------
// Tournament import — response
// ---------------------------------------------------------------------------

/**
 * Wire shape for tournament import response.
 *
 * @category Matches
 */
export interface TournamentImportCreatedGhostWire {
  readonly ref: string;
  readonly memberId: number;
}

export interface TournamentImportResultWire {
  readonly success: boolean;
  readonly matchesImported: number;
  readonly gamesRecorded: number;
  readonly ghostPlayersCreated: number;
  readonly existingPlayersMatched: number;
  readonly dryRun?: boolean;
  readonly message?: string;
  readonly errors?: readonly string[];
  readonly createdGhostMembers?: readonly TournamentImportCreatedGhostWire[];
}

// ---------------------------------------------------------------------------
// Webhook deliveries — response
// ---------------------------------------------------------------------------

/**
 * Wire shape for a single webhook delivery attempt.
 *
 * @category Webhooks
 */
export interface WebhookDeliveryWire {
  readonly id: string;
  readonly event: string;
  readonly url: string;
  readonly statusCode: number | null;
  readonly responseBody: string | null;
  readonly errorMessage: string | null;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastAttemptAt: string;
  readonly nextRetryAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Wire shape for paginated webhook delivery results.
 *
 * @category Webhooks
 */
export interface WebhookDeliveriesResultWire {
  readonly deliveries: readonly WebhookDeliveryWire[];
  readonly total: number;
}

// ---------------------------------------------------------------------------
// Partner events — Vairified#547, #1320
// ---------------------------------------------------------------------------

/**
 * The kinds of event a partner may LIST with {@link EventsResource.submit}.
 *
 * Narrower than the types {@link EventsResource.list} can return: the
 * catalogue also holds VAIR's own products (`RATING`, `POWRPIK`, `KASHKUP`)
 * and the internal structure of events VAIR runs, none of which a partner
 * listing can be.
 *
 * @category Events
 */
export type PartnerEventSubmissionType = OpenEnum<
  'LEAGUE' | 'TOURNAMENT' | 'EVENT' | 'LADDER' | 'CLINIC' | 'SOCIAL' | 'OPEN_PLAY'
>;

/**
 * Filters and pagination for {@link EventsResource.list}.
 *
 * @category Events
 */
export interface EventListOptions {
  /**
   * Only the listings YOUR app submitted with {@link EventsResource.submit}, so
   * you can reconcile your own catalogue: match them to your events by
   * `partnerEventId`, then submit or withdraw the difference.
   *
   * A listing you withdrew is not returned. A listing Vairified took down IS
   * returned, with `removed: true` — re-sending it is refused, so skip it.
   * Needs an API key linked to a partner app (a 400 otherwise). A key holding
   * only `key:event:submit` may list with `mine: true` and nothing else.
   */
  readonly mine?: boolean;
  /**
   * Event type, e.g. `'TOURNAMENT'`, `'LEAGUE'`, `'OPEN_PLAY'`. Omit for every
   * type. An unknown type is a 400, not an empty list.
   */
  readonly type?: string;
  /**
   * Only events that have not ended before this instant. An ISO 8601 date and
   * time **with its time zone** (`2026-09-01T00:00:00Z` or an offset such as
   * `-05:00`). A plain date, or a time with no zone, is refused with a
   * `ValidationError` before the request is sent.
   */
  readonly dateFrom?: string;
  /** Only events that have not started after this instant. Same format as `dateFrom`. */
  readonly dateTo?: string;
  /** Latitude of the search centre. Send `lat`, `lng` and `radiusMiles` together, or none. */
  readonly lat?: number;
  /** Longitude of the search centre. */
  readonly lng?: number;
  /**
   * Search radius in miles, 1 to **250**. A larger radius is a 400, never
   * quietly narrowed. An event with no coordinates is excluded from a radius
   * search.
   */
  readonly radiusMiles?: number;
  /** Results per page, 1 to 100. The API's default is 20. */
  readonly limit?: number;
  /** Pagination offset. */
  readonly offset?: number;
}

/**
 * Where an event is, as the API sends it.
 *
 * `latitude`/`longitude` are absent when the event has never been geocoded —
 * never `0`, which is a real place.
 *
 * @category Events
 */
export interface PartnerEventLocationWire {
  readonly venueName?: string;
  readonly address?: string;
  readonly city?: string;
  readonly state?: string;
  readonly zip?: string;
  readonly country?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

/** An event's organising club, as the API sends it. @category Events */
export interface PartnerEventClubWire {
  readonly name: string;
  readonly city?: string;
  readonly state?: string;
}

/** The member who created an event, as the API sends it. @category Events */
export interface PartnerEventCreatorWire {
  readonly memberId: number;
  readonly firstName: string;
  readonly lastName: string;
}

/**
 * An event, as the API sends it.
 *
 * Every field from `removed` down is returned **only on a listing your own app
 * submitted**; on anyone else's event they are absent.
 *
 * @category Events
 */
export interface PartnerEventWire {
  readonly eventId: number;
  /** Your identifier, present only on listings YOU submitted. */
  readonly partnerEventId?: string;
  readonly name: string;
  readonly type: string;
  readonly status: string;
  readonly sport: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly club?: PartnerEventClubWire;
  readonly location?: PartnerEventLocationWire;
  readonly hostName?: string;
  readonly winScore?: number;
  readonly winBy?: number;
  readonly isPrivate: boolean;
  readonly maxSpots?: number;
  readonly maxTeams?: number;
  /** Returned by {@link EventsResource.get} only, never by the list. */
  readonly createdBy?: PartnerEventCreatorWire;
  readonly createdAt: string;

  // ---- your own listings only ----
  readonly removed?: boolean;
  readonly description?: string;
  readonly registrationUrl?: string;
  readonly registrationDeadline?: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly registrationFee?: number;
  readonly playerFormat?: string;
  readonly gender?: string;
  readonly ratingMin?: number;
  readonly ratingMax?: number;
  readonly ratingType?: string;
  readonly ratingSystem?: string;
  readonly ageMin?: number;
  readonly ageMax?: number;
  readonly externalUrl?: string;
  readonly sponsorName?: string;
  readonly sponsorBannerUrl?: string;
  readonly logoSourceUrl?: string;
  readonly logoUrl?: string | null;
  readonly extras?: Record<string, unknown>;
}

/** A page of events, as the API sends it. @category Events */
export interface EventsPageWire {
  readonly events: readonly PartnerEventWire[];
  readonly total: number;
}

/**
 * One enrolled member of an event, as the API sends it.
 *
 * On one of YOUR OWN listings, a member who never connected your app, or who
 * disconnected it, comes back with `memberId`, `enrollmentStatus`, `isPaid`,
 * `source` and `lapsed` only, so the profile fields are optional. (A member
 * Vairified staff added who never connected your app also carries their name.)
 *
 * @category Events
 */
export interface PartnerEventMemberWire {
  readonly memberId: number;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly rating?: number;
  readonly isVairified?: boolean;
  readonly isVairPlus?: boolean;
  readonly enrollmentStatus: OpenEnum<'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'>;
  readonly isPaid: boolean;
  /** Your own listings only. */
  readonly source?: EventMemberSource;
  /** Your own listings only. */
  readonly lapsed?: boolean;
}

/**
 * Where a sign-up on one of your own listings came from: `PARTNER_LIST` is your
 * list ({@link EventsResource.setMembers}), `VAIR_SIGNUP` the member registered
 * on Vairified, `STAFF_ADD` Vairified staff registered them.
 *
 * @category Events
 */
export type EventMemberSource = OpenEnum<'PARTNER_LIST' | 'VAIR_SIGNUP' | 'STAFF_ADD'>;

/** An event's roster, as the API sends it. @category Events */
export interface EventMembersResultWire {
  readonly eventId: number;
  readonly sport: string;
  readonly members: readonly PartnerEventMemberWire[];
}

/**
 * Where a submitted event is.
 *
 * Treated as ONE field on a re-submit: leave `location` out to keep the stored
 * one, send `null` to clear it.
 *
 * @category Events
 */
export interface PartnerEventSubmissionLocation {
  readonly address?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly zip?: string | null;
  readonly country?: string | null;
  /**
   * Decimal degrees. Send it WITH `longitude`, or send neither. Coordinates you
   * send are used exactly as given; without them Vairified places the event
   * from its address.
   */
  readonly latitude?: number | null;
  readonly longitude?: number | null;
}

/**
 * What you send to {@link EventsResource.submit}.
 *
 * ⛔ **Leaving a field out keeps its current value; sending `null` clears it.**
 * An older client that does not know a newer field therefore cannot erase it
 * by re-sending. `location` counts as one field.
 *
 * ⛔ **Dates are ISO 8601 date-times WITH their time zone** — `Z` or an offset
 * such as `-05:00`. A plain date, or a time with no zone, is refused with a
 * `ValidationError` before the request is sent.
 *
 * ⛔ **One submission is one place at one time.** An event at four venues is
 * four submissions, each with its own `partnerEventId`, location and
 * `registrationUrl`; a recurring programme is one submission per date.
 *
 * The SDK refuses a date with no time zone before sending; every other field
 * limit is the API's, and the SDK does not pre-check it. Among them:
 * `maxSpots` and `maxTeams` are integers from 1 to **100,000**, and
 * `registrationFee` is 0 to 100,000.
 *
 * @category Events
 */
export interface PartnerEventSubmission {
  /**
   * YOUR identifier for this event. Submitting the same one again UPDATES the
   * listing rather than adding a second. Unique per partner app. Letters,
   * digits and `. _ : ~ -`, starting with a letter or digit, at most 200
   * characters.
   */
  readonly partnerEventId: string;
  /** The sport, by its Vairified code, e.g. `'pickleball'`. Required; no default. */
  readonly sportCode: string;
  readonly name: string;
  readonly type: PartnerEventSubmissionType;
  /**
   * `'CANCELLED'` cancels the event; `'UPCOMING'` lists it (and un-cancels a
   * cancelled one). Leave it out to keep the current status.
   */
  readonly status?: OpenEnum<'UPCOMING' | 'CANCELLED'> | null;
  /** Where a player registers. Required. http or https. */
  readonly registrationUrl: string;
  readonly description?: string | null;
  /** Start, with its time zone. Required on every submission and cannot be cleared. */
  readonly startDate: string;
  /**
   * End, with its time zone, after `startDate`. Required on every submission
   * and cannot be cleared: a submission without one is refused (400) with a
   * message saying the end date is required. An event whose end has passed can
   * no longer be submitted or updated — only withdrawn.
   */
  readonly endDate: string;
  /** When registration closes, with its time zone. */
  readonly registrationDeadline?: string | null;
  /** Who runs it, when that is not your own name. */
  readonly hostName?: string | null;
  readonly contactEmail?: string | null;
  readonly contactPhone?: string | null;
  /** Entry fee in USD, 0 to 100,000. Vairified takes no payment. */
  readonly registrationFee?: number | null;
  /** Capacity in individual players: an integer from 1 to 100,000. */
  readonly maxSpots?: number | null;
  /** Capacity in teams: an integer from 1 to 100,000. */
  readonly maxTeams?: number | null;
  readonly playerFormat?: OpenEnum<'singles' | 'doubles' | 'mixed'> | null;
  readonly gender?: OpenEnum<'male' | 'female' | 'mixed'> | null;
  /** Lowest rating allowed, 2.0 to 8.0. */
  readonly ratingMin?: number | null;
  /** Highest rating allowed, 2.0 to 8.0. */
  readonly ratingMax?: number | null;
  /** Which ratings count for the range. */
  readonly ratingType?: string | null;
  /** Rating system the event uses, e.g. `'VAIR'`, `'DUPR'`. */
  readonly ratingSystem?: string | null;
  /** Youngest age allowed, 1 to 99. */
  readonly ageMin?: number | null;
  /** Oldest age allowed, 1 to 99. */
  readonly ageMax?: number | null;
  readonly winScore?: number | null;
  readonly winBy?: number | null;
  /** A page with more about the event. http or https. */
  readonly externalUrl?: string | null;
  readonly sponsorName?: string | null;
  /** Sponsor banner image URL. http or https. */
  readonly sponsorBannerUrl?: string | null;
  /**
   * The event's logo: an **https** URL to a PNG, JPEG, GIF or WebP of at most
   * 2 MB. Vairified fetches it in the background and shows players its own
   * stored copy; the listing is saved whether or not the logo can be used. To
   * replace the image at the same address, send a new URL (a version in the
   * query string is enough). `null` removes it.
   */
  readonly logoUrl?: string | null;
  readonly location?: PartnerEventSubmissionLocation | null;
  /** Free-form data of your own, returned to you and never shown to players. At most 8 KB of JSON. */
  readonly extras?: Readonly<Record<string, unknown>> | null;
}

/** The result of a submission, as the API sends it. @category Events */
export interface SubmittedEventWire {
  readonly partnerEventId: string;
  readonly eventId: number;
  readonly created: boolean;
}

/** The result of a withdrawal, as the API sends it. @category Events */
export interface WithdrawnEventWire {
  readonly partnerEventId: string;
  readonly eventId: number;
  readonly withdrawn: boolean;
}

/**
 * Why a member on your list was not applied by {@link EventsResource.setMembers}.
 *
 * - `UNKNOWN_MEMBER`: no Vairified member has this number (including one merged
 *   into another account, or one deleting their account). That person's place on
 *   the listing is left as it was.
 * - `NOT_CONNECTED`: the member has never connected your app, is not a player
 *   your app created, and holds no current Vairified sign-up on this listing
 *   (never sent to a TRUSTED app).
 * - `DISCONNECTED`: the member disconnected your app (a TRUSTED app included)
 *   and holds no current Vairified sign-up on this listing. They can be listed
 *   again once they reconnect.
 *
 * Open, like the webhook enums: never branch on it exhaustively.
 *
 * @category Events
 */
export type EventRosterRefusalReason = OpenEnum<
  'UNKNOWN_MEMBER' | 'NOT_CONNECTED' | 'DISCONNECTED'
>;

/** One member your list named and the API did not apply, as the API sends it. @category Events */
export interface EventRosterRefusalWire {
  readonly memberId: number;
  readonly reason: EventRosterRefusalReason;
  readonly message: string;
}

/** The result of sending a listing's confirmed members, as the API sends it. @category Events */
export interface EventRosterResultWire {
  readonly partnerEventId: string;
  readonly eventId: number;
  readonly added: number;
  readonly confirmed: number;
  readonly unchanged: number;
  readonly removed: number;
  readonly refused: readonly EventRosterRefusalWire[];
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/**
 * Error envelope commonly returned by the Partner API on non-2xx status.
 *
 * @category Errors
 */
export interface ApiErrorResponse {
  readonly message?: string;
  readonly error?: string;
  readonly statusCode?: number;
}

// ---------------------------------------------------------------------------
// Ambassador referral attribution — Vairified#1130, #1131
// ---------------------------------------------------------------------------

export type AttributionOutcome =
  | 'attributed'
  | 'already_attributed'
  | 'account_predates_event'
  | 'not_found';

export interface MemberAttributionWire {
  readonly memberId: number;
  readonly attributed: boolean;
  readonly ambassadorMemberId?: number | null;
  readonly attributedAt?: string;
}

export interface MembersAttributionResultWire {
  readonly attributions?: readonly MemberAttributionWire[];
  readonly notFound?: readonly number[];
}

export interface AttributionResultWire {
  readonly attributed: number;
  readonly results?: readonly { readonly memberId: number; readonly outcome: AttributionOutcome }[];
}

// ---------------------------------------------------------------------------
// Webhook events — Vairified#1275
// ---------------------------------------------------------------------------

/**
 * A value the API documents today, without closing the set.
 *
 * `'a' | 'b' | (string & {})` keeps editor autocomplete for the known values
 * while still accepting one we have not seen. That matters more here than
 * anywhere else in this SDK: webhook payloads are produced by a service that
 * ships independently of this package, so a closed union is wrong the moment
 * the backend adds a value — and it fails at the worst possible time, in a
 * partner's live handler rather than at their compile step.
 *
 * Worked example: `connection.revoked` carried exactly one `reason` for its
 * whole life, and a second (`player_disconnected`) landed while this very file
 * was being written. A closed union would have shipped broken.
 *
 * @category Webhooks
 */
export type OpenEnum<Known extends string> = Known | (string & {});

/** One sport's VAIR Pro standing, as carried by a `member.status` event. */
export interface MemberStatusEventSportWire {
  /**
   * Whether the member is an **active** VAIR Pro (certified rater) **in this
   * sport** — the field to check before letting someone rate.
   *
   * :rotating_light: **`false` means "holds one, awaiting approval", not
   * "may rate".** Treat only `true` as permission. A member certified in
   * pickleball is not thereby certified in padel.
   */
  readonly isVairPro?: boolean;
  /** Documented alias of {@link isVairPro}, matching `GET /partner/member`. */
  readonly isRater?: boolean;
  readonly isVairProStatus?: OpenEnum<'ACTIVE' | 'PENDING'>;
}

/**
 * The `data` block of a `member.status` event.
 *
 * `sports` is always sent: a connected member's app holds every member
 * permission, so it is no longer withheld. An empty map means "holds no
 * current certification".
 *
 * :warning: A sport appears only while the member holds a **current**
 * certification in it. Expired and revoked certifications are not reported, so
 * a lapsed rater is indistinguishable here from someone who was never
 * certified. Do not use this map to answer "have they ever been a rater?".
 */
export interface MemberStatusEventDataWire {
  readonly memberId: number;
  readonly isVairPlus: boolean;
  readonly isAmbassador: boolean;
  /**
   * Per-sport VAIR Pro standing, keyed by sport code. Always sent now; `{}`
   * means the member holds no current certification. Still optional (and
   * nullable) in this type because `verifyWebhook()` hands over a delivery
   * queued before the change, or an explicit `null`, as it arrived rather than
   * refusing it.
   */
  readonly sports?: Record<string, MemberStatusEventSportWire> | null;
  /**
   * VAIR Pro standing **collapsed across every sport**: `ACTIVE` if any sport's
   * certification is active, else `PENDING` if any is pending, else `null`.
   *
   * :rotating_light: **This cannot answer "may this person rate my padel
   * event".** It is `ACTIVE` when the member is certified in *any* sport, so
   * using it as a per-sport permission grants a pickleball rater authority over
   * padel. Read {@link MemberStatusEventDataWire.sports} where the sport
   * matters; this field exists for partners who consumed it before `sports`
   * did, and for the GoHighLevel contact sync that mirrors it.
   */
  readonly vairProStatus: OpenEnum<'ACTIVE' | 'PENDING'> | null;
  readonly vairifiedRatingStatus: OpenEnum<'NONE' | 'PENDING_PAYMENT' | 'PAID' | 'COMPLETED'>;
  readonly changedAt: string;
  /**
   * Monotonic ordering token, compared only against other values for the SAME
   * member. **Not currently emitted by the API** — treat an absent value as
   * "cannot be ordered", never as zero, and order by `changedAt` until it
   * appears.
   */
  readonly sequence?: string;
}

/** The `data` block of a `connection.revoked` event. */
export interface ConnectionRevokedEventDataWire {
  readonly memberId: number | null;
  readonly reason: OpenEnum<'player_deleted' | 'player_disconnected'>;
  readonly revokedAt: string;
}

/** Fields every webhook event carries, whatever its type. */
export interface WebhookEventEnvelopeWire {
  readonly event: string;
  /** Stable event id. **Deduplicate on this** — delivery is at-least-once. */
  readonly eventId: string;
  readonly timestamp: string;
}

export interface MemberStatusEventWire extends WebhookEventEnvelopeWire {
  readonly event: 'member.status';
  readonly data: MemberStatusEventDataWire;
}

export interface ConnectionRevokedEventWire extends WebhookEventEnvelopeWire {
  readonly event: 'connection.revoked';
  readonly data: ConnectionRevokedEventDataWire;
}

/**
 * The `data` block of a `rating.updated` delivery.
 *
 * :rotating_light: **This is NOT {@link PartnerRatingUpdateWire}.** That type is
 * the shape `GET /partner/rating-updates` returns when you *poll*, and it still
 * carries the old per-sport diff (`previousRating` / `newRating`). The webhook
 * has sent a **full multi-sport snapshot** since Vairified#899, and the two have
 * not matched since. Reusing the poll type here is a mistake this SDK made once
 * and the reason this docstring exists.
 *
 * Rating webhooks are sent only to an app Vairified has approved; polling
 * (`members.ratingUpdates()`) needs only a working, unsuspended key.
 *
 * :warning: **A connected member's ratings are always included.** The
 * notification-only variant ({@link ratingDataWithheld} `true`, `sports`
 * **absent**, not empty) is no longer sent for a connected member. It can still
 * appear in your delivery log, for a delivery abandoned after the member
 * disconnected your app, and on a legacy pre-Connect subscription.
 */
/**
 * One sport's rating standing inside a `rating.updated` snapshot.
 *
 * :rotating_light: **Deliberately NOT {@link SportRatingWire}.** That type is the
 * POLLING shape: it declares `rating`, `abbr` and `ratingSplits` required and
 * closes `isVairProStatus` to two values. Reusing it here would let a partner
 * write an exhaustive switch the compiler accepts and the API then outgrows, and
 * would contradict the Python SDK, which types every field optional. Everything
 * here is open and optional for the same reason the enums are.
 */
export interface RatingUpdatedSportWire {
  readonly rating?: number;
  readonly abbr?: string;
  readonly ratingSplits?: Readonly<Record<string, RatingSplitWire>>;
  readonly isVairified?: boolean;
  readonly isRater?: boolean;
  readonly isVairPro?: boolean;
  readonly isVairProStatus?: OpenEnum<'ACTIVE' | 'PENDING'>;
}

export interface RatingUpdatedEventDataWire {
  readonly memberId: number;

  /**
   * The member's complete rating standing, keyed by sport code, at the moment
   * the computation finished — a **snapshot**, not a diff.
   *
   * Always present for a connected member. :rotating_light: **Absent on the
   * notification-only variant**, where absence means "the rating data was
   * withheld", which is not the same claim as "no ratings". Check
   * {@link ratingDataWithheld}.
   */
  readonly sports?: Readonly<Record<string, RatingUpdatedSportWire>> | null;

  /** When the rating computation that produced this state completed (ISO 8601). */
  readonly changedAt: string;

  /**
   * Monotonic ordering token. **Use it to discard stale deliveries.**
   *
   * :rotating_light: Because the payload is a **snapshot** rather than a diff, it
   * is order-dependent in a way the old diff payload was not. Deliveries run
   * concurrently with independent retry backoff, so two events for one member
   * **can arrive out of order** — and applying the older one last leaves you
   * holding a rating the member no longer has.
   *
   * :rotating_light: **Compare it as an INTEGER, never as a string.** It is an
   * unpadded decimal, so a string comparison is lexicographic and
   * `'10000000' > '9999999'` is `false`. At every power-of-ten crossing a
   * string-comparing receiver would discard every later delivery for that
   * member, permanently, and their rating would freeze at the stale value —
   * which is the exact failure this field exists to prevent. Use
   * `BigInt(a) > BigInt(b)`.
   *
   * So: keep the highest `sequence` you have applied **per member**, compared as
   * an integer, and discard any delivery whose value is lower. Compare it only against other values
   * **for the same member** — it is drawn from a platform-wide counter, so gaps
   * carry no meaning and values are not comparable across members. Sent as a
   * string because the value exceeds the safe integer range in some languages.
   *
   * Unlike `member.status`, where this field is declared but not yet emitted,
   * `rating.updated` carries it on **every** delivery, on both variants.
   */
  readonly sequence: string;

  /**
   * Present and `true` only on the notification variant, where {@link sports}
   * is absent by design rather than because nothing changed. It is no longer
   * sent for a connected member. You can still see it in your delivery log on a
   * delivery abandoned after the member disconnected your app, and on a legacy
   * pre-Connect subscription.
   */
  readonly ratingDataWithheld?: boolean;
}

export interface RatingUpdatedEventWire extends WebhookEventEnvelopeWire {
  readonly event: 'rating.updated';
  readonly data: RatingUpdatedEventDataWire;
}

/** The club an event belongs to, when it has one. */
export interface EventCreatedClubWire {
  readonly name: string;
  readonly city: string | null;
  readonly state: string | null;
}

/**
 * The `data` block of an `event.created` delivery.
 *
 * :warning: **`data.eventId` is a NUMBER and is not the envelope's `eventId`.**
 * The envelope's is the delivery's own string id, used for deduplication; this
 * one is the event's public number, the id a partner uses to refer to the event
 * itself. They shadow each other by name and share nothing else.
 *
 * This is the only **app-scoped** event — it concerns no particular member, so
 * it carries no `memberId`.
 */
export interface EventCreatedEventDataWire {
  readonly eventId: number;
  readonly name: string;
  readonly type: string;
  readonly status: string;
  readonly sport: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly club: EventCreatedClubWire | null;
  readonly hostName: string | null;
  readonly winScore: number | null;
  readonly winBy: number | null;
  readonly isPrivate: boolean;
  readonly maxSpots: number | null;
  readonly maxTeams: number | null;
  readonly createdBy: string | null;
  readonly createdAt: string;
}

export interface EventCreatedEventWire extends WebhookEventEnvelopeWire {
  readonly event: 'event.created';
  readonly data: EventCreatedEventDataWire;
}

/**
 * The `data` block of an `event.registration` delivery — a player signed up
 * for, or a pending sign-up was cancelled on, one of YOUR listings on Vairified.
 *
 * Sent to the app that owns the listing. Nothing your own app did is sent back
 * to you: your member list ({@link EventsResource.setMembers}) and your own
 * withdrawal send nothing.
 *
 * :warning: **`data.eventId` is a NUMBER and is not the envelope's `eventId`**,
 * exactly as on `event.created`: the envelope's is the delivery's own id (dedupe
 * on it), this one is your listing's Vairified event number.
 *
 * :warning: **The profile fields follow the member's connection.** They are
 * present when the member is connected to your app, your app is TRUSTED, or the
 * member is a placeholder your app created. A member who never connected your
 * app, or who disconnected it, comes with `memberId`, `action`, `source` and the
 * listing only (a member Vairified staff registered who never connected your
 * app also carries their name); after a disconnect you receive their member
 * number alone. The
 * notice never carries an email address or a phone number.
 *
 * Missed one? Delivery is at-least-once and retried for hours; after that, read
 * the listing's roster back with {@link EventsResource.members}, which shows
 * every sign-up waiting for you. There is no replay endpoint.
 */
export interface EventRegistrationEventDataWire {
  /** Your listing's Vairified event number. */
  readonly eventId: number;
  /** Your own id for the listing, as you sent it. */
  readonly partnerEventId: string | null;
  /** The member's Vairified member number. */
  readonly memberId: number;
  /**
   * `signed_up`: the member asked for a place on Vairified; it is pending until
   * your member list names them. `cancelled`: a pending place was taken back on
   * Vairified, or the member deleted their Vairified account, which ends every
   * place they held on your listings that have not finished, confirmed ones
   * included. A place on a listing that has finished stays as it is and you are
   * not told.
   */
  readonly action: OpenEnum<'signed_up' | 'cancelled'>;
  /**
   * Who did it: `player` (the member, including deleting their account) or
   * `staff` (Vairified staff, on the member's behalf).
   */
  readonly source: OpenEnum<'player' | 'staff'>;
  /** When it happened (ISO 8601). */
  readonly changedAt: string;
  /**
   * Present when the member is connected to your app, your app is TRUSTED, the
   * member is a placeholder your app created, or Vairified staff registered a
   * member who never connected to you. Absent for a member who disconnected your
   * app.
   */
  readonly firstName?: string;
  /** As {@link firstName}. */
  readonly lastName?: string;
  /** Whether the member holds a Vairified verified rating. With the profile only. */
  readonly isVairified?: boolean;
  /** Whether the member holds VAIR+ now. With the profile only. */
  readonly isVairPlus?: boolean;
  /**
   * The member's rating in the listing's sport, when the member is connected to
   * your app, your app is TRUSTED, or the member is your own placeholder.
   */
  readonly rating?: number;
}

export interface EventRegistrationEventWire extends WebhookEventEnvelopeWire {
  readonly event: 'event.registration';
  readonly data: EventRegistrationEventDataWire;
}

/**
 * Any event this SDK version does not model richly.
 *
 * Verification succeeds and `data` is handed over untouched. This is
 * deliberate: the signature is checked *before* the body is typed, so an
 * unrecognised event that reaches your handler is an authenticated one. If
 * this threw instead, every partner would break the day the API adds an event.
 */
export interface UnknownWebhookEventWire extends WebhookEventEnvelopeWire {
  readonly data: unknown;
}

/**
 * A verified webhook event. Narrow on `event` to reach the typed members.
 *
 * @category Webhooks
 */
export type VerifiedWebhookEvent =
  | MemberStatusEventWire
  | ConnectionRevokedEventWire
  | RatingUpdatedEventWire
  | EventCreatedEventWire
  | EventRegistrationEventWire
  | UnknownWebhookEventWire;
