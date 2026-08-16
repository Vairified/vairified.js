/**
 * {@link MembersResource} — member lookups, search, and rating updates.
 *
 * @module
 */

import { ValidationError } from '../errors.js';
import type { HttpTransport, QueryParams } from '../http.js';
import { Member } from '../models/member.js';
import { MembersByEmailResult } from '../models/members-by-email-result.js';
import { RatingUpdate } from '../models/rating-update.js';
import type {
  MembersByEmailResultWire,
  PartnerMemberWire,
  PartnerRatingUpdateWire,
  SearchFilters,
} from '../types.js';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_EMAILS_PER_LOOKUP = 100;

/**
 * Member operations — get a single member, auto-paginating search,
 * find by name, and polling for rating change notifications.
 *
 * @category Resources
 */
export class MembersResource {
  readonly #http: HttpTransport;

  /** @internal */
  constructor(http: HttpTransport) {
    this.#http = http;
  }

  /**
   * Get a connected member by external ID.
   *
   * **Requires an active OAuth connection** between your partner app
   * and the player. Use the OAuth flow on `client.oauth` first.
   *
   * @param playerId External player ID in `vair_mem_xxx` format.
   * @param options.sport Optional sport filter — single code or list.
   *   When omitted, the response contains every sport the player has
   *   ratings in.
   * @throws {@link NotFoundError} if the external ID is unknown.
   * @throws {@link VairifiedError} if the player has not connected to
   *   your app (403) or the request otherwise fails.
   *
   * @example
   * ```ts
   * const member = await client.members.get('vair_mem_xxx');
   * console.log(member.name, member.ratingFor('pickleball'));
   *
   * // Just pickleball
   * const member2 = await client.members.get('vair_mem_xxx', { sport: 'pickleball' });
   *
   * // Multiple sports
   * const member3 = await client.members.get('vair_mem_xxx', {
   *   sport: ['pickleball', 'padel'],
   * });
   * ```
   */
  async get(
    playerId: string,
    options: { sport?: string | readonly string[] } = {},
  ): Promise<Member> {
    const query: Record<string, string> = { memberId: playerId };
    if (options.sport !== undefined) {
      query.sport = Array.isArray(options.sport)
        ? (options.sport as readonly string[]).join(',')
        : (options.sport as string);
    }
    const wire = await this.#http.request<PartnerMemberWire>({
      method: 'GET',
      path: '/partner/member',
      query,
    });
    return new Member(wire);
  }

  /**
   * Search for members, yielding each match as a {@link Member}.
   *
   * This is an **auto-paginating async iterator** — it fetches pages
   * from the server lazily as you iterate, so you can stream through
   * thousands of results without holding them all in memory:
   *
   * ```ts
   * for await (const m of client.members.search({ city: 'Austin' })) {
   *   console.log(m.name, m.ratingFor('pickleball'));
   * }
   * ```
   *
   * Stop early by `break`-ing out of the loop, or cap the total with
   * `maxResults`.
   */
  async *search(filters: SearchFilters = {}): AsyncGenerator<Member, void, void> {
    const pageSize = Math.min(filters.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const maxResults = filters.maxResults;

    const baseQuery = buildSearchQuery(filters, pageSize);

    let offset = 0;
    let yielded = 0;

    while (true) {
      const query: QueryParams = { ...baseQuery, offset };
      const data = await this.#http.request<
        PartnerMemberWire[] | { players?: PartnerMemberWire[] }
      >({ method: 'GET', path: '/partner/search', query });

      const batch: PartnerMemberWire[] = Array.isArray(data) ? data : (data?.players ?? []);

      if (batch.length === 0) {
        return;
      }

      for (const wire of batch) {
        yield new Member(wire);
        yielded += 1;
        if (maxResults !== undefined && yielded >= maxResults) {
          return;
        }
      }

      if (batch.length < pageSize) {
        return;
      }
      offset += pageSize;
    }
  }

  /**
   * Return the first search hit for a name, or `null`.
   *
   * Convenience for the common "look up by name" case:
   *
   * ```ts
   * const mike = await client.members.find('Mike Barker');
   * if (mike) {
   *   console.log(mike.ratingFor('pickleball'));
   * }
   * ```
   */
  async find(name: string): Promise<Member | null> {
    for await (const member of this.search({ name, pageSize: 1, maxResults: 1 })) {
      return member;
    }
    return null;
  }

  /**
   * Fetch up to 100 members by their member IDs in one call.
   *
   * Unknown IDs are silently omitted — the returned array may be
   * shorter than the input. Results are returned in the same order
   * as the input IDs.
   *
   * @param ids - Array of integer member IDs (max 100).
   * @param options - Optional filters.
   * @param options.sport - Sport code to scope ratings (e.g. `'pickleball'`).
   * @returns Array of {@link Member} instances.
   * @throws {@link ValidationError} If more than 100 IDs are provided.
   * @category Members
   *
   * @example
   * ```ts
   * const members = await client.members.getBulk([4873327, 4873328]);
   * for (const m of members) {
   *   console.log(m.name, m.ratingFor('pickleball'));
   * }
   * ```
   */
  async getBulk(ids: number[], options?: { sport?: string }): Promise<Member[]> {
    if (ids.length > 100) {
      throw new ValidationError('Maximum 100 member IDs per request');
    }
    const query: Record<string, string> = { ids: ids.join(',') };
    if (options?.sport) query.sport = options.sport;
    const rows = await this.#http.request<PartnerMemberWire[]>({
      method: 'GET',
      path: '/partner/members',
      query,
    });
    return rows.map((row) => new Member(row));
  }

  /**
   * Resolve up to 100 members by their **exact** email address.
   *
   * Use this to link your users to their VAIR identity when you hold
   * their email but not their member ID — e.g. resolving a tournament
   * roster at registration instead of waiting for each player to
   * complete SSO.
   *
   * **Requires the `key:player:lookup` scope**, which is granted per
   * partner on approval. Holding `key:player:search` does not imply it.
   *
   * Matching is exact and case-insensitive; there is deliberately no
   * partial, prefix or fuzzy matching. Every address you supply comes
   * back in either `matched` or `notFound`, so read `notFound` directly
   * instead of diffing your input against the results.
   *
   * A `notFound` address is **not** proof the person has no VAIR
   * account — unclaimed imported records are excluded from this lookup.
   *
   * @param emails - Email addresses to resolve (max 100).
   * @param options - Optional filters.
   * @param options.sport - Sport code to scope ratings (e.g. `'pickleball'`).
   * @throws {@link ValidationError} If more than 100 addresses are
   *   provided, or the list is empty.
   * @category Members
   *
   * @example
   * ```ts
   * const result = await client.members.getByEmail([
   *   'ada@example.com',
   *   'nobody@example.com',
   * ]);
   *
   * for (const match of result.matched) {
   *   const member = match.sole; // null when the address is ambiguous
   *   if (member) console.log(match.email, '->', member.memberId);
   * }
   *
   * console.log('no VAIR account found for:', result.notFound);
   * ```
   */
  async getByEmail(
    emails: readonly string[],
    options?: { sport?: string },
  ): Promise<MembersByEmailResult> {
    // Validate before the round trip so the caller gets a typed error
    // rather than a 400 they have to interpret.
    if (emails.length === 0) {
      throw new ValidationError('At least one email address is required');
    }
    if (emails.length > MAX_EMAILS_PER_LOOKUP) {
      throw new ValidationError(`Maximum ${MAX_EMAILS_PER_LOOKUP} email addresses per request`);
    }
    // A comma inside an entry would split into two addresses server-side
    // and silently shift every result — reject it rather than send it.
    const offender = emails.find((e) => e.includes(','));
    if (offender !== undefined) {
      throw new ValidationError(`Email address must not contain a comma: ${offender}`);
    }

    const query: Record<string, string> = { emails: emails.join(',') };
    if (options?.sport) query.sport = options.sport;
    const wire = await this.#http.request<MembersByEmailResultWire>({
      method: 'GET',
      path: '/partner/members/by-email',
      query,
    });
    return new MembersByEmailResult({
      matched: wire?.matched ?? [],
      notFound: wire?.notFound ?? [],
    });
  }

  /**
   * Poll for rating change notifications.
   *
   * Returns a list of {@link RatingUpdate} objects for every player
   * whose rating has changed since the last poll. Members are
   * considered subscribed when they have an active OAuth connection
   * with the `user:webhook:subscribe` scope.
   */
  async ratingUpdates(): Promise<readonly RatingUpdate[]> {
    const data = await this.#http.request<{ updates?: PartnerRatingUpdateWire[] } | unknown>({
      method: 'GET',
      path: '/partner/rating-updates',
    });
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return [];
    }
    const updates = (data as { updates?: PartnerRatingUpdateWire[] }).updates ?? [];
    return updates.map((wire) => new RatingUpdate(wire));
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildSearchQuery(filters: SearchFilters, pageSize: number): QueryParams {
  const query: Record<string, string | number | boolean> = {};

  if (filters.sport !== undefined) {
    query.sport = Array.isArray(filters.sport)
      ? (filters.sport as readonly string[]).join(',')
      : (filters.sport as string);
  }

  if (filters.memberId !== undefined) {
    query.member = String(filters.memberId);
  } else if (filters.name !== undefined) {
    query.member = filters.name;
  }

  if (filters.city !== undefined) query.city = filters.city;
  if (filters.state !== undefined) query.state = filters.state;
  if (filters.country !== undefined) query.country = filters.country;
  if (filters.zip !== undefined) query.zip = filters.zip;
  if (filters.location !== undefined) query.location = filters.location;

  if (filters.gender !== undefined) {
    query.gender = filters.gender.toUpperCase();
  }
  if (filters.vairifiedOnly !== undefined) query.vairified = filters.vairifiedOnly;
  if (filters.wheelchair !== undefined) query.wheelchair = filters.wheelchair;

  if (filters.ratingMin !== undefined) query.rating1 = filters.ratingMin;
  if (filters.ratingMax !== undefined) query.rating2 = filters.ratingMax;

  const { ageFilterType, age1, age2 } = resolveAgeFilter(filters);
  if (ageFilterType !== undefined) query.ageFilterType = ageFilterType;
  if (age1 !== undefined) query.age1 = age1;
  if (age2 !== undefined) query.age2 = age2;

  if (filters.sortBy !== undefined) query.sortField = filters.sortBy;
  if (filters.sortOrder !== undefined) query.sortDirection = filters.sortOrder;

  query.limit = pageSize;

  return query;
}

function resolveAgeFilter(filters: SearchFilters): {
  ageFilterType?: string;
  age1?: number;
  age2?: number;
} {
  if (filters.age !== undefined) {
    return { ageFilterType: 'exact', age1: filters.age };
  }
  if (filters.ageMin !== undefined && filters.ageMax !== undefined) {
    return { ageFilterType: 'range', age1: filters.ageMin, age2: filters.ageMax };
  }
  if (filters.ageMin !== undefined) {
    return { ageFilterType: 'above', age1: filters.ageMin };
  }
  if (filters.ageMax !== undefined) {
    return { ageFilterType: 'below', age1: filters.ageMax };
  }
  return {};
}
