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
 * const member = await client.members.get('4873327');
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
 *       teams: [['4873327', '4873328'],
 *               ['4873329', '4873330']],
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
export type { WebhookRejectionReason } from './errors.js';
// ---- Error classes ----
export {
  AuthenticationError,
  NotFoundError,
  OAuthError,
  PermissionDeniedError,
  RateLimitError,
  ScoreEntryPausedError,
  ServiceUnavailableError,
  VairifiedError,
  ValidationError,
  WebhookSignatureError,
} from './errors.js';
// ---- Response models ----
export type {
  LeaderboardCategory,
  LeaderboardCategoryInfoWire,
  LeaderboardCategoryInput,
  LeaderboardCategoryLabel,
  PartnerSearchSortField,
  RatingSplit,
} from './models/index.js';
export {
  LEADERBOARD_CATEGORIES,
  LEADERBOARD_CATEGORY_LABELS,
  LeaderboardCategoryInfo,
  MatchBatchResult,
  Member,
  MemberEmailMatch,
  MemberSportMap,
  MembersByEmailResult,
  PARTNER_SEARCH_SORT_FIELDS,
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
// ---- Webhook event types ----
export type {
  ApiErrorResponse,
  ConnectionRevokedEventDataWire,
  ConnectionRevokedEventWire,
  EventCreatedClubWire,
  EventCreatedEventDataWire,
  EventCreatedEventWire,
  GameInput,
  Gender,
  LeaderboardOptions,
  MatchBatch,
  MatchBatchResultWire,
  MatchInput,
  MemberStatusEventDataWire,
  MemberStatusEventSportWire,
  MemberStatusEventWire,
  MemberStatusWire,
  MembersByEmailResultWire,
  OpenEnum,
  PartnerMemberEmailMatchWire,
  PartnerMemberWire,
  PartnerRatingUpdateWire,
  PlayerRankOptions,
  RatingSplitWire,
  RatingUpdatedEventDataWire,
  RatingUpdatedEventWire,
  RatingUpdatedSportWire,
  SearchFilters,
  SportRatingWire,
  TournamentImportResultWire,
  UnknownWebhookEventWire,
  VairifiedEnvironment,
  VairifiedOptions,
  VerifiedWebhookEvent,
  WebhookDeliveriesResultWire,
  WebhookDeliveryWire,
  WebhookEventEnvelopeWire,
} from './types.js';
export type { VerifyWebhookOptions } from './webhooks/verify.js';
// ---- Webhook verification (no client needed) ----
export {
  compareSequence,
  DEFAULT_TOLERANCE_SECONDS,
  dedupeKey,
  isConnectionRevokedEvent,
  isEventCreatedEvent,
  isMemberStatusEvent,
  isNewerSequence,
  isRatingUpdatedEvent,
  verifyWebhook,
} from './webhooks/verify.js';
