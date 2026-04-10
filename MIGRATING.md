---
title: Migrating from 0.1.x
group: Documents
category: Guides
---

# Migrating from 0.1.x

Version 0.2.0 is a breaking rewrite of the SDK surface to match the
multi-sport Partner API v1. This guide walks through the changes and
shows how to port existing code.

See [CHANGELOG.md](./CHANGELOG.md) for the full release notes.

## At a glance

| 0.1.x                                            | 0.2.0                                                               |
|--------------------------------------------------|---------------------------------------------------------------------|
| `client.getMember(id)`                           | `client.members.get(id)`                                            |
| `client.search({...})` returning `SearchResults` | `for await (const m of client.members.search({...}))`               |
| `client.findPlayer(name)`                        | `client.members.find(name)`                                         |
| `client.submitMatch(match)`                      | `client.matches.submit(batch)`                                      |
| `client.submitMatches([m1, m2])`                 | `client.matches.submit(batch)` (put both in `batch.matches`)        |
| `client.getRatingUpdates()`                      | `client.members.ratingUpdates()`                                    |
| `client.startOAuth({...})`                       | `client.oauth.authorize({...})`                                     |
| `client.exchangeToken(...)`                      | `client.oauth.exchangeToken({...})`                                 |
| `client.refreshAccessToken(rt)`                  | `client.oauth.refresh(rt)`                                          |
| `client.revokeConnection(id)`                    | `client.oauth.revoke(id)`                                           |
| `client.getLeaderboard({...})`                   | `client.leaderboard.list({...})`                                    |
| `client.getPlayerRank(...)`                      | `client.leaderboard.rank(...)`                                      |
| `client.getUsage()`                              | `client.usage()`                                                    |
| `member.rating` (single sport)                   | `member.ratingFor('pickleball')`                                    |
| `member.ratingSplits.gender`                     | `member.sport.get('pickleball')?.get('gender-open')?.rating`        |
| `member.isVairified`                             | `member.status.isVairified`                                         |
| `new Match({ team1, team2, scores })`            | `MatchInput` with `teams: string[][]` and `games: GameInput[]`      |

## Sub-resources

All operations now live on sub-resources that mirror the REST path. The flat
`client.*` methods are gone.

```ts
// Before
const member = await client.getMember('vair_mem_xxx');
const results = await client.search({ city: 'Austin' });
await client.submitMatch(match);

// After
const member = await client.members.get('vair_mem_xxx');
for await (const m of client.members.search({ city: 'Austin' })) { /* ... */ }
await client.matches.submit(batch);
```

## Multi-sport ratings

The biggest conceptual change. In 0.1.x, every `Member` had a single
`rating` and a flat `ratingSplits` object. In 0.2.0, rating data lives
under `member.sport` keyed by sport code, so the same SDK can represent a
player's pickleball *and* padel ratings in one call.

```ts
// Before
member.rating;                        // 3.915
member.ratingSplits.gender;           // 3.880
member.ratingSplits.singles;          // 3.710
member.isVairified;                   // true

// After
member.ratingFor('pickleball');                            // 3.915
member.sport.get('pickleball')?.get('gender-open')?.rating; // 3.880
member.sport.get('pickleball')?.get('singles-open')?.rating; // 3.710
member.status.isVairified;                                 // true
```

`MemberSportMap` and `SportRating` are both dict-like — subscript access,
iteration, and membership checks all work:

```ts
const pb = member.sport.get('pickleball');
if (pb) {
  console.log(pb.size, 'splits');
  if (pb.has('singles-open')) {
    console.log(pb.get('singles-open')?.rating);
  }
  for (const [key, split] of pb) {
    console.log(key, split.rating, split.abbr);
  }
}
```

Fetch ratings for just the sports you care about with the `sport` filter:

```ts
// All sports this player has ratings in
const member = await client.members.get('vair_mem_xxx');

// Just pickleball
const member2 = await client.members.get('vair_mem_xxx', { sport: 'pickleball' });

// Multiple sports
const member3 = await client.members.get('vair_mem_xxx', {
  sport: ['pickleball', 'padel'],
});
```

## Auto-paginating search

In 0.1.x, `client.search()` returned a `SearchResults` object with
`nextPage()`. In 0.2.0, `client.members.search()` is an async iterator that
fetches pages lazily as you iterate:

```ts
// Before
let results = await client.search({ city: 'Austin', limit: 20 });
while (results.hasMore) {
  for (const player of results.players) {
    console.log(player.name);
  }
  results = await results.nextPage();
}

// After
for await (const member of client.members.search({ city: 'Austin' })) {
  console.log(member.name);
}

// Cap the total
for await (const m of client.members.search({ name: 'Smith', maxResults: 50 })) {
  // ...
}
```

## Matches: n-team × n-game

`Match` has been restructured to natively support any match shape —
singles, doubles, 3-way round robin, best-of-N — through a single schema.
Submit matches as a `MatchBatch` that carries shared defaults:

```ts
// Before
const match = new Match({
  event: 'Weekly League',
  bracket: '4.0 Doubles',
  date: new Date(),
  team1: ['p1', 'p2'],
  team2: ['p3', 'p4'],
  scores: [[11, 9], [11, 7]],
});
const result = await client.submitMatch(match);

// After
const result = await client.matches.submit({
  sport: 'pickleball',                 // NEW: sport code is required
  winScore: 11,                         // NEW: so the rater can interpret scores
  winBy: 2,
  bracket: '4.0 Doubles',
  event: 'Weekly League',
  matchDate: '2026-04-11T14:00:00Z',
  matches: [
    {
      identifier: 'm1',
      teams: [['p1', 'p2'], ['p3', 'p4']],
      games: [{ scores: [11, 9] }, { scores: [11, 7] }],
    },
  ],
});
```

Singles becomes `teams: [['p1'], ['p2']]`. A 3-way round robin becomes
`teams: [['p1'], ['p2'], ['p3']]`. Each `GameInput` scores one entry per
team in the same order.

## OAuth

The OAuth methods moved to the `client.oauth` sub-resource. Signatures now
take a single options object:

```ts
// Before
const auth = await client.startOAuth({
  redirectUri: '...',
  scopes: [...],
  state: '...',
});
const tokens = await client.exchangeToken(code, redirectUri);
const newTokens = await client.refreshAccessToken(refreshToken);
await client.revokeConnection(playerId);

// After
const auth = await client.oauth.authorize({
  redirectUri: '...',
  scopes: [...],
  state: '...',
});
const tokens = await client.oauth.exchangeToken({ code, redirectUri });
const newTokens = await client.oauth.refresh(refreshToken);
await client.oauth.revoke(playerId);
```

`OAuthScope` is now a string literal union, so TypeScript catches typos:

```ts
import type { OAuthScope } from 'vairified';

const scopes: OAuthScope[] = ['profile:read', 'rating:read']; // ok
const bad: OAuthScope[] = ['profile:read', 'rating']; // type error
```

## Immutable model classes

Response models (`Member`, `SportRating`, `RatingUpdate`, etc.) are now
frozen class instances. Attempts to mutate a field throw in strict mode.
Every model has a useful `toString()` and, where appropriate, `Symbol.iterator`.

## Status flags

The top-level `is*` booleans on `Member` are now grouped under
`member.status`:

```ts
// Before
member.isVairified;
member.isWheelchair;
member.isAmbassador;

// After
member.status.isVairified;
member.status.isWheelchair;
member.status.isAmbassador;
member.status.isRater;      // NEW
member.status.isConnected;  // NEW
```

## Environment presets and `await using`

```ts
// Before
const client = new Vairified({
  apiKey: 'vair_pk_xxx',
  baseUrl: 'https://api-staging.vairified.com/api/v1',
});

// After — preset
const client = new Vairified({ apiKey: 'vair_pk_xxx', env: 'staging' });

// After — explicit resource management (TS 5.2+, Node 20+)
await using client = new Vairified({ apiKey: 'vair_pk_xxx' });
// client.close() is called automatically at block exit
```

Supported environments: `"production"` (default), `"staging"`, `"local"`.
Reads `VAIRIFIED_ENV` from the environment when not supplied.
