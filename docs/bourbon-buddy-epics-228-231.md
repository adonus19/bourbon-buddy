# Bourbon Buddy — Epics BB-228 … BB-231 (Active Plan)

**Created:** 2026-07-20
**Status:** In progress
**Owner decisions locked:** see "Locked Decisions" per epic.

> **This file is the source of truth for this block of work.** Mark stories
> complete here as they land (`[x]` + the commit sha). A new session should read
> this file first to know what's done and what's next.

## Progress at a glance

| Epic | Theme | Stories | Status |
|---|---|---|---|
| A — BB-228 | Radar / preview-sheet load time | 4 | **Complete** |
| B — BB-229 | Discreet Total Spent | 4 | **Complete** |
| C — BB-230 | Sharing (friends-only) | 6 | In progress — 230a done (foundation) |
| D — BB-231 | Angular 20.3 → latest migration | 1 | Deferred — last |
| E — BB-232 | Turn the service worker on | 1 | Deferred — owner decision |
| F — BB-233 | Article flavor profiles missing Finish | 1 | Code landed — owner backfill/verify pending |

**Working agreement for every story:** TDD (test first), `ng build` clean before
done, then drive it through the `verify` skill against the emulators. Branch
`feature/BB-XXX-short-description` off `main`; conventional commits.

---

# Epic A — BB-228: Radar & Preview-Sheet Load Time

**Problem.** Tapping a bottle on the Dispatch → Radar tab can take up to ~20
seconds to show content, with **no loading indicator at all**, so the UI reads as
broken.

**Evidence gathered 2026-07-20 (code trace):** opening
`BottlePreviewSheetComponent` fires redundant, partly serialized reads —

- [bottle-preview-sheet.component.ts:170](../src/app/shared/components/bottle-preview-sheet/bottle-preview-sheet.component.ts#L170) — `catalog.getById(bourbonId)`
- [similar-bottles.component.ts:104](../src/app/shared/components/similar-bottles/similar-bottles.component.ts#L104) — `catalog.getById(` **same id** `)`, a second network read of the same doc, no cache
- [price-history.component.ts:68-73](../src/app/shared/components/price-history/price-history.component.ts#L68-L73) — awaits `friendsOnce()` (a `getDocs`), *then* up to two more `getDocs` sequentially

~5 round trips, several needlessly chained, per sheet open.

**Why the sheet matters beyond Radar:** it is also opened from the Dispatch feed
chips ([dispatch.page.ts:227](../src/app/features/dispatch/dispatch.page.ts#L227))
and from Hunt List bottle lookup (BB-217). Graph analysis ranked it a top-10 god
node (30 edges) with an EXTRACTED hyperedge binding it to `critic-summary`,
`price-history`, and `similar-bottles`. Fixing it pays off on **three** surfaces.

**~20s is well past "too many round trips"** — that magnitude points at
infrastructure, so BB-228a measures before BB-228d changes anything.

### Stories

- [x] **BB-228a — Instrument the sheet-open path.** *(DONE — cause found and
  fixed; see ROOT CAUSE below. Also covers BB-228d, which is no longer needed.)*
  Timestamp every read from Radar tap → content painted; log per-read durations
  and the gaps between them. Identify which suspect owns the 20s:
  1. ~~Firestore WebChannel → long-polling fallback, fixed with
     `experimentalAutoDetectLongPolling`~~ — **the proposed fix was wrong.**
     `DEFAULT_AUTO_DETECT_LONG_POLLING = true` in the installed
     `@firebase/firestore` (firebase 11.10.0, `dist/index.node.mjs:28137`), so
     auto-detect is **already on**. The transport can still stall — auto-detect
     works by *attempting* the stream and inferring a buffering proxy, which
     costs time and misclassifies a stream that is outright blocked rather than
     buffered — but enabling a flag that is already enabled is not the remedy.
  2. App Check rejecting the request ([app.module.ts:87](../src/app/app.module.ts#L87)) —
     see the observed error below.
  3. `persistentMultipleTabManager` lease contention with a stale tab
  **AC:** a written finding naming the cause with timing evidence. No fix yet.

  **Built:** `PerfTrace` (`src/app/shared/utils/perf-trace.ts`) + `PerfTraceService`
  (`src/app/core/services/perf-trace.service.ts`). One trace spans the whole open,
  shared across the sheet and its children, closed on modal dismiss. Each span
  records a **start offset and a duration**, so chained vs. concurrent reads are
  readable off the log. Off in production; `measure()` returns the caller's promise
  untouched when no trace is active, so it adds no microtask tick. Instrumented:
  `radar-card.view()`, `dispatch.openBottle()`, `bottle-preview-sheet.load()`,
  `similar-bottles.load()`, `price-history.ngOnInit()`.

  **Measured 2026-07-20 against the emulators** (Radar → View, seeded catalog
  bottle with profile, neighbors, and 3 price points):

  ```
  [perf] radar → preview sheet — 4293ms total   (envelope inflated by a 4s test wait)
    @0ms   modal.create+present            353ms
    @34ms  price.friendsOnce                63ms
    @35ms  similar-bottles.catalog.getById  90ms
    @40ms  sheet.catalog.getById            87ms
    @97ms  price.pointsForBottle           144ms
  ```

  **Confirmed by measurement:**
  1. **The duplicate read is real** — `similar-bottles.catalog.getById` (@35ms)
     and `sheet.catalog.getById` (@40ms) fetch the *same* doc, ~90ms each. BB-228c.
  2. **The price-history chain is real** — `price.pointsForBottle` starts at
     @97ms, exactly when `price.friendsOnce` ends (34+63). Textbook serialization;
     `Promise.all` removes one full round trip. BB-228c.
  3. **All actual work finished by ~241ms.** The code path is *not* what costs
     20 seconds.

  **Observed on the owner's laptop, 2026-07-20 (`ng serve`, live
  `bourbonbuddy-dev`):**

  ```
  [Error] Fetch API cannot load
  https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel
    ?VER=8&database=projects%2Fbourbonbuddy-dev%2F...&RID=rpc&TYPE=xmlhttp
  due to access control checks.
  ```

  That is the **WebChannel backchannel** (`/Listen/channel`, `RID=rpc`) — the
  streaming transport every realtime listener rides — failing at the CORS layer
  before any data arrives. "due to access control checks" is Safari's wording for
  a blocked cross-origin request. This is the root error; the rest of the console
  noise is almost certainly downstream of it, and it plausibly explains the whole
  20s: every listener retries with backoff instead of failing fast.

  **App Check was investigated and RULED OUT.** The hypothesis was an
  unregistered local debug token (app-check-setup.md §2.2 warns about it, and the
  code comment references a prior outage). Test: `recaptchaSiteKey: ''`, which
  disables App Check init entirely. The identical CORS error persisted and no
  debug token was minted. Not the cause.

  **ROOT CAUSE — Safari refuses the WebChannel stream over the Fetch API.**
  Three facts line up:
  1. The browser build streams the WebChannel over fetch by default —
     `registerFirestore(variant, useFetchStreams = true)`.
  2. Safari blocks that cross-origin fetch stream, hence the error's exact
     wording: "**Fetch API** cannot load … due to access control checks".
  3. `experimentalAutoDetectLongPolling` (already `true`) does not rescue it:
     it detects a *buffering proxy*, not a stream refused outright, so the
     fallback never triggers. Listeners retry with backoff instead.

  Downstream symptoms all follow: no realtime listener connects, so the app
  renders only what IndexedDB already had (owner saw just "Sorted by date added"
  / "12 pours" — that was the **cache**, not a half-loaded page), and the
  Ionicons / `InvalidCharacterError: '[object Object]'` tab-bar errors were
  secondary. Sign-in still worked because Auth uses plain requests, not a stream.

  **Confirmed by browser comparison:** Firefox — no error. Safari — error.
  Headless WebKit and Chromium both render the login shell cleanly (the failure
  is post-auth only), so the login page is not a useful reproduction surface.

  **FIX (landed): `experimentalForceLongPolling: true`** in
  [app.module.ts](../src/app/app.module.ts). `useFetchStreams: false` would be
  narrower but is not on the public `FirestoreSettings` type (internal to
  `registerFirestore`), so it fails to compile; forcing long polling routes off
  fetch streams as a side effect. Costs extra requests vs. a live stream —
  Firestore bills per *document read*, so read cost is unchanged. Kept global
  rather than UA-gated: this is an iOS-first PWA and every iOS browser is WebKit.

  **Owner verified in Safari 2026-07-20:** app loads, Radar bottles open, the
  Ionicons errors are gone.

- [x] **BB-228b — Loading state.** *(DONE)*
  Skeleton inside `BottlePreviewSheetComponent`; pressed/disabled state on
  `RadarCardComponent.view()` so the tap registers instantly.
  **AC:** no surface can show an empty sheet with no affordance; loader appears
  within one frame of the tap.

  **Built:** a skeleton block in the sheet replaces the blank gap while the
  catalog read is in flight — scoped to the *flavor* block only, because
  `price-history` and `similar-bottles` render immediately and manage their own
  loading; gating them on `loaded()` would have re-serialized the reads the rest
  of this epic removes. `RadarCardComponent` gained an `opening` signal that
  disables the View button and swaps in a spinner, plus a double-tap guard so one
  tap opens exactly one sheet. No skeleton flashes for a bottle with no
  `bourbonId` (nothing to fetch).

- [x] **BB-228c — Remove redundant work.** *(DONE)*
  Bounded in-memory doc cache in `BourbonCatalogService` (kills the duplicate
  `getById`); `Promise.all` the price-history reads; memoize `friendsOnce()`.
  **AC:** one sheet open performs at most one `getById` per bourbonId; friends +
  price-history reads run concurrently.

  **Built:**
  - `BourbonCatalogService.getById` — in-flight request sharing + a bounded
    (50-entry) 30s TTL cache. TTL is deliberately short: catalog docs are
    enriched server-side, so a long TTL would serve stale flavor/critic data.
    Failed reads are never cached; `addUpc` invalidates the doc it wrote.
  - `FriendService.friendsOnce` — memoized per uid. This was never one read: it
    is a collection read PLUS one `publicProfiles` getDoc per friend, on the
    critical path of every price-history load. Cleared by `removeFriend`,
    `blockUser`, and `respondToRequest` (accepting adds an edge); failures are
    not memoized.
  - `FriendService.friendUidsOnce` — **new.** Friend uids are needed as *query
    input* for `where('spotterUid','in',[...])`, which is why the preview sheet
    touches the friend graph at all: its crowd-price line reads `/priceHistory`,
    and friends' points are only visible if the query names them. The uid
    already **is** the friends edge doc ID, so hydrating each friend's public
    profile for that was N document reads thrown away. This is one collection
    read, and it derives from the hydrated cache when that is already loaded.
    Only `price-history.component` uses it — `sightings-map` and `friends-feed`
    genuinely render names. **Note:** `sightings-map.build()` calls
    `loadSightings()` and `friendNames()` in one `Promise.all`, so switching
    only the first would make it pay for *two* caches; it stays on `friendsOnce`
    deliberately.
  - `PriceHistoryService.priceHistoryForBottle` now accepts
    `string[] | Promise<string[]>` for friend uids. The own-points query does not
    depend on them, so it is issued first and runs while the friend lookup
    resolves — breaking the chain at its source rather than at the call site.

  **Measured after (same seeded scenario and driver as the BB-228a baseline):**

  ```
  [perf] radar → preview sheet
    @0ms   modal.create+present            336ms
    @30ms  price.friendsOnce                69ms
    @31ms  price.pointsForBottle           119ms   ← was @97ms
    @32ms  similar-bottles.catalog.getById 134ms
    @37ms  sheet.catalog.getById           130ms
  ```

  **Result: all reads complete by ~167ms, down from ~241ms (≈31% faster).**
  The chain is gone — `price.pointsForBottle` now starts at @31ms alongside
  `price.friendsOnce` instead of waiting for it to finish at @97ms.

  **On the duplicate `getById`:** both spans still appear, because both callers
  still *ask*. They now share one request — visible in the trace as the two spans
  ending at the same instant (166ms / 167ms). The reduction to a single network
  read is asserted directly by unit test ("collapses concurrent reads of the same
  doc into one fetch" — `getDoc` called once); the trace alone does not prove it.

- [x] **BB-228d — Apply the infrastructure fix identified by BB-228a.**
  *(DONE — landed together with BB-228a: `experimentalForceLongPolling: true`.
  Owner confirmed in Safari that the app loads and Radar bottles open normally.)*

---

# Epic B — BB-229: Discreet Total Spent

**Premise.** Some users want to hide their lifetime spend on the Numbers page —
sometimes from a partner, sometimes from themselves. Toggle lives in the top-right
of the Total Spent card.

### Locked decisions

- **Scope: the Total Spent tile only.** Owner decision 2026-07-20. Value Score
  (`rating/price`), avg price, most-expensive and the spend charts stay visible
  and can be used to back into the number — accepted tradeoff.
  → **Implementation note:** build the mask as a `masked(field)` check, not a
  one-off on the tile, so widening scope later is a one-line change.
- Storage: `spendPrivacy` on `/users/{uid}` — the profile listener is already
  open, so **zero extra reads**. Not localStorage (must survive reinstall).
- Copy must land the joke **without assuming the user is a married man** —
  "Who are we hiding this from?" gets the same laugh, excludes nobody.

### The three modes

| Choice | Behavior |
|---|---|
| "Someone I share a roof with" | Instant mask, one-tap reveal, unremarkable `—` placeholder. **No gauntlet** — if a partner is standing there, a 30s puzzle is worse than useless, and a loud "🔒 HIDDEN" badge is *more* suspicious than a number. |
| "Myself. I don't want to know." | The escalating gauntlet below. |
| "Just hide it, no bit" | Plain toggle. |

### The gauntlet ladder

Tier escalates per reveal within a rolling window, resets weekly, caps at 7.
Every rung must be solvable.

1. Tap "Yes, show me."
2. Confirm twice — *"You sure? You already know it's bad."*
3. Type the phrase: `I can afford this`
4. Arithmetic: *"What's 47 × 3?"*
5. Hold to reveal, 10 seconds, progress bar labeled *"Reconsidering…"*
6. Order four bottles by proof.
7. 20-second cooldown, then a very small "Reveal anyway."

### Stories

- [x] **BB-229a — Toggle + masked tile + persistence.** *(DONE — shipped with
  the rest of Epic B; `cd761e9`)*
  Eye toggle top-right of the Total Spent card; masked `—` value; `spendPrivacy`
  persisted on the user doc via the existing profile listener.
  Masking is `displaySpend()` in [spend-privacy.ts](../src/app/shared/utils/spend-privacy.ts),
  a `masked(field)`-style check per the locked decision, not a one-off on the tile.
- [x] **BB-229b — First-run "Who are we hiding this from?" modal.** *(DONE)*
  Three modes; the joke lives in the hints, not the labels (labels must work for
  whoever holds the phone). Shown only on the FIRST hide (`configured` gates it);
  dismissing cancels the hide rather than defaulting a mode — `self` costs a
  minute per reveal and nobody should land in it by closing a sheet. Self-mode
  hint states the real cost up front: "All seven stages, every time."

  **Verified end-to-end 2026-07-20** (emulators, seeded user, $145 total):
  $145 → mode modal → "Me. I don't want to know." → masked `—` → tap reveal →
  gauntlet opens → 3 wrong phrases → escape hatch ("Alright, you've suffered
  enough.") → $145 revealed. Partner/plain reveal instantly; confirmed the
  self path runs the gauntlet and the others don't.
- [x] **BB-229c — The gauntlet.** *(DONE — self mode only; partner and plain skip it)*

  **Shape (owner-corrected 2026-07-20):** ONE reveal runs **all seven stages,
  every time**, easy → absurd. There is no per-attempt tier counter and nothing
  to resume — an earlier plan had the ladder escalating across attempts, which
  was a misreading. Closing the sheet mid-run (e.g. to go look up which bottle
  you rated highest) means **starting over at stage 1**. Repeating the same
  questions on a restart is acceptable; fresh ones are better.

  **Stages:** 1 tap · 2 double-confirm · 3 type `I can afford this` ·
  4 arithmetic · 5 hold 10s · 6 pick-the-answer · 7 twenty-second cooldown
  (owner confirmed 20s stands, on every reveal).

  **Puzzle freshness — own-data + procedural, no AI.** Rationale: an AI puzzle
  pool is per-user on-demand generation, the exact shape the extract-once cost
  discipline exists to avoid, and a hallucinated answer key locks a user out of
  their own data with nothing to validate against. Own-data is infinitely
  varied, always correct (the database IS the answer key), personal, and free.
  - stage 4 — random operands, generated client-side
  - stage 3 — rotate a written phrase bank
  - stage 6 — from the user's own cellar ("which of these did you rate
    higher?" / "which cost you more?"); **fallback when cellar data is thin:
    the Radar** ("which bottle is Nth on your Radar right now?"), whose answer
    the app always knows. Fixed proof bank as the last resort.

  **Escape hatch:** after 3 failures at any stage, a quiet "Fine, show me."
  Copy should have a little edge — the user cannot hack it and we're bailing
  them out — but no profanity and nothing suggestive.
- [x] **BB-229d — Escape hatch.** *(DONE)*
  Settings kill-switch **and** a quiet "fine, show me" after 3 failed attempts
  (the latter ships with BB-229c). Without this the feature traps users in their
  own joke — this is an accessibility requirement, not a nicety.

  **Built:** a "Total spent" section on the profile page — an unconditional
  off-switch plus a mode selector shown only while hiding is on. Turning it off
  clears ONLY `hidden`, so mode/`configured`/`gauntletRuns` survive and
  re-hiding later doesn't re-interrogate the user.

  **The exit is unconditional in every mode, including `self`** — guarded by a
  regression test, because "make self mode harder to escape" is a tempting
  future change that would defeat the story. The gauntlet is a commitment
  device, not security: anyone can read purchase prices off their own cellar
  entries, so gating this buys no real friction and only risks a genuine lockout.

  **Owner addition (2026-07-20):** turning the switch off pops a confirmation
  that acknowledges the loophole rather than pretending it isn't one —
  *"Thought you could just come here and turn it off? …You're right."* — then
  yes/no. Friction and a joke, not a barrier.

---

# Epic C — BB-230: Sharing (friends-only, in-app)

### Locked decisions

- **Reach: friends-only, in-app.** Owner decision 2026-07-20. Rides the existing
  `FriendService` + inbox + Admin-SDK callables. No OS share-sheet / public links
  — those need unauthenticated landing pages, which fight the invite-gated access
  model (BB-210): a shared link to a non-approved recipient hits the pending screen.
- **Shared lists live in a Hunt List page segment** ("Mine" / "Shared with me"),
  **not a 6th bottom tab.** Five tabs is already the phone maximum. Grouping by
  sharer, collapsible, top group expanded — as originally designed, just hosted
  in the segment.
- **What is shared is the *catalog bottle*, never your log entry.** A log entry
  carries your price paid, personal notes, and rating. Share `bourbonId` +
  denormalized display fields; including your rating is a separate opt-in.
- **Shared lists are a frozen snapshot**, not a live subscription. A live view
  would need cross-user reads on `wishlistEntries`, which are owner-only today.

### Design notes / corrected assumptions

- **Shelf / Journal / Graveyard are derived, not settable.** Per the data model
  they come from `entryType` + `bottleStatus`. The receive chooser presents them
  as *intents that preset the log form*: Graveyard = owned + `bottleStatus:'finished'`;
  Journal = a `drink` entry. Hunting / Got Away **do** map to real
  `WishlistStatus` values (`actively_looking` / `got_away`).
- **Radar/Dispatch bottles often have no `bourbonId`.** The share callable must
  `findOrCreate` server-side so both sides key on the same catalog id.
- **Shares cannot live in the inbox alone.** `AppNotification` is auto-deleted at
  ~30 days and users can mark-all-read / swipe-delete (BB-214) — a pending share
  would silently vanish. Needs `/users/{uid}/sharedItems/{id}` as durable state,
  with the notification merely deep-linking to it.
- Abuse surface: rate-limit shares/day (BB-122 pattern), enforce blocks
  server-side, cap list size (~100 entries), add a `bottleShare` notification pref.

### Stories

- [x] **BB-230a — Schema + callables.** *(DONE — functions + tests; not yet deployed)*
  **Built:**
  - `SharedItem` model (`src/app/models/shared-item.model.ts`) at
    `/users/{recipientUid}/sharedItems/{id}` — durable state that outlives the
    30-day notification TTL; `kind: 'bottle' | 'list'`, denormalized sharer +
    bottle, `status: pending|imported|dismissed`, reserved `sharerRating`.
  - `shareBottle` callable (`functions/src/sharing/index.ts`) as an extracted,
    unit-tested `shareBottleLogic` behind a thin onCall (codebase pattern):
    `requireApproved` → **friends-only** (recipient must be a `/friends/` edge)
    → **block check both directions** → **findOrCreate catalog** → **50/day
    rate limit** (BB-122 transaction pattern) → durable write → notify.
  - `findOrCreateBourbon` (`functions/src/shared/catalog.ts`) — reusable, mirrors
    the extraction match order (nameNormalized→alias→nameLowercase→create), so
    Radar/Dispatch bottles with no `bourbonId` resolve to a shared id.
  - `bottleShare` / `listShare` added to `NotificationType` (functions + frontend)
    and `NotificationPrefs` (default off) with toggle rows in notification
    settings + an inbox icon.
  - Composite index `sharedItems (status ASC, createdAt DESC)`.
  - Tests: `catalog.spec` (6) + `sharing.spec` (6, covering friends-only, block,
    rate limit, findOrCreate, notify). Functions suite 296 green; `ng build` +
    `functions` build clean.

  **Scoping decisions (locked here):**
  - **`shareList` deferred to BB-230d** — its body needs the frozen-snapshot
    design. BB-230a lays the full foundation (`kind`, `listShare` type/pref,
    limits); only `shareBottle` ships now.
  - **Rating opt-in reserved, wired in BB-230b** — `SharedItem.sharerRating`
    exists; the share UI toggle + server-side rating lookup land with the button.
  - **No new Firestore rule needed** — the catch-all `/users/{userId}/{sub}/**`
    already scopes `/sharedItems` to owner-only, and cross-user injection is
    impossible (only the Admin-SDK callable writes cross-user).
  - **Deploy pending** (owner) — new callable + index not yet deployed to dev.
- [x] **BB-230b — Share button on all four bottle surfaces.** *(DONE — functions
  + frontend; not yet deployed)*
  **Built:**
  - `SharingService` (`core/services/sharing.service.ts`) — thin wrapper over the
    `shareBottle` callable.
  - `ShareBottleModalComponent` (`shared/components/share-bottle-modal/`) — friend
    picker (`friendsOnce()`), optional note, and a **rating opt-in toggle shown
    only when the surface has a rating** (Cellar). Friends-only empty state links
    to `/friends`.
  - Share button wired on **three code locations covering all four surfaces**:
    Cellar detail (`log-entry-detail`, passes the entry's rating), Hunt List
    detail (`wishlist-detail`), and the `bottle-preview-sheet` — which is opened
    from **both** the Dispatch feed and the Radar, so one button covers two of
    the four surfaces.
  - Backend: `shareBottleLogic` now accepts a range-validated `sharerRating`
    (0–5, client-provided own rating), stored on the shared item.
  - Tests: `sharing.spec` (8, incl. rating validation), `sharing.service.spec`
    (2), `share-bottle-modal.component.spec` (4, incl. the rating opt-in branch).
    Functions + `ng build` clean; no regressions in touched specs.
  - **Deploy pending** (owner) — the `shareBottle` rating change redeploys the
    callable.
- [ ] **BB-230c — Receive chooser.**
  Cellar (Shelf / Journal / Graveyard as form presets) or Hunt List (Hunting /
  Got Away).
- [ ] **BB-230d — Share the full Hunt List** as a frozen snapshot.
- [ ] **BB-230e — "Shared with me" segment** in the Hunt List page: grouped by
  sharer with metadata, collapsible, all but the top group collapsed by default;
  import-into-my-list or keep-separate.
- [ ] **BB-230f — Housekeeping: delete `src/assets/shapes.svg`.**
  Untouched Ionic starter boilerplate in a light palette that contradicts the
  always-dark design system. Confirmed **zero references** across `src/` and
  `angular.json` (grep, 2026-07-20). Surfaced by the graphify run.
  *Considered and rejected:* adding a visible Glencairn/Noun Project attribution —
  owner decision 2026-07-20, would clutter the UI and there are no
  commercialization plans. The SVG is never loaded at runtime anyway (its path
  data is inlined in `rating-widget.component.ts`).

---

# Epic D — BB-231: Angular 20.3 → latest migration

**Deferred until all of Epics A–C are complete.** Owner decision 2026-07-20:
prefer staying current with Angular rather than pinning the vendored
`angular-developer` skill docs to 20.3.

**Context.** `.agents/skills/angular-developer/references/` is a generic vendored
Angular skill documenting **v21+** idioms — `@Service()`, Signal Forms,
`httpResource`. This project is pinned to **20.3** with
`@Injectable({providedIn:'root'})` and Reactive Forms. Today that mismatch is a
footgun: an agent following the reference docs literally writes code that doesn't
compile. Migrating resolves the contradiction in the right direction.

### Story

- [ ] **BB-231 — Migrate Angular 20.3 → latest.**
  **AC:**
  - `ng update @angular/core @angular/cli` through each major, running the
    official migration schematics per step (see the skill's `migrations.md`)
  - Ionic 8 + AngularFire compatibility verified against the target major before
    starting
  - Full unit suite green; `ng build` and `npm run build:prod` clean
  - `verify` skill pass over the primary flows (auth, cellar, hunt list,
    dispatch, numbers)
  - Decide per-surface whether to adopt Signal Forms; **no big-bang forms
    rewrite** — Reactive Forms keep working
  - CLAUDE.md updated: version, forms guidance, and the `@Service()` note

---

# Epic E — BB-232: Turn the service worker on

**Deferred by owner decision 2026-07-20** — deliberately staying off while
feature iteration is fast, because a service worker's stale-cache behavior
fights frequent rollouts. Revisit once feature velocity slows.

**Discovered 2026-07-20** while tracing which environment file the deployed app
uses. The service worker is off in the live app for **two independent reasons**:

1. [app.module.ts:60](../src/app/app.module.ts#L60) —
   `ServiceWorkerModule.register('ngsw-worker.js', { enabled: environment.production })`,
   and the live site is built by `.github/workflows/deploy.yml` with
   `npm run build:staging`, whose configuration has no `fileReplacements`, so it
   runs `environment.ts` with `production: false`.
2. The `serviceWorker` **build option** exists only on the `production`
   configuration in `angular.json`, so `build:staging` never generates
   `ngsw.json` or emits `ngsw-worker.js` at all.

**Current consequences (accepted for now):**
- No app-shell precaching — every launch is a network fetch
- No offline shell; the installed home-screen app needs a connection to boot
  (Firestore offline still works — that's `persistentLocalCache`, unrelated)
- `AppUpdateService` never fires, since it is driven by SW update events

**Note:** the owner runs the app installed on an iPhone home screen today and it
works fine — so this is a latent capability gap, not a live defect.

### Story

- [ ] **BB-232 — Enable the service worker in the deployed app.**
  **AC:**
  - Decide the gate: either give `staging` its own `fileReplacements` +
    `serviceWorker: true`, or switch the register flag off a dedicated
    `enableServiceWorker` environment field rather than `production`
    (`production` is not a reliable "is deployed" signal in this repo)
  - `ngsw.json` + `ngsw-worker.js` are emitted by whichever build CI deploys
  - `ngsw-config.json` reviewed: app shell + assets precached, Firestore/API
    calls NOT cached
  - `AppUpdateService` verified end-to-end — a new deploy prompts an update
    rather than silently serving a stale shell
  - Verified on an installed iOS home-screen PWA, including the update path

---

# Epic F — BB-233: Article-extracted flavor profiles are missing Finish

**Reported by owner 2026-07-20.** On a bottle opened from the Dispatch Feed or
Radar, a flavor profile sourced from an article ("Based on 1 review") shows
**Nose** and **Palate** but never **Finish**. Reproduced by the owner across
every bottle checked (example: Maker's Mark, 3rd on Radar — "Nose: Lemon,
vanilla, cocoa", Palate present, Finish absent).

**Slated after Epic B (BB-229) by owner decision.**

### What has already been ruled out

The owner's hypothesis was that the model sees the word "Finish" and treats it
as an end-of-output marker. The schemas say otherwise — **both** AI paths
explicitly request all three stages:

- `functions/src/ai/extraction.ts:193-195` — per-article bottle extraction
  declares `nose`, `palate`, **`finish`** in the response schema, and the prompt
  text at `:91-92` spells out the same shape.
- `functions/src/ai/flavor-enrichment.ts:47-55` — the feed-(b) enrichment schema
  declares all three and lists all three in `required`.

So this is not a missing field in the request.

### ROOT CAUSE (found 2026-07-21) — the extraction `flavor` sub-schema left `finish` OPTIONAL

The truncation hypothesis below was **ruled out**, and the true cause is one
schema difference between the two AI paths:

1. **Display is innocent.** `bottle-preview-sheet.component.html:41` renders
   Finish identically to Nose/Palate (`@if (blendedTags().finish.length)`), so an
   empty finish array simply renders as absence. The stored `finish` is genuinely
   empty.
2. **Truncation is NOT the cause.** Extraction runs at an **8192-token** cap
   (`index.ts` `MAX_OUTPUT_TOKENS`) — 12 bottles fit easily. And when a reply *does*
   truncate, `repairTruncatedEnvelope()` keeps only **complete** top-level bottles:
   a single truncated bottle fails outright (→ retry), earlier bottles keep their
   finish. Neither path can yield "every bottle, always finish empty."
3. **The seed/merge/taxonomy path preserves finish** symmetrically
   (`sanitizeFlavorTags` → `matchCanonicalTags` → `mergeFlavorTags`, all per-stage).
   Taxonomy-drop can't be 100% systematic either — many review finishes are
   canonical flavor words (oak, pepper, chocolate) that match.
4. **True cause:** the `flavor` sub-object in `EXTRACTION_RESPONSE_SCHEMA`
   (`extraction.ts`) declared `nose`/`palate`/`finish` but had **no `required`
   array and no `propertyOrdering`**. Under Gemini's controlled decoding an
   optional trailing property is dropped and ordering defaults to alphabetical, so
   `finish` was systematically omitted. The **enrichment** schema
   (`flavor-enrichment.ts:47-55`) lists `required: [nose, palate, finish]` and
   captures finish fine — same model family, one schema difference, decisive.

### FIX (landed 2026-07-21)

- **`extraction.ts`** — added `required: ["nose","palate","finish"]` +
  `propertyOrdering: ["nose","palate","finish"]` to the flavor sub-object,
  mirroring the working enrichment schema. A note-less article still yields
  `finish: []`; a note-bearing one now always emits the key.
- **`applyArticleSeed` (`flavor-enrichment.ts`)** — new `remerge` flag: a force
  re-extraction re-seeds an already-counted article, unioning the newly-captured
  finish into the arrays **without** re-bumping any count or `seededArticleIds`
  (the "never double-count" invariant holds). Threaded through
  `seedArticleFlavor` → `processArticle` → `sweepUnprocessed` (force ⇒ remerge).
- **AC#1 fold-in** — `extractBottleNames` logs the raw model envelope on the
  force/backfill path only (`[BB-233]`), so a backfill run *shows* finish
  returning in real output.
- Tests: extraction schema now asserted to require finish + pin order; a
  truncation regression proves the repair never emits a 2-stage bottle; remerge
  proves finish recovery with no double-count. Full functions suite green (284).

### Story

- [~] **BB-233 — Restore Finish on article-sourced flavor profiles.** *(code
  landed; **owner-driven deploy + backfill + Radar check remaining**)*
  **AC:**
  - [x] Cause confirmed against a **real model envelope** (2026-07-21): ran the
    live `gemini-3.1-flash-lite` extraction with the fixed schema on a Maker's Mark
    review — envelope returned
    `finish: ["long","warming","lingering oak","dark chocolate","peppery kick"]`
    (was omitted entirely pre-fix); a note-less announcement returned zero bottles
    (no fabrication). **Follow-up noted:** some finish terms are length/texture
    words ("long","warming") that `matchCanonicalTags` drops, but flavor words
    survive (→ Oak, Dark Chocolate), so finish populates and renders — a minor
    taxonomy-coverage polish, not a blocker.
  - [x] Fixed at the true layer (extraction schema), not the display
  - [x] Regression test — truncated envelope drops the incomplete bottle rather
    than silently yielding a 2-stage profile
  - [x] **Backfill run 2026-07-21** (deployed dev; `invoke-backfill.js 60 60 force`,
    server clamps `sinceHours` to `REPROCESS_MAX_HOURS = 48`). Ran 13:54→14:03,
    hit the 540s timeout before the summary line (per-article writes persist; no
    errors, no rate-limit). Live `[BB-233]` envelopes confirmed finish now emits on
    every bottle: **populated** where the article had notes — The Lakes Chocolatier
    `["dark chocolate"]`, Copperworks Farmsmith `["cereal","mealy"]` — and correctly
    **empty** on announcements (Bulleit, Fireball, Old Forester 86, Skrewball), no
    fabrication.
  - [ ] **Verify (owner):** open The Lakes Chocolatier / Copperworks on Radar to
    see the new Finish line. **Caveat:** the owner's original Maker's Mark
    ("Based on 1 review") is sourced from an article >48h old, so it was NOT in
    this window — it'll gain finish when a fresh article mentions it, or if we
    widen the reprocess window. Deeper backfill = raise `REPROCESS_MAX_HOURS` (or
    add an id-targeted reseed) + redeploy; deferred unless the owner wants it now.
