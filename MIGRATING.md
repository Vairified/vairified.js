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

> Upgrading from 0.8.x? See [Migrating from 0.8.x to 0.9.0](#migrating-from-08x-to-090) at the end.

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
const member = await client.getMember('4873327');
const results = await client.search({ city: 'Austin' });
await client.submitMatch(match);

// After
const member = await client.members.get('4873327');
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
const member = await client.members.get('4873327');

// Just pickleball
const member2 = await client.members.get('4873327', { sport: 'pickleball' });

// Multiple sports
const member3 = await client.members.get('4873327', {
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

# Migrating from 0.8.x to 0.9.0

0.9.0 removes and renames nothing in the SDK. Two SDK changes can still break existing code (the first two sections), and four API behaviour changes need a look even though they compile unchanged (`S` is now `VS`, `R` / `Rv` are now `RD`, the leaderboard's `verifiedOnly` default, and the leaderboard category names).

## `SearchFilters.sortBy` only accepts the sortable fields

`sortBy` is typed `PartnerSearchSortField`: `'lastName' | 'firstName' | 'memberId' | 'city' | 'state' | 'country'`. The API now refuses any other value with a 400. `'rating'` never worked: it always failed with a 500. A plain `string` variable no longer compiles:

```ts
const sortBy: string = req.query.sort; // ✗ not assignable to PartnerSearchSortField
```

Check the value against the exported list, which narrows the type:

```ts
import { PARTNER_SEARCH_SORT_FIELDS, type PartnerSearchSortField } from 'vairified';

const isSortField = (v: string): v is PartnerSearchSortField =>
  (PARTNER_SEARCH_SORT_FIELDS as readonly string[]).includes(v);

const sortBy = isSortField(raw) ? raw : undefined;
client.members.search({ sortBy });
```

Or cast it (`raw as PartnerSearchSortField`) and handle the API's 400, which surfaces as `ValidationError`.

## Rating splits are frozen copies

`SportRating.get()`, `values()`, `entries()`, iteration, `Member.split()` and `RatingUpdate.ratingSplits` used to return the live object from the parsed response. They now return a frozen `RatingSplit` copy with `label` always present (`null` when the API sent none). Mutating one throws a `TypeError` in strict mode, which covers every ES module:

```ts
const split = member.split('overall-open');
split.rating = 4;                       // ✗ TypeError: Cannot assign to read only property
const edited = { ...split, rating: 4 }; // ✓ copy, then change
```

## `S` is now `VS`

Verified singles' `abbr` is `VS`, the same code the web app shows (it was `S`). The bracket suffix is unchanged: `S50+` is now `VS50+`, `S12-13` is now `VS12-13`. It applies to every split and to a sport's primary `abbr`, in `members.*`, `ratingUpdates()` and `rating.updated`. If you match on `S`, match on `VS`:

```ts
const singles = split.abbr.startsWith('S');    // ✗ never true now
const singles = split.abbr.startsWith('VS');   // ✓ verified singles, any bracket
```

Better still, use the split key (`singles-open`, `singles-50+`) or `label`, which never changed. As a leaderboard `category`, `'S'` still resolves to `singles`.

## `R` and `Rv` are now `RD`

The recreational doubles chain ("Recreational Doubles") is `RD` for every player, in `abbr` and `label` alike. Before 0.9.0 it was `R` for a player not verified in the sport and `Rv` for one verified there; neither is sent any more. The bracket suffix carries over: `R50+` is now `RD50+`. The labels the API sends are `VO`, `VG`, `VM`, `VS`, `RD` and `RS` (plus a bracket suffix such as `RS40+`).

```ts
// Before — found the chain, or told a verified player apart, by the abbreviation
const verified = pb.abbr === 'Rv';                 // ✗ never true now
const unverified = pb.abbr === 'R';                // ✗ never true now (it is 'RD')
// After
const verified = pb.isVairified;                   // ✓ a verified VO / VG / VM / VS rating in the sport
const recreational = pb.get('recreational-open');  // ✓ the split key never changed
```

Code that matches `abbr === 'R'` or `abbr === 'Rv'` never matches now. To find the recreational chain, use the split key (`recreational-open`, `recreational-50+`), which never changed. Also replace `byLabel('R')` / `byLabel('Rv')` with `byLabel('RD')`. As a leaderboard `category`, `'R'`, `'RO'` and `'Rv'` still resolve to `recreational`, but `LEADERBOARD_CATEGORY_LABELS` lists `'RD'` only.

## Leaderboard category names are the full track names

`GET /leaderboard/categories` (`categories()`, and `name` on `categoryList()`) names the verified tracks `Vairified Overall`, `Vairified Gender`, `Vairified Singles` and `Vairified Mixed`. They were `Doubles`, `Same-Gender Doubles`, `Singles` and `Mixed Doubles`. The recreational doubles track is `Recreational Doubles`, label `RD` (it was `Recreational`, label `R`); `Recreational Singles` is unchanged. If you matched on `name`, match on `code` instead; it never changed.

## Leaderboard `verifiedOnly` no longer defaults to "unverified only"

`verifiedOnly` on `leaderboard.list()` is an optional narrowing filter:

| `verifiedOnly` | Before 0.9.0 | Now |
|---|---|---|
| unset | unverified players only | no filter — everyone |
| `false` | unverified players only | no filter — everyone |
| `true` | verified players only | VAIRified players only |

The SDK sends it only when you set it. Verified boards (`overall`, `gender`, `mixed`, `singles`) list only verified players whatever it says; the recreational boards (`RD`, `RS`) rank everyone unless you pass `true`. There is no longer a way to list *only* unverified players; if you relied on that, filter the page yourself.

```ts
await client.leaderboard.list({ category: 'RD' });                     // everyone
await client.leaderboard.list({ category: 'RD', verifiedOnly: true }); // VAIRified only
```

## Six leaderboard tracks

`LEADERBOARD_CATEGORIES` (new) is `overall`, `gender`, `singles`, `mixed`, `recreational`, `recreational_singles`. The engine's recreational same-gender and mixed tracks are internal: the API refuses them as a `category` (`ValidationError`) and never sends their splits, so don't look for `recreational_gender-*` / `recreational_mixed-*` keys.

## Behaviour to expect from the API

Nothing to change in code, but don't rely on the old behaviour:

- **Verified-track splits** (`overall-*`, `gender-*`, `mixed-*`, `singles-*`) are absent for a player not verified in that sport. The primary rating falls back to the recreational chain (`RD`). Check `sportRating.has(key)` before you read one.
- **On the leaderboard**, `list()` and `categories()` now check the API key the SDK sends. An invalid key throws `AuthenticationError`, a key without `leaderboard:read` throws `PermissionDeniedError`.
- **Deprecated leaderboard options** `clubId` (on `list` and `rank`) and `city` (on `rank`) are no longer sent and log a warning. Remove them.
