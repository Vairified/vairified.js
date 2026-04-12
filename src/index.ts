/**
 * Vairified SDK — Partner API v1.
 *
 * The Vairified Partner API lets you read player ratings, submit match
 * results, and subscribe to rating change notifications for
 * integrations in leagues, tournaments, and club-management software.
 *
 * ```ts
 * import { Vairified } from 'vairified';
 *
 * await using client = new Vairified({ apiKey: 'vair_pk_xxx' });
 *
 * // Look up a connected player
 * const member = await client.members.get('vair_mem_xxx');
 * console.log(member.name, member.ratingFor('pickleball'));
 *
 * // Auto-paginating search
 * for await (const player of client.members.search({ city: 'Austin' })) {
 *   console.log(player.displayName);
 * }
 *
 * // Submit a bulk match batch
 * const result = await client.matches.submit({
 *   sport: 'pickleball',
 *   winScore: 11,
 *   winBy: 2,
 *   bracket: '4.0 Doubles',
 *   event: 'Weekly League',
 *   matchDate: '2026-04-11T14:00:00Z',
 *   matches: [
 *     {
 *       identifier: 'm1',
 *       teams: [['vair_mem_aaa', 'vair_mem_bbb'],
 *               ['vair_mem_ccc', 'vair_mem_ddd']],
 *       games: [{ scores: [11, 8] }, { scores: [11, 5] }],
 *     },
 *   ],
 * });
 * console.log(`Submitted ${result.numGames} games`);
 * ```
 *
 * See https://vairified.github.io/vairified.js for full documentation.
 *
 * @packageDocumentation
 * @module vairified
 */

// ---- Client ----
export { ENVIRONMENTS, Vairified } from './client.js';
// ---- Error classes ----
export {
  AuthenticationError,
  NotFoundError,
  OAuthError,
  RateLimitError,
  VairifiedError,
  ValidationError,
} from './errors.js';

// ---- Response models ----
export {
  MatchBatchResult,
  Member,
  MemberSportMap,
  RatingUpdate,
  SportRating,
  TournamentImportResult,
  WebhookDeliveriesResult,
  WebhookDelivery,
} from './models/index.js';
export type {
  AuthorizationResponse,
  OAuthConfig,
  OAuthScope,
  TokenResponse,
} from './oauth.js';
// ---- OAuth helpers ----
export {
  DEFAULT_SCOPES,
  describeScope,
  describeScopes,
  generateState,
  getAuthorizationUrl,
  SCOPES,
  validateScope,
} from './oauth.js';
// ---- Resource classes (typically accessed via client.*) ----
export {
  LeaderboardResource,
  MatchesResource,
  MembersResource,
  OAuthResource,
  WebhooksResource,
} from './resources/index.js';
// ---- Types (request shapes + wire types) ----
export type {
  ApiErrorResponse,
  GameInput,
  Gender,
  LeaderboardOptions,
  MatchBatch,
  MatchBatchResultWire,
  MatchInput,
  MemberStatusWire,
  PartnerMemberWire,
  PartnerRatingUpdateWire,
  PlayerRankOptions,
  RatingSplitWire,
  SearchFilters,
  SportRatingWire,
  TournamentImportResultWire,
  VairifiedEnvironment,
  VairifiedOptions,
  WebhookDeliveriesResultWire,
  WebhookDeliveryWire,
} from './types.js';
