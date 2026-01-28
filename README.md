<h1 align="center">Vairified JavaScript SDK</h1>

<p align="center">
  <strong>Official TypeScript/JavaScript SDK for the Vairified Partner API</strong><br>
  Player ratings, search, and match submission
</p>

<p align="center">
  <a href="https://github.com/Vairified/vairified.js/actions/workflows/ci.yml"><img src="https://github.com/Vairified/vairified.js/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://www.npmjs.com/package/vairified"><img src="https://img.shields.io/npm/v/vairified.svg" alt="npm"></a>
</p>

---

TypeScript/JavaScript SDK for integrating with the [Vairified](https://vairified.com) player rating platform. Zero dependencies, works in Node.js and browsers.

## Installation

```bash
npm install vairified
```

Or with other package managers:

```bash
yarn add vairified
pnpm add vairified
bun add vairified
```

## Quick Start

```typescript
import { Vairified } from 'vairified';

const client = new Vairified({ apiKey: 'vair_pk_xxx' });

// Get a member - automatically subscribes to their rating updates
const member = await client.getMember('clerk_user_123');
console.log(`${member.name}: ${member.rating}`);
console.log(`Verified: ${member.isVairified}`);
console.log(`Best rating: ${member.ratingSplits.best}`);
```

## Features

### Search for Players

```typescript
const client = new Vairified({ apiKey: 'vair_pk_xxx' });

// Search with filters
const results = await client.search({
  city: 'Austin',
  state: 'TX',
  ratingMin: 3.5,
  ratingMax: 4.5,
  vairifiedOnly: true,
  limit: 20,
});

// Iterate over results
for (const player of results) {
  console.log(`${player.name}: ${player.rating}`);
}

// Pagination
console.log(`Page ${results.page} of ${results.pages}`);
if (results.hasMore) {
  const nextPage = await results.nextPage();
}
```

### Find a Player by Name

```typescript
const player = await client.findPlayer('John Smith');
if (player) {
  console.log(`Found: ${player.name} (${player.rating})`);
}
```

### Submit Match Results

```typescript
import { Vairified, Match } from 'vairified';

const client = new Vairified({ apiKey: 'vair_pk_xxx' });

// Doubles match: 11-9, 11-7
const match = new Match({
  event: 'Weekly League',
  bracket: '4.0 Doubles',
  date: new Date(),
  team1: ['player1_id', 'player2_id'],
  team2: ['player3_id', 'player4_id'],
  scores: [[11, 9], [11, 7]],
});

const result = await client.submitMatch(match);
if (result.ok) {
  console.log(`Submitted ${result.numGames} games`);
}

// Singles match
const singles = new Match({
  event: 'Club Singles',
  bracket: 'Open Singles',
  date: new Date(),
  team1: ['player1_id'],
  team2: ['player2_id'],
  scores: [[11, 8], [9, 11], [11, 6]],
});
await client.submitMatch(singles);
```

### Get Rating Updates

```typescript
// First, look up members to subscribe to their updates
await client.getMember('user_1');
await client.getMember('user_2');

// Later, check for rating changes
const updates = await client.getRatingUpdates();
for (const update of updates) {
  const direction = update.improved ? 'improved' : 'dropped';
  console.log(`${update.memberId} ${direction}: ${update.previousRating} -> ${update.newRating}`);

  // Get the full member profile
  const member = await update.getMember();
}
```

### OAuth Connect Flow

Connect players to your application using OAuth to access their profile and rating data.

```typescript
import { Vairified, generateState, OAuthError } from 'vairified';

const client = new Vairified({ apiKey: 'vair_pk_xxx' });

// Step 1: Start authorization
const state = generateState(); // CSRF protection
const auth = await client.startOAuth(
  'https://myapp.com/oauth/callback',
  ['profile:read', 'rating:read', 'match:submit'],
  state,
);

// Redirect user to auth.authorizationUrl
window.location.href = auth.authorizationUrl;
```

```typescript
// Step 2: Handle callback (in your /oauth/callback route)
const client = new Vairified({ apiKey: 'vair_pk_xxx' });

// Exchange code for tokens
const code = new URL(window.location.href).searchParams.get('code')!;
const tokens = await client.exchangeToken(code, 'https://myapp.com/oauth/callback');

// Store tokens securely
const { playerId, accessToken, refreshToken } = tokens;

// Now you can access the player's data
const member = await client.getMember(playerId);
console.log(`Connected: ${member.name} (${member.rating})`);
```

```typescript
// Step 3: Refresh expired tokens
try {
  const newTokens = await client.refreshAccessToken(storedRefreshToken);
  // Update stored tokens
} catch (e) {
  if (e instanceof OAuthError && e.errorCode === 'invalid_grant') {
    // Token revoked, user needs to re-authorize
  }
}
```

### Available OAuth Scopes

| Scope | Description |
|-------|-------------|
| `profile:read` | Name, location, verification status |
| `profile:email` | Email address |
| `rating:read` | Current rating and rating splits |
| `rating:history` | Complete rating history |
| `match:submit` | Submit matches on behalf of user |
| `webhook:subscribe` | Rating change notifications |

### Revoke Connection

```typescript
await client.revokeConnection('vair_mem_xxx');
```

## Models

### Player

```typescript
player.id              // UUID or member ID
player.memberId        // Legacy member ID
player.name            // "John Smith"
player.firstName       // "John"
player.lastName        // "Smith"
player.rating          // 4.25
player.isVairified     // true/false
player.ratingSplits    // RatingSplits object
player.city            // "Austin"
player.state           // "TX"
player.verifiedRating  // Best verified rating
```

### Member (extends Player)

```typescript
member.email           // Email address
await member.refresh() // Refresh data from API
```

### RatingSplits

Access ratings by category:

```typescript
const splits = member.ratingSplits;
splits.open           // Open division rating
splits.gender         // Same-gender doubles rating
splits.mixed          // Mixed doubles rating
splits.recreational   // Recreational rating
splits.singles        // Singles rating
splits.best           // Best available rating
splits.get('50_and_up')  // Age bracket rating
```

### Match

```typescript
const match = new Match({
  event: 'Weekly League',
  bracket: '4.0 Doubles',
  date: new Date(),
  team1: ['id1', 'id2'],         // Player IDs for team 1
  team2: ['id3', 'id4'],         // Player IDs for team 2
  scores: [[11, 9], [11, 7]],    // Game scores
  location: 'Austin Club',       // Optional
  matchType: 'SIDEOUT',          // Default: "SIDEOUT"
  source: 'PARTNER',             // Default: "PARTNER"
});

match.format         // "DOUBLES" or "SINGLES"
match.winner         // 1 or 2 (0 if tie)
match.scoreSummary   // "11-9, 11-7"
match.identifier     // Auto-generated unique ID
```

### MatchResult

```typescript
const result = await client.submitMatches([match1, match2]);
result.success       // true/false
result.numMatches    // Number processed
result.numGames      // Games recorded
result.dryRun        // true if validation only
result.message       // Human-readable message
result.errors        // Array of errors
result.ok            // true if successful
```

### SearchResults

```typescript
results.players      // Array of Player objects
results.total        // Total matching players
results.page         // Current page
results.pages        // Total pages
results.hasMore      // More pages available
await results.nextPage()  // Get next page
results.length       // Players on current page
results.at(0)        // Get by index
for (const p of results) { }  // Iterable
```

## Configuration

```typescript
import { Vairified } from 'vairified';

// Basic usage
const client = new Vairified({ apiKey: 'vair_pk_xxx' });

// Use staging for development/testing
const client = new Vairified({ apiKey: 'vair_pk_xxx', env: 'staging' });

// Custom configuration
const client = new Vairified({
  apiKey: 'vair_pk_xxx',
  timeout: 30000,
});
```

### Environment Variables

```bash
export VAIRIFIED_API_KEY="vair_pk_xxx"
```

```typescript
// API key read from environment (Node.js only)
const client = new Vairified();
```

## Dry-Run Mode (Dev Keys)

If your API key has the `dry-run` scope, match submissions are **validated but not persisted**. This is useful for testing integrations without affecting production data.

```typescript
// With a dry-run API key
const client = new Vairified({ apiKey: 'vair_pk_dev_xxx' });
const result = await client.submitMatches([match1, match2]);

if (result.dryRun) {
  console.log(`Validation passed: ${result.numGames} games would be created`);
  console.log(result.message);
}
```

Request a dry-run API key from your Vairified partner contact for integration testing.

## Error Handling

```typescript
import {
  Vairified,
  VairifiedError,
  RateLimitError,
  AuthenticationError,
  NotFoundError,
  OAuthError,
} from 'vairified';

const client = new Vairified({ apiKey: 'vair_pk_xxx' });

try {
  const member = await client.getMember('user_123');
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${error.retryAfter} seconds`);
  } else if (error instanceof AuthenticationError) {
    console.log('Invalid API key');
  } else if (error instanceof NotFoundError) {
    console.log('Member not found');
  } else if (error instanceof OAuthError) {
    console.log(`OAuth error: ${error.message} (code: ${error.errorCode})`);
  } else if (error instanceof VairifiedError) {
    console.log(`API error: ${error.message} (status: ${error.statusCode})`);
  }
}
```

## TypeScript

Full TypeScript support with exported types:

```typescript
import type {
  MatchInput,
  MatchResultData,
  PlayerData,
  SearchFilters,
  VairifiedOptions,
} from 'vairified';
```

## Development

```bash
git clone https://github.com/Vairified/vairified.js.git
cd vairified.js
npm install
npm test
```

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  <a href="https://vairified.com">vairified.com</a> · 
  <a href="https://docs.vairified.com">Documentation</a> · 
  <a href="mailto:support@vairified.com">Support</a>
</p>
