<h1 align="center">Vairified TypeScript SDK</h1>

<p align="center">
  <strong>Official TypeScript/JavaScript SDK for the Vairified Partner API</strong><br>
  Multi-sport player ratings, search, and bulk match submission
</p>

<p align="center">
  <a href="https://github.com/Vairified/vairified.js/actions/workflows/ci.yml"><img src="https://github.com/Vairified/vairified.js/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://www.npmjs.com/package/vairified"><img src="https://img.shields.io/npm/v/vairified.svg" alt="npm"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D24-blue.svg" alt="Node.js 24+">
  <img src="https://img.shields.io/badge/deps-0-green.svg" alt="Zero dependencies">
</p>

---

Async-first TypeScript SDK for the [Vairified](https://vairified.com) Partner API. Built on
native `fetch` with **zero runtime dependencies**. Sub-resource layout, auto-paginating search,
n-team × n-game match submission, and `await using` lifecycle support on Node 24+.

## Installation

```bash
npm install vairified
```

Or with any other package manager:

```bash
yarn add vairified
pnpm add vairified
bun add vairified
```

## Quick Start

```ts
import { Vairified } from 'vairified';

await using client = new Vairified({ apiKey: 'vair_pk_xxx' });

const member = await client.members.get('vair_mem_xxx');
console.log(member.name, 'rated', member.ratingFor('pickleball'));
```

`await using` (TypeScript 5.2+, Node 20+) closes the client deterministically when the block
exits. If you can't use it, call `await client.close()` manually.

## Sub-resources

Every operation lives on a sub-resource that mirrors the REST path:

| Sub-resource            | Operations                                                       |
|-------------------------|------------------------------------------------------------------|
| `client.members`        | `get`, `getBulk`, `search`, `find`, `ratingUpdates`              |
| `client.matches`        | `submit`, `tournamentImport`, `testWebhook`                      |
| `client.oauth`          | `authorize`, `exchangeToken`, `refresh`, `revoke`                |
| `client.webhooks`       | `deliveries`                                                     |
| `client.leaderboard`    | `list`, `rank`, `categories`                                     |
| `client.usage()`        | Rate-limit + request-count stats                                 |

## Members

### Get a connected member

```ts
const member = await client.members.get('vair_mem_xxx');

console.log(member.name);                      // Full name
console.log(member.displayName);                // "Mike B."
console.log(member.ratingFor('pickleball'));    // 3.915
console.log(member.status.isVairified);         // true

// Dict-like access to rating splits for a specific sport
const pb = member.sport.get('pickleball');
if (pb) {
  console.log(pb.rating, pb.abbr);              // 3.915 VO
  console.log(pb.get('overall-open')?.rating);  // 3.915
  console.log(pb.has('singles-open'));          // true
  for (const [key, split] of pb) {
    console.log(key, split.rating);
  }
}
```

### Bulk member lookup

Fetch up to 100 members in one call by their integer member IDs:

```ts
const members = await client.members.getBulk([4873327, 4873328, 4873329]);
for (const m of members) {
  console.log(m.name, m.ratingFor('pickleball'));
}

// Filter to a specific sport
const pb = await client.members.getBulk([4873327], { sport: 'pickleball' });
```

Unknown IDs are silently omitted — the returned array may be shorter than the input.

### Filter ratings to specific sports

```ts
// Just pickleball
const member = await client.members.get('vair_mem_xxx', { sport: 'pickleball' });

// Multiple sports
const member2 = await client.members.get('vair_mem_xxx', {
  sport: ['pickleball', 'padel'],
});
```

### Auto-paginating search

`search()` is an async generator — iterate directly with `for await`. Pages are fetched
lazily, so memory usage stays bounded regardless of result count.

```ts
for await (const member of client.members.search({
  city: 'Austin',
  state: 'TX',
  ratingMin: 3.5,
  ratingMax: 4.5,
  vairifiedOnly: true,
})) {
  console.log(member.name, member.ratingFor('pickleball'));
}

// Cap with maxResults, or break out early
const top20: Member[] = [];
for await (const m of client.members.search({ name: 'Smith', maxResults: 20 })) {
  top20.push(m);
}
```

### Find by name (first hit only)

```ts
const mike = await client.members.find('Mike Barker');
if (mike) {
  console.log(mike.ratingFor('pickleball'));
}
```

### Rating change notifications

```ts
const updates = await client.members.ratingUpdates();
for (const update of updates) {
  const arrow = update.improved ? '↑' : '↓';
  console.log(`${update.displayName} ${arrow} delta=${update.delta?.toFixed(3)}`);
}
```

## Match Submission

Matches are submitted as a `MatchBatch` — defaults at the batch level apply to every
match unless overridden. The shape is n-team × n-game, so singles, doubles, and
round-robin all go through the same path.

```ts
const result = await client.matches.submit({
  sport: 'pickleball',
  winScore: 11,
  winBy: 2,
  bracket: '4.0 Doubles',
  event: 'Weekly League',
  matchDate: '2026-04-11T14:00:00Z',
  matches: [
    {
      identifier: 'm1',
      teams: [
        ['vair_mem_aaa', 'vair_mem_bbb'],
        ['vair_mem_ccc', 'vair_mem_ddd'],
      ],
      games: [{ scores: [11, 8] }, { scores: [11, 5] }],
    },
    {
      identifier: 'm2',
      teams: [['vair_mem_eee'], ['vair_mem_fff']],   // singles
      games: [{ scores: [11, 9] }, { scores: [11, 7] }],
    },
  ],
});

if (result.ok) {
  console.log(`Submitted ${result.numGames} games in ${result.numMatches} matches`);
}
```

Set `dryRun: true` on the batch to validate without persisting — your API key must have
the `key:dry-run` scope.

### Tournament import

Import historical tournament results with automatic player matching. Unmatched players
become ghost accounts that can be claimed later.

```ts
const result = await client.matches.tournamentImport({
  tournamentName: 'Austin Open 2026',
  sport: 'pickleball',
  winScore: 11,
  winBy: 2,
  matches: [
    {
      identifier: 'USAP-R1-M1',
      event: 'Austin Open',
      bracket: "Men's Pro Doubles",
      format: 'DOUBLES',
      matchDate: '2026-04-11T10:00:00Z',
      teamA: {
        player1: { firstName: 'Ben', lastName: 'Johns' },
        player2: { firstName: 'Matt', lastName: 'Wright' },
        game1: 11, game2: 11,
      },
      teamB: {
        player1: { firstName: 'JW', lastName: 'Johnson' },
        player2: { firstName: 'Dylan', lastName: 'Frazier' },
        game1: 7, game2: 9,
      },
    },
  ],
});
console.log(`Imported ${result.matchesImported} matches, ${result.ghostPlayersCreated} ghosts`);
```

## Webhook Deliveries

Inspect recent webhook delivery attempts for your app:

```ts
const result = await client.webhooks.deliveries({ status: 'failed', limit: 10 });
for (const d of result.deliveries) {
  console.log(d.event, d.statusCode, d.errorMessage);
}

// Filter by event type
const ratingEvents = await client.webhooks.deliveries({ event: 'rating.updated' });
console.log(`${ratingEvents.total} total rating.updated deliveries`);
```

## OAuth Connect Flow

```ts
import { Vairified, OAuthError, generateState } from 'vairified';

await using client = new Vairified({ apiKey: 'vair_pk_xxx' });

// Step 1 — start authorization
const state = generateState();
const auth = await client.oauth.authorize({
  redirectUri: 'https://myapp.com/oauth/callback',
  scopes: ['user:profile:read', 'user:rating:read', 'user:match:submit'],
  state,
});
// Redirect user to auth.authorizationUrl

// Step 2 — exchange the callback code
const tokens = await client.oauth.exchangeToken({
  code: 'code-from-callback',
  redirectUri: 'https://myapp.com/oauth/callback',
});
const { accessToken, refreshToken, playerId } = tokens;

// Step 3 — refresh when the access token expires
try {
  const newTokens = await client.oauth.refresh(refreshToken!);
} catch (err) {
  if (err instanceof OAuthError && err.errorCode === 'invalid_grant') {
    // User must re-authorize
  }
}

// Step 4 — revoke the connection
await client.oauth.revoke(playerId);
```

`OAuthScope` is a string literal union, so your editor will catch typos:

```ts
import type { OAuthScope } from 'vairified';

const scopes: OAuthScope[] = ['user:profile:read', 'user:rating:read']; // ok
const bad: OAuthScope[] = ['user:profile:read', 'rating']; // type error
```

### Available scopes

| Scope                     | Description                                    |
|---------------------------|------------------------------------------------|
| `user:profile:read`       | Name, location, verification status            |
| `user:profile:email`      | Email address                                  |
| `user:rating:read`        | Current rating and rating splits               |
| `user:rating:history`     | Complete rating history                        |
| `user:match:submit`       | Submit matches on behalf of user               |
| `user:webhook:subscribe`  | Rating change notifications                    |

## Leaderboards

```ts
// Global leaderboard
const lb = await client.leaderboard.list();

// Texas singles, verified only
const tx = await client.leaderboard.list({
  category: 'singles',
  scope: 'state',
  state: 'TX',
  verifiedOnly: true,
  limit: 50,
});

// A specific player's rank with 5 players on either side
const rank = await client.leaderboard.rank('vair_mem_xxx', {
  category: 'doubles',
  contextSize: 5,
});

// Available categories, brackets, scopes
const categories = await client.leaderboard.categories();
```

## Configuration

```ts
import { Vairified } from 'vairified';

// Environment preset
const client = new Vairified({ apiKey: 'vair_pk_xxx', env: 'production' }); // default
const staging = new Vairified({ apiKey: 'vair_pk_xxx', env: 'staging' });
const local = new Vairified({ apiKey: 'vair_pk_xxx', env: 'local' });

// Custom base URL (overrides env)
const custom = new Vairified({
  apiKey: 'vair_pk_xxx',
  baseUrl: 'http://localhost:3001/api/v1',
  timeoutMs: 30_000,
});

// Inject a custom fetch (test shims, non-Node environments)
const withFetch = new Vairified({
  apiKey: 'vair_pk_xxx',
  fetch: customFetchImpl,
});
```

### Environment variables

```bash
export VAIRIFIED_API_KEY="vair_pk_xxx"
export VAIRIFIED_ENV="staging"   # optional; default: production
```

```ts
const client = new Vairified();   // reads both env vars
```

## Error Handling

The SDK maps HTTP status codes to typed exceptions. All typed exceptions inherit from
`VairifiedError`, so a single `catch` can handle everything.

```ts
import {
  Vairified,
  VairifiedError,
  RateLimitError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  OAuthError,
} from 'vairified';

try {
  const member = await client.members.get('vair_mem_xxx');
} catch (err) {
  if (err instanceof RateLimitError) {
    console.log(`Rate limited; retry after ${err.retryAfter}s`);
  } else if (err instanceof AuthenticationError) {
    console.log('Invalid API key');
  } else if (err instanceof NotFoundError) {
    console.log('Member not found');
  } else if (err instanceof ValidationError) {
    console.log(`Bad request: ${err.message}`);
  } else if (err instanceof OAuthError) {
    console.log(`OAuth error: ${err.message} (code: ${err.errorCode})`);
  } else if (err instanceof VairifiedError) {
    console.log(`API error: ${err.message} (status: ${err.statusCode})`);
  } else {
    throw err;
  }
}
```

## Models

Response models are immutable classes wrapping the wire payload. They expose computed
getters (`member.name`, `update.delta`) and support iteration where it makes sense
(`for (const [key, split] of sportRating)`).

### `Member`

```ts
member.memberId                   // Numeric member ID (public)
member.id                         // UUID | null
member.name                       // Full name (getter)
member.displayName                // "Mike B."
member.firstName / lastName
member.gender                     // 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN' | null
member.age / city / state / zip / country
member.status.isVairified         // grouped status flags
member.status.isConnected
member.sport                      // MemberSportMap
member.sports                     // readonly string[] of sport codes
member.ratingFor('pickleball')    // number | null
member.split('overall-open')      // RatingSplitWire | null
```

### `SportRating` (dict-like)

```ts
const pb = member.sport.get('pickleball');
pb?.rating              // Primary rating for this sport
pb?.abbr                // "VO", "VG", etc.
pb?.get('overall-open') // Any split key
pb?.size                // Number of splits
pb?.has('singles-40+')  // Membership check
for (const [key, split] of pb ?? []) { /* iterate */ }
```

## Migrating

**From 0.2.x → 0.3.0:** All OAuth scope strings gained a `user:` prefix
(`profile:read` → `user:profile:read`). Update any hardcoded scope arrays.
New: `members.getBulk()`, `matches.tournamentImport()`, `webhooks.deliveries()`.

**From 0.1.x → 0.2.0:** Full rewrite. See the
[migration guide](https://vairified.github.io/vairified.js/documents/Migrating_from_0.1.x.html)
for the full diff and [CHANGELOG.md](CHANGELOG.md) for the release notes.

## Development

```bash
git clone https://github.com/Vairified/vairified.js.git
cd vairified.js
npm install
npm test
npm run build
```

## License

MIT — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <a href="https://vairified.com">vairified.com</a> ·
  <a href="https://vairified.github.io/vairified.js">Documentation</a> ·
  <a href="mailto:support@vairified.com">Support</a>
</p>
