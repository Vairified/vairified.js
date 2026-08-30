# Changelog

All notable changes to the Vairified TypeScript SDK are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2026-08-30

### Added

- **`client.events.list()` — the event catalogue.** Until now the API could tell you about an event you already had an id for, which only helps a partner who had been pushed one. This is the read a directory is built on: what is on, near a point, within a date range.

  ```ts
  const { events, total } = await client.events.list({
    type: 'TOURNAMENT',
    lat: 30.2849,
    lng: -97.7341,
    radiusMiles: 25,
  });
  ```

  `lat`, `lng` and `radiusMiles` go together — sending one or two of them is rejected by the API rather than ignored, because a half-applied location filter returns events nowhere near the point given while looking like it worked. An event with no coordinates is excluded from a radius search: it cannot be known to be within the radius.

  Dates match on **overlap**, so a multi-day event is returned when the window falls anywhere inside it.

- **Events now carry a location.** `event.location` gives the venue name, address, city, state, zip and coordinates. `location.hasCoordinates` tells you whether it can go on a map.

  ⛔ `latitude` and `longitude` are `null` when an event has never been geocoded — never `0`. Zero is a real coordinate in the Gulf of Guinea, so a `0` fallback would cluster every un-located event on one pin in the ocean, and the map would look like it were working.

  New exports: `PartnerEvent`, `EventLocation`, `EventClub`, `EventsPage`, `EventsResource`, and the matching wire types.

  Requires the `key:event:read` scope, which is TRUSTED-gated — the same scope as the existing per-event reads.

## [0.6.0] - 2026-08-25

### Added

- **`matches.tournamentImport()` now tells you which players it created** ([Vairified#1134]). An import previously reported only a count of ghost players, so a partner could cause 32 accounts to exist and address none of them — and therefore still could not submit scores for a field containing anyone new. The result now carries their member ids:

  ```ts
  const result = await client.matches.tournamentImport({
    sport: 'pickleball',
    tournamentName: 'Spring Classic',
    ghostMembers: [{ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' }],
    matches: [...],
  });

  for (const ghost of result.createdGhostMembers) {
    console.log(ghost.ref, '->', ghost.memberId); // ada@example.com -> 900001
  }
  ```

  - `ref` is the email or phone **you** supplied in `ghostMembers[]`, echoed back so results map onto your own records without a second lookup.
  - **Created only.** Entries matched to a player who already existed are deliberately absent — resolving an existing email to a member requires the `key:player:lookup` scope and `members.getByEmail()`, and this endpoint is not a way around that.
  - Empty on a dry-run, which creates nothing, and empty against an older API build that does not send the field.

- **`Member.memberSince` — the date an account was created** ([Vairified#1132]). Apply a new-accounts-only referral rule, crediting an ambassador only for accounts created because of their event:

  ```ts
  const result = await client.members.getByEmail(['ada@example.com']);
  const member = result.matched[0]?.sole;
  console.log(member?.memberSince); // '2026-08-14'
  ```

  - A **date**, not a timestamp — the question it answers is "did this account pre-date my event?", and a timestamp invites tighter heuristics than that rule intends.
  - Present on `members.get()`, `members.getBulk()` and `members.getByEmail()`. **`null` on `members.search()`**, which is discovery — account age is not a property you can browse strangers by.

- **`client.referrals` — a new sub-resource for ambassador referral credit** ([Vairified#1130], [Vairified#1131]). Both halves of reconciling an event's attribution.

  `referrals.get()` reports who currently earns credit, which is what lets you tell "already credited to my own event host" from "credited to a different ambassador":

  ```ts
  const result = await client.referrals.get([4873327, 4873328]);

  for (const a of result.claimable) console.log(a.memberId, 'has no credit yet');
  if (result.get(4873327)?.heldBySomeoneOtherThan(myHostId)) {
    // a person should look before claiming this
  }
  ```

  `POST /ambassador/track` could not answer that — it reports that credit exists without saying whose.

  `referrals.attribute()` credits an ambassador for up to 500 players in one authenticated call, replacing a public endpoint capped at five requests a minute:

  ```ts
  const result = await client.referrals.attribute({
    referralCode: 'hillhurst-open',
    registrationPublishedAt: '2026-08-01',
    memberIds: [4873327, 4873328],
  });

  console.log(result.attributed, 'newly credited');
  console.log('need a human:', result.alreadyAttributed);
  console.log('too old to credit:', result.predatedEvent);
  ```

  - `registrationPublishedAt` is the date your event's registration page was **first published**. Accounts created before it did not come from the event and are rejected with `account_predates_event`. VAIR applies that rule itself, so every partner is held to the same one — and because VAIR holds no record of your registration pages, the date you send is recorded for audit. Send the real one.
  - Every member id gets **its own outcome** — `attributed`, `already_attributed`, `account_predates_event` or `not_found`.
  - **Safe to retry.** Attribution is one-per-player forever, enforced by a database constraint, so a resubmitted player returns `already_attributed` and nothing changes.
  - Each method needs its own per-partner permission: `key:referral:read` and `key:referral:write`. Neither is implied by a general read, write or admin key.

  New exported models: `MemberAttribution`, `MembersAttributionResult`, `AttributionResult`.

[Vairified#1130]: https://github.com/Vairified/Vairified/issues/1130
[Vairified#1131]: https://github.com/Vairified/Vairified/issues/1131
[Vairified#1132]: https://github.com/Vairified/Vairified/issues/1132
[Vairified#1134]: https://github.com/Vairified/Vairified/issues/1134

## [0.5.0] - 2026-08-02

### Added

- **`members.getByEmail()` — resolve members by exact email address** ([Vairified#995]). Link your users to their VAIR identity when you hold their email but not their member ID, instead of waiting for each player to complete SSO:

  ```ts
  const result = await client.members.getByEmail(['ada@example.com', 'nobody@example.com']);

  for (const match of result.matched) {
    const member = match.sole; // null when the address is ambiguous
    if (member) console.log(match.email, '->', member.memberId);
  }
  console.log('no VAIR account found for:', result.notFound);
  ```

  - **Requires the new `key:player:lookup` scope**, granted per partner on approval. Holding `key:player:search` (or `key:read`, or `key:admin`) does **not** imply it — ask VAIR to enable it for your app.
  - Matching is **exact and case-insensitive**. There is deliberately no partial, prefix or fuzzy matching.
  - Maximum **100** addresses per call; the SDK rejects an oversized or empty list, and any address containing a comma, before making the request.
  - **Every address you supply comes back** in either `matched` or `notFound` — read `notFound` directly rather than diffing your input against the results.
  - `matched[].members` is an **array**: an email is not a unique key in VAIR, so one address can resolve to more than one member. Use `.sole` (returns `null` when ambiguous) or check `.isAmbiguous` rather than assuming `members[0]`.
  - A `notFound` address is **not** proof the person has no VAIR account — unclaimed imported records are deliberately excluded from this lookup.

- New response models `MembersByEmailResult` and `MemberEmailMatch` (both frozen, like every other model). `MembersByEmailResult.get(email)` looks an address up case-insensitively; `.allResolved` and `.memberCount` are convenience accessors. New wire types `MembersByEmailResultWire` and `PartnerMemberEmailMatchWire`.

[Vairified#995]: https://github.com/Vairified/Vairified/issues/995

## [0.4.0] - 2026-07-02

### Breaking Changes

- Per-sport VAIRification & VAIR-Pro status (Vairified#783). `isVairified`, `isRater`, `isVairPro`, and `isVairProStatus` moved off the member `status` object onto each per-sport entry — read them via `member.sport.get(code)` (e.g. `member.sport.get('pickleball')?.isVairified`). The member `status` object now carries only the genuinely global flags: `isWheelchair`, `isAmbassador`, `isConnected`. This mirrors the backend: a player can be VAIRified / a VAIR Pro in one sport but not another.

### Added

- `SportRating.isVairified`, `.isRater`, `.isVairPro`, `.isVairProStatus` (type `VairProStatus = 'PENDING' | 'ACTIVE' | null`), exposed on every `member.sport` entry.
- **React Native / Hermes hardening** (still zero runtime dependencies). `generateState()` feature-detects `crypto.getRandomValues` and now encodes its base64 in pure JS (no `btoa` dependency); when Web Crypto is absent it throws a descriptive error pointing at `react-native-get-random-values` instead of a bare `ReferenceError`. The `VAIRIFIED_API_KEY` / `VAIRIFIED_ENV` fallbacks read `process.env` defensively, so a missing `process` global no longer risks a crash. New README "React Native" section documents the required polyfills (`react-native-get-random-values`, `react-native-url-polyfill`), passing `apiKey`/`env` explicitly, and keeping the secret `X-API-Key` off the device by running the OAuth code exchange on the partner backend.

## [0.3.2] - 2026-07-15

### Fixed

- **OAuth + member requests now match the deployed Partner API.** Earlier versions sent the wrong wire and could not complete the flow against `api-*.vairified.com` without hand-patching ([#844]):
  - `oauth.authorize()`, `oauth.exchangeToken()`, `oauth.refresh()`, and `oauth.revoke()` now send snake_case bodies (`redirect_uri`, `refresh_token`, `player_id`), space-delimited `scope` (RFC 6749 §3.3), and the required `grant_type` (`authorization_code` / `refresh_token`).
  - Token responses are read from the API's snake_case fields (`access_token`, `refresh_token`, `expires_in`, `player_id`, space-delimited `scope`), falling back to the deprecated `scopes` array.
  - `oauth.authorize()` reads the API's `authorization_url` field.
  - `members.get()` looks the player up by the `memberId` query parameter (was `id`, which returned 404).

### Added

- `getAuthorizationUrl()` accepts an optional `clientId` (your `PartnerApp` slug) and emits it as `client_id` — required by the browser `GET /partner/oauth/authorize` endpoint. Scopes in the built URL are now space-delimited.

[#844]: https://github.com/Vairified/Vairified/issues/844

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
