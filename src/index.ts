/**
 * Vairified JavaScript SDK
 *
 * Official TypeScript/JavaScript SDK for the Vairified Partner API.
 *
 * Features:
 * - Opaque external IDs (vair_mem_xxx format) for privacy
 * - OAuth-based player consent for data access
 * - Tiered access: public search vs connected member data
 *
 * @packageDocumentation
 * @module vairified
 */

export { Vairified, type VairifiedEnvironment } from './client.js';
export {
  AuthenticationError,
  NotFoundError,
  OAuthError,
  RateLimitError,
  VairifiedError,
  ValidationError,
} from './errors.js';
export {
  Match,
  MatchResult,
  Member,
  Player,
  RatingSplit,
  RatingSplits,
  RatingUpdate,
  SearchResults,
} from './models.js';
export {
  type AuthorizationResponse,
  DEFAULT_SCOPES,
  describeScope,
  describeScopes,
  generateState,
  getAuthorizationUrl,
  type OAuthConfig,
  type OAuthScope,
  SCOPES,
  type TokenResponse,
  validateScope,
} from './oauth.js';
export type {
  MatchApiData,
  MatchInput,
  MatchResultData,
  MemberData,
  PlayerSearchData,
  RatingSplitData,
  RatingSplitsData,
  RatingUpdateData,
  SearchFilters,
  SearchResultsData,
  VairifiedOptions,
} from './types.js';
