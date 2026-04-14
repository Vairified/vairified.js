# Changelog

All notable changes to the Vairified TypeScript SDK are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-04-14

### Changed

- Removed `key:dry-run` scope — `dryRun` is now a request-body-only toggle. Any key with `key:match:submit` can dry-run; no special scope needed.

### Fixed

- Recreational rating abbreviation: unverified players now correctly show `R` instead of `Rv` in partner API responses.
- Numeric member ID strings in compressed match `teams` arrays are no longer coerced to integers by the backend.

## [0.3.0] - 2026-04-12

### Breaking Changes

- All 6 OAuth scope strings now carry the `user:` prefix (`profile:read` → `user:profile:read`, etc.) to match the backend scope-namespace split.

### Added

- `members.getBulk(ids, options?)` — fetch up to 100 members by ID in one call (`GET /partner/members`).
- `matches.tournamentImport(body)` — import tournament results with automatic player matching and ghost creation (`POST /partner/tournament-import`).
- `webhooks.deliveries(options?)` — inspect recent webhook delivery attempts (`GET /partner/webhook-deliveries`).
- New `WebhooksResource` sub-resource accessible via `client.webhooks`.
- New models: `TournamentImportResult`, `WebhookDelivery`, `WebhookDeliveriesResult`.

## [0.2.0] - 2026-04-10

### Breaking Changes

- **Complete SDK rewrite** to match the multi-sport Partner API v1 shape. Flat
  single-sport fields like `member.rating` and `member.ratingSplits.gender` are gone —
  rating data now lives under `member.sport` as a dict-like `MemberSportMap` keyed by
  sport code. Use `member.ratingFor('pickleball')` for the primary rating and
  `member.split('overall-open')` to access specific brackets.
- Client operations are now organized as sub-resources that mirror the REST layout:
  `client.members.get/search/find/ratingUpdates`, `client.matches.submit/testWebhook`,
  `client.oauth.authorize/exchangeToken/refresh/revoke`, and
  `client.leaderboard.list/rank/categories`. Flat methods like `client.getMember()`,
  `client.search()`, and `client.submitMatch()` have been removed.
- `Match` now takes `teams: string[][]` and `games: GameInput[]` instead of
  `team1`/`team2` and per-game score tuples. This natively supports n-team × n-game
  matches (singles, doubles, round-robin, best-of-N) through a single shape. Match
  submission goes through a new `MatchBatch` wrapper that carries shared defaults
  (`sport`, `winScore`, `winBy`, `bracket`, `event`, `matchDate`) for every match in
  the batch.
- The flat top-level `member.isVairified`, `member.isWheelchair`, etc. booleans have
  been grouped under `member.status.*`.
- `RatingSplits` convenience properties (`.gender`, `.mixed`, `.open`, etc.) are gone.
  Access splits by string key instead: `pb.get('gender-open')`.
- OAuth free functions signature changed — `getAuthorizationUrl(config, scopes, state)`
  is now `getAuthorizationUrl(config, { scopes, state })`.

### Added

- **Sub-resource layout** — `client.members`, `client.matches`, `client.oauth`,
  `client.leaderboard`, each a class instance with its own typed methods. Mirrors the
  REST API structure and the Python `vairified` SDK.
- **Async iterator search** — `client.members.search()` is an `AsyncGenerator` that
  yields one member at a time. Iterate with `for await (const m of ...)`; pages are
  fetched lazily so memory stays bounded. Use `maxResults` to cap, or `break` early.
- **Multi-sport ratings** — `member.sport` is a `MemberSportMap` with `.get()`,
  `.has()`, `.size`, and `Symbol.iterator` support. Each `SportRating` is also
  dict-like with the same surface for its splits.
- **Sport filter** on `client.members.get()` and `client.members.search()` — pass
  `sport: 'pickleball'` or `sport: ['pickleball', 'padel']` to restrict ratings.
- **`await using` support** — `Vairified` implements `Symbol.asyncDispose`, so clients
  wrapped in `await using` (TypeScript 5.2+) are cleaned up deterministically at block
  exit. `client.close()` is still available for manual lifecycle control.
- **Injectable `fetch`** — pass a custom `fetch` via `new Vairified({ fetch })` for
  test shims or non-Node runtimes.
- **Request timeouts** — configurable via `timeoutMs` option (default 30,000). Uses
  `AbortController` under the hood.
- **Environment presets** — `new Vairified({ env: 'staging' })` resolves the right
  base URL. Reads `VAIRIFIED_ENV` from the environment when not supplied.
- **Typed OAuth scopes** — `OAuthScope` is a string literal union, so editors and type
  checkers catch typos in scope lists at authoring time.
- **Typed error hierarchy** — `VairifiedError` base + `AuthenticationError`,
  `NotFoundError`, `RateLimitError`, `ValidationError`, `OAuthError`. All errors carry
  `statusCode` and `response`; `RateLimitError` also carries `retryAfter`.
- **Cryptographic `generateState()`** — URL-safe base64 CSRF token helper using the
  Web Crypto API.
- **Useful `toString()`** on every model class for console output:
  `Member #4873327 'Mike B.' rating=3.915 VO`.

### Changed

- **Native `fetch`** — removed the custom HTTP abstraction. The SDK now uses Node 24+'s
  built-in `fetch` directly. This keeps the bundle lean and the dependency graph empty.
- **Zero runtime dependencies.** The SDK declares nothing in `dependencies` —
  everything is authored against platform primitives (`fetch`, `URL`, `URLSearchParams`,
  `crypto`, `Symbol.asyncDispose`).
- **Engines field bumped** — requires Node ≥ 24.
- **Package layout split** — `src/client.ts` is now a slim 150-line shell; HTTP plumbing
  lives in `src/http.ts`, models in `src/models/*`, and resources in `src/resources/*`.

### Removed

- `Player` class — merged into `Member`.
- `MatchInput` / `MatchApiData` — replaced by `MatchInput` + `MatchBatch` with
  n-team × n-game shape.
- `SearchResults` class — replaced by the async iterator returned from
  `client.members.search()`.
- `MatchResult` class — renamed to `MatchBatchResult` to match the new submission model.
- `RatingSplits` convenience getters — replaced by string-keyed `SportRating.get()`.
