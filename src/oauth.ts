/**
 * Vairified OAuth helpers and type definitions.
 *
 * Use the {@link OAuthResource} on `client.oauth` for the full flow —
 * these helpers exist for partners who need to build authorization URLs
 * or validate scopes outside the client (e.g. in a frontend that only
 * handles the redirect step).
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Scope definitions
// ---------------------------------------------------------------------------

/**
 * Every OAuth scope the Vairified authorization server accepts.
 *
 * Declaring this as a string union (rather than a free-form `string`)
 * lets TypeScript catch typos at authoring time:
 *
 * ```ts
 * const scopes: OAuthScope[] = ['user:profile:read', 'user:rating:read']; // ok
 * const bad: OAuthScope[] = ['user:profile:read', 'rating']; // type error
 * ```
 *
 * @category OAuth
 */
export type OAuthScope =
  | 'user:profile:read'
  | 'user:profile:email'
  | 'user:rating:read'
  | 'user:rating:history'
  | 'user:match:submit'
  | 'user:webhook:subscribe';

/**
 * Human-readable description for every OAuth scope.
 *
 * @category OAuth
 */
export const SCOPES: Readonly<Record<OAuthScope, string>> = Object.freeze({
  'user:profile:read': 'Access your name, location, and verification status',
  'user:profile:email': 'Access your email address',
  'user:rating:read': 'View your current rating and rating splits',
  'user:rating:history': 'View your complete rating history',
  'user:match:submit': 'Submit match results on your behalf',
  'user:webhook:subscribe': 'Receive notifications when your rating changes',
});

/**
 * The scopes automatically requested when none are specified.
 *
 * @category OAuth
 */
export const DEFAULT_SCOPES: readonly OAuthScope[] = Object.freeze([
  'user:profile:read',
  'user:rating:read',
]);

// ---------------------------------------------------------------------------
// OAuth data types
// ---------------------------------------------------------------------------

/**
 * Configuration for building an authorization URL manually.
 *
 * @category OAuth
 */
export interface OAuthConfig {
  readonly apiKey: string;
  readonly redirectUri: string;
  readonly baseUrl?: string;
}

/**
 * Response from starting an OAuth authorization flow.
 *
 * @category OAuth
 */
export interface AuthorizationResponse {
  readonly authorizationUrl: string;
  readonly code: string;
  readonly state?: string;
}

/**
 * Response from exchanging an authorization code for tokens.
 *
 * @category OAuth
 */
export interface TokenResponse {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresIn: number;
  readonly scope: readonly string[];
  readonly playerId: string;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Build the URL to redirect users to for OAuth authorization.
 *
 * Prefer {@link OAuthResource.authorize} on a Vairified client — this
 * helper is only useful when you need to construct the URL without
 * making an HTTP call first (for example, in a pure-frontend handoff).
 *
 * @category OAuth
 */
export function getAuthorizationUrl(
  config: OAuthConfig,
  options: { scopes?: readonly OAuthScope[]; state?: string } = {},
): string {
  const baseUrl = (config.baseUrl ?? 'https://api-next.vairified.com/api/v1').replace(/\/+$/, '');
  const scopeList = ensureProfileRead(options.scopes ?? DEFAULT_SCOPES);

  const params = new URLSearchParams({
    redirect_uri: config.redirectUri,
    scope: scopeList.join(','),
    response_type: 'code',
  });
  if (options.state) {
    params.set('state', options.state);
  }

  return `${baseUrl}/partner/oauth/authorize?${params.toString()}`;
}

/**
 * Check whether a scope string is one the Vairified server accepts.
 *
 * @category OAuth
 */
export function validateScope(scope: string): scope is OAuthScope {
  return scope in SCOPES;
}

/**
 * Get a human-readable description of an OAuth scope.
 *
 * Returns `"Unknown scope: {scope}"` for unrecognized scopes so this
 * function is safe to call on user-supplied input.
 *
 * @category OAuth
 */
export function describeScope(scope: string): string {
  if (validateScope(scope)) {
    return SCOPES[scope];
  }
  return `Unknown scope: ${scope}`;
}

/**
 * Describe multiple scopes at once.
 *
 * @category OAuth
 */
export function describeScopes(
  scopes: readonly string[],
): readonly { scope: string; description: string }[] {
  return scopes.map((scope) => ({
    scope,
    description: describeScope(scope),
  }));
}

/**
 * Generate a cryptographically-random CSRF state token suitable for
 * use with {@link OAuthResource.authorize}.
 *
 * Uses the Web Crypto API (available in Node 19+ and all modern
 * browsers). The returned string is URL-safe base64 of 32 random bytes.
 *
 * @category OAuth
 */
export function generateState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Internal helpers (used by resources/oauth.ts)
// ---------------------------------------------------------------------------

/**
 * Ensure `user:profile:read` is in the scope list, prepending if necessary.
 *
 * @internal
 */
export function ensureProfileRead(scopes: readonly OAuthScope[]): readonly OAuthScope[] {
  if (scopes.includes('user:profile:read')) {
    return scopes;
  }
  return ['user:profile:read', ...scopes];
}
