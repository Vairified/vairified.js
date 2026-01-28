/**
 * Vairified OAuth Helpers
 *
 * Utilities for implementing the "Connect with Vairified" OAuth flow.
 *
 * @module
 */

/**
 * Available OAuth scopes with descriptions.
 *
 * @category OAuth
 */
export const SCOPES = {
  'profile:read': 'Access your name, location, and verification status',
  'profile:email': 'Access your email address',
  'rating:read': 'View your current rating and rating splits',
  'rating:history': 'View your complete rating history',
  'match:submit': 'Submit match results on your behalf',
  'webhook:subscribe': 'Receive notifications when your rating changes',
} as const;

/**
 * Available OAuth scope keys.
 *
 * @category OAuth
 */
export type OAuthScope = keyof typeof SCOPES;

/**
 * Default scopes requested for new connections.
 *
 * @category OAuth
 */
export const DEFAULT_SCOPES: OAuthScope[] = ['profile:read', 'rating:read'];

/**
 * OAuth configuration for a partner application.
 *
 * @category OAuth
 */
export interface OAuthConfig {
  /** Partner API key */
  apiKey: string;
  /** Your application's callback URL */
  redirectUri: string;
  /** Vairified API base URL */
  baseUrl?: string;
}

/**
 * Response from starting an OAuth authorization.
 *
 * @category OAuth
 */
export interface AuthorizationResponse {
  /** Full URL to redirect the user to */
  authorizationUrl: string;
  /** Authorization code (for internal tracking) */
  code: string;
  /** CSRF state parameter */
  state?: string;
}

/**
 * Response from exchanging an authorization code for tokens.
 *
 * @category OAuth
 */
export interface TokenResponse {
  /** Access token for API requests */
  accessToken: string;
  /** Refresh token for obtaining new access tokens */
  refreshToken?: string;
  /** Token expiration in seconds */
  expiresIn: number;
  /** Granted scopes */
  scope: string[];
  /** Connected player's external ID */
  playerId: string;
}

/**
 * Build the URL to redirect users to for OAuth authorization.
 *
 * This is a helper for building the URL manually. In most cases,
 * you should use the Vairified client's OAuth methods instead.
 *
 * @param config - OAuth configuration
 * @param scopes - Permission scopes to request
 * @param state - CSRF protection state parameter
 * @returns URL to redirect the user to
 *
 * @example
 * ```ts
 * const url = getAuthorizationUrl(
 *   {
 *     apiKey: 'vair_pk_xxx',
 *     redirectUri: 'https://myapp.com/oauth/callback',
 *   },
 *   ['profile:read', 'rating:read'],
 * );
 * // Redirect user to this URL
 * window.location.href = url;
 * ```
 *
 * @category OAuth
 */
export function getAuthorizationUrl(
  config: OAuthConfig,
  scopes: OAuthScope[] = DEFAULT_SCOPES,
  state?: string,
): string {
  const baseUrl = config.baseUrl || 'https://api-next.vairified.com/api/v1';

  // Ensure profile:read is always included
  const scopeSet = new Set(scopes);
  scopeSet.add('profile:read');
  const scopeList = Array.from(scopeSet);

  const params = new URLSearchParams({
    redirect_uri: config.redirectUri,
    scope: scopeList.join(','),
    response_type: 'code',
  });

  if (state) {
    params.set('state', state);
  }

  // The actual authorization is done via API call, this builds the frontend URL
  // Partners should POST to /partner/oauth/authorize to get the actual auth URL
  return `${baseUrl}/partner/oauth/authorize?${params.toString()}`;
}

/**
 * Check if a scope is valid.
 *
 * @param scope - Scope string to validate
 * @returns True if scope is valid
 *
 * @category OAuth
 */
export function validateScope(scope: string): scope is OAuthScope {
  return scope in SCOPES;
}

/**
 * Get a human-readable description of a scope.
 *
 * @param scope - Scope string
 * @returns Description of what the scope grants access to
 *
 * @category OAuth
 */
export function describeScope(scope: OAuthScope): string {
  return SCOPES[scope] ?? `Unknown scope: ${scope}`;
}

/**
 * Get descriptions for multiple scopes.
 *
 * @param scopes - List of scope strings
 * @returns Array of objects with scope and description
 *
 * @category OAuth
 */
export function describeScopes(
  scopes: OAuthScope[],
): Array<{ scope: OAuthScope; description: string }> {
  return scopes.map((scope) => ({
    scope,
    description: describeScope(scope),
  }));
}

/**
 * Generate a random state parameter for CSRF protection.
 *
 * @returns Random 32-character hexadecimal string
 *
 * @category OAuth
 */
export function generateState(): string {
  const array = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
