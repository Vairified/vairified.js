/**
 * The `sortField` whitelist of `GET /partner/search`.
 *
 * @module
 */

/**
 * The fields `GET /partner/search` can sort by — every one a column the search
 * results already show. There is no rating sort: ratings are per sport and
 * category, so there is no single value to order by.
 *
 * @category Members
 */
export const PARTNER_SEARCH_SORT_FIELDS = Object.freeze([
  'lastName',
  'firstName',
  'memberId',
  'city',
  'state',
  'country',
] as const);

/**
 * One of {@link PARTNER_SEARCH_SORT_FIELDS}.
 *
 * @category Members
 */
export type PartnerSearchSortField = (typeof PARTNER_SEARCH_SORT_FIELDS)[number];
