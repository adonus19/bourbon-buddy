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
| C — BB-230 | Sharing (friends-only) | 6 | **Complete** (a–f done) |
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
  - **Verified live (verify skill, emulators, 2026-07-21):** seeded an approved
    user with a friend (Bob) + a rated Cellar entry; logged in → Cellar detail →
    tapped Share → the modal rendered the bottle, the friend picker (Bob/@bob),
    the note field, and the **"Include my rating (4.5★)" toggle** (present only
    because the surface has a rating). The `shareBottle` write itself is covered
    by unit tests (functions emulator skipped).
  - **Deploy pending** (owner) — the `shareBottle` rating change redeploys the
    callable.
- [x] **BB-230c — Receive chooser.** *(DONE — functions + frontend; not yet deployed)*
  **Built (per-share, via the notification deep-link — the browsable list is BB-230e):**
  - Notification `bottleShare` link changed `/tabs/hunt-list?shared=1` → `/shared/{id}`
    (the inbox tap and push both navigate by this link). **Redeploy needed.**
  - `SharedItemsService` (`core/services/shared-items.service.ts`) — one-shot read
    of `users/{me}/sharedItems/{id}` + `markStatus(imported|dismissed)`.
  - `SharedItemReceivePage` at lazy route `/shared/:id` (authGuard+approvedGuard):
    shows sharer, bottle, note, and their rating (if opted in), with the chooser —
    **Cellar** (On my shelf / In my journal / In the graveyard → preset the log
    form) and **Hunt List** (I'm hunting it → `actively_looking` / It got away →
    `got_away`, added directly). Acting marks the share `imported`; "No thanks"
    marks it `dismissed`.
  - `cellarIntentPreset` util (`shared/utils/shared-receive.ts`) — the pure
    intent→form mapping (Shelf/Journal/Graveyard are DERIVED from entryType +
    bottleRemainingPct, not stored): shelf→purchased+100, graveyard→purchased+0,
    journal→drink.
  - add-entry gained a `?fromShared={id}&intent=` prefill path mirroring
    `?fromWishlist=`; presets identity + entryType + remaining, then
    auto-populates flavors.
  - Tests: `shared-items.service.spec` (4), `shared-receive.spec` (4),
    `shared-item-receive.page.spec` (4), notification-link assertion in
    `sharing.spec`. Functions 298 green; `ng build` clean; add-entry specs fixed
    for the new dependency (21 green).
  - **Verified live (verify skill, emulators, 2026-07-21):** seeded an approved
    user + a pending shared item; logged in → deep-linked to `/shared/{id}` → the
    chooser rendered the sharer (@bob), bottle, category, distillery, **their
    rating (4.5★)**, the note, and both intent groups. Tapped "I'm hunting it" →
    a wishlist entry was created and the app landed on the Hunt List showing the
    bottle. Fully client-side (no functions emulator needed).
  - **Deploy pending** (owner) — the notification-link change redeploys `shareBottle`.
- [x] **BB-230d — Share the full Hunt List as a frozen snapshot.** *(DONE —
  functions + frontend; not yet deployed)*
  **Built:**
  - `shareList` callable (`functions/src/sharing/index.ts`) — reads the sharer's
    **active** `wishlistEntries` server-side (Admin SDK → authoritative frozen
    snapshot; cross-user reads on that collection are owner-only, so a live
    subscription isn't possible anyway), name-sorts, caps at `SHARED_LIST_MAX`
    (100), writes a `SharedItem { kind:'list', bottles[], bottleCount }`, notifies
    `listShare` → `/shared/{id}`. Friends-only + block + daily-limit guards are
    now factored into shared helpers (`assertShareAllowed`, `bumpShareLimit`,
    `sharerFields`) reused by both share callables.
  - `SharedItem` gained `bottles?` / `bottleCount?`; bottle-only fields are now
    optional (consumers branch on `kind`) + `SharedListBottle`.
  - `SharingService.shareList`; `ShareListModalComponent` (friend picker + note,
    "Sharing your hunt list · N bottles"); a **Share hunt list** toolbar button on
    the Hunt List page (guards the empty-list case).
  - Receive page handles `kind:'list'` — shows the count + a bottle preview and
    **Import all to my hunt list** (adds each active bottle, skipping dupes) or
    **No thanks**. add-entry prefill guards against a list share (no single bottle).
  - Tests: `sharing.spec` +4 (snapshot, empty, cap, guard → 12 total),
    `sharing.service.spec` +1, `share-list-modal.spec` (2),
    receive-page list-import (+1). Functions 302 green; frontend 566 green;
    `ng build` clean.
  - **Verified live (verify skill, emulators, 2026-07-22):** seeded an approved
    user with a friend + a 2-bottle hunt list + a pending 3-bottle list share.
    **Send:** the Hunt List "Share hunt list" button opened the modal showing
    "Sharing your hunt list · 2 bottles" + the friend picker. **Receive:**
    deep-linked to `/shared/{id}` → the list page rendered "@bob shared their
    hunt list · 3 bottles", the note, and the bottle preview; "Import all to my
    hunt list" added all three and landed on the Hunt List showing them alongside
    the user's own bottles. (Send write needs the callable; receive is fully
    client-side.)
  - **Deploy pending** (owner) — new `shareList` callable (+ `shareBottle` was
    refactored, so redeploy both). No new indexes/rules.
- [x] **BB-230e — "Shared with me" segment** in the Hunt List page. *(DONE —
  frontend-only; no functions/index/rule changes)*
  **Built:**
  - `SharedItemsService.received` — a **single shared listener** (state-holder
    pattern, mirrors `WishlistService`) over `users/{me}/sharedItems` filtered to
    `status == 'pending'`, `orderBy('createdAt','desc')` (matches the BB-230a
    `sharedItems (status ASC, createdAt DESC)` index) exposed as a signal, plus
    `receivedLoaded`. Acting on a share flips its status, so it drops out live.
  - `groupSharesBySharer` (`shared/utils/shared-groups.ts`) — pure grouping into
    `SharerGroup[]`, insertion-order preserved so the newest sharer leads and each
    group's items stay newest-first.
  - Hunt List page — the segment is now **Hunting / Got Away / Shared (N)** via a
    single `view` signal (`archived` derives from it). The Shared view renders each
    sharer as a **collapsible group** (avatar + @handle + count); only the **top
    group is expanded by default** (derived purely from a nullable
    `expandedGroups` set — no effect). Each share row shows the bottle
    (name/distillery) or "Hunt list · N bottles" + the note; tapping opens the
    existing receive chooser (`/shared/:id`) = **import into my list**, and a swipe
    **Dismiss** discards it. **Keep-separate is the passive default** — an
    un-acted share simply stays in the segment, browsable, without polluting the
    Mine list.
  - Tests: `shared-groups.spec` (5), `shared-items.service.spec` +2 (received
    query + signed-out), `hunt-list.page.spec` (6, new — grouping, default-top
    expansion, toggle, open→chooser, dismiss, view switch). **Frontend 579 green;
    `ng build` clean.**
  - **Verified live (verify skill, emulators, 2026-07-22):** seeded an approved
    user with pending shares from **two** sharers (Bob: a bottle + a hunt-list;
    Carol: a bottle). Hunt List → **Shared (3)** segment: Bob's group (top)
    rendered expanded showing both his shares with notes; **Carol's group was
    collapsed by default** (her Lagavulin hidden until the group was tapped open);
    tapping Bob's Blanton's navigated to the receive chooser at `/shared/{id}`
    with sharer, rating, note, and the Cellar/Hunt intents. Dismiss is unit-tested.
  - **No deploy needed** — no functions/index/rule changes.
- [x] **BB-230f — Housekeeping: delete `src/assets/shapes.svg`.** *(DONE —
  `git rm`; re-confirmed **zero references** across `src/` and `angular.json`
  2026-07-22)*
  Untouched Ionic starter boilerplate in a light palette that contradicts the
  always-dark design system. Surfaced by the graphify run.
  *Considered and rejected:* adding a visible Glencairn/Noun Project attribution —
  owner decision 2026-07-20, would clutter the UI and there are no
  commercialization plans. The SVG is never loaded at runtime anyway (its path
  data is inlined in `rating-widget.component.ts`).

---

# Epic D — BB-231: Angular 20.3 → 21 migration

**Deferred until all of Epics A–C are complete.** Owner decision 2026-07-20:
prefer staying current with Angular rather than pinning the vendored
`angular-developer` skill docs to 20.3.

**Context.** `.claude/skills/angular-developer/references/` is a generic vendored
Angular skill documenting **v21+** idioms — Signal Forms, `httpResource` (and a
non-standard `@Service()` claim — *ignore it*, `@Injectable` stays correct). This
project is pinned to **20.3** with `@Injectable({providedIn:'root'})` and Reactive
Forms. Today that mismatch is a footgun: an agent following the reference docs
literally writes code that doesn't compile. Migrating to 21 resolves it.

## Research findings (2026-07-22)

**The migration is gated by AngularFire, not Angular.** Angular itself is at
**22.0.7** (latest) / **21.2.18** (LTS), but every Firebase call in this app rides
`@angular/fire`, and:

- **`@angular/fire` latest *stable* is `20.0.1`** (peer `@angular/core ^20.0.0`).
  There is **no stable v21 and nothing for v22** — only a **`21.0.0-rc.0`**
  (published 2026-07-16), peer `^21.0.0`, which also pulls **`firebase ^12.4.0`**
  (a major bump from the pinned 11.10.0).
- ⇒ **Target is Angular 21, not 22.** Going to 22 would force AngularFire-for-21
  onto a 22 runtime via peer-dep overrides — unsupported. Even 21 requires the RC.

**Owner decisions (2026-07-22):**
- **Target Angular 21** (not 22).
- **Wait for `@angular/fire` 21 GA before merging/deploying.** Do the Sprint 0
  spike now to surface blockers; hold the merge until AngularFire ships stable.
- **Scope = version bump + safe automated modernization** (`inject()`,
  signal-input/queries/output schematics). **Keep NgModule + Reactive Forms.**
  **No Signal Forms** (experimental in 21, stable only in 22), **no zoneless**,
  **no standalone migration.**

**Breaking changes that DON'T apply here** (codebase scanned 2026-07-22):
- *Zoneless by default* — new-app only; app keeps `zone.js` (polyfills.ts:50).
  Ionic + AngularFire rely on zone patching → **keep zone.js**.
- *HttpClient auto-provisioned in root* — **N/A**, app uses zero `HttpClient`
  (all I/O is the Firebase SDK).
- *Karma → Vitest default* — **N/A**, project uses **Jest** via
  `jest-preset-angular` (17.0.0, peer `core <23`), not `ng test`. Just re-verify
  the Jest config compiles against the A21 compiler.
- *Standalone idioms / removed-since-v19 APIs* — **N/A**, 0 `standalone:true`,
  no `TestBed.get`/`ComponentFixtureAutoDetect`/`async()` in `src/`.

**Coupled dependency bumps required:** `@angular/cdk` 20→21, `ng2-charts` 9→**10**
(peer now needs A21 + cdk 21), `@angular-eslint/*` 20→21, `@ionic/angular` stays
(peer `>=16`). Pin `@angular/fire` to the exact RC (no `^`) during the spike.

### Sprint plan

- [ ] **Sprint 0 — Spike & go/no-go** *(do now; branch
  `feature/BB-231-angular-21` off `main`)*. `ng update @angular/core@21
  @angular/cli@21`; install `@angular/fire@21.0.0-rc.0` + firebase 12 + cdk 21 +
  ng2-charts 10 + eslint 21; get `ng build` green. **Deliverable:** a written
  go/no-go naming any blockers found in the RC. **Do not merge.**
- [ ] **Sprint 1 — Green build & tests** *(gated on AngularFire 21 GA)*. Fix
  compile/type errors; verify `jest-preset-angular`; full Jest suite green;
  `ng build` + `npm run build:prod` clean.
- [ ] **Sprint 2 — Firebase 12 + Safari fix.** Read firebase 12 migration notes;
  **re-verify the BB-228 `experimentalForceLongPolling` Safari fix** against
  firebase 12; emulator smoke test (Auth/Firestore/Storage/Functions).
- [ ] **Sprint 3 — `verify` skill pass** over the 5 primary flows (auth, cellar,
  hunt list, dispatch, numbers).
- [ ] **Sprint 4 — Safe modernization + docs.** Run `inject()` +
  signal-input/queries/output schematics (keep NgModule/Reactive Forms); update
  CLAUDE.md (version → 21, forms guidance, drop the `@Service()` note, fix the
  skill path `.agents/` → `.claude/`); mark BB-231 done.

**AC (rolls up the sprints):**
  - Angular 21 via `ng update`, official schematics per step
  - `@angular/fire` on a **stable 21 GA** release (not the RC) before merge
  - firebase 12 verified — including the BB-228 Safari long-polling fix
  - Full Jest suite green; `ng build` + `npm run build:prod` clean
  - `verify` pass over auth, cellar, hunt list, dispatch, numbers
  - Reactive Forms kept; **no Signal Forms rewrite**
  - CLAUDE.md updated (version, forms guidance, `@Service()` note, skill path)

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

---

# Epic G — BB-238: Dispatch article hero images

**Problem.** Feed cards almost never showed an image. `thumbnailFrom()` only read
`<enclosure>` and `<media:content>`; measured across all 7 sources (2026-09-18)
**zero** emit `<enclosure>` and only Bourbon & Banter emits `<media:content>` — so
~1 source in 7 could ever produce an image, while essentially every article has a
hero. Layout also placed the thumbnail as a 76×76 square to the right of the text.

**Shape.** Find the image reliably, render it above the headline (Google Discover
style), and degrade to the text-only card when there is genuinely no image.

- [x] **BB-238a — Image-discovery ladder** (`functions/src/news/parse.ts`).
  `enclosure` → `media:content` → `media:thumbnail` → first `<img>` in
  `content:encoded` → first `<img>` in `<description>` → null. Covers 5 of the 6
  working sources with **no extra network calls**.
  - **Gotcha that drove the design:** rss-parser puts `<content:encoded>` on
    `item["content:encoded"]`; `item.content` is the `<description>` teaser
    (`parseItemRss` overwrites it). Reading `content` — as the old comment in
    `news/index.ts` claimed — misses the hero on every WordPress feed.
  - `normalizeImageUrl()` accepts only absolute http(s), resolves relative and
    protocol-relative srcs, decodes `&amp;`, and rejects tracking pixels /
    spacers / gravatars / avatars. Icon-sized `<img>` (w or h ≤ 64) are skipped,
    and `data-src` / `srcset` are tried when `src` is a placeholder.
- [x] **BB-238b — og:image fallback** (`functions/src/news/og-image.ts`).
  Fred Minnick's feed is **teaser-only** — no enclosure, no media:*, no
  content:encoded, and a `<description>` of bare `<p>` text — so its hero exists
  only on the article page. Regex-scans the first 200KB for
  `og:image` → `twitter:image`. Best-effort: 5s timeout, bounded concurrency (4),
  capped at 25 per source per run, any failure → null.
  - Deliberately **not** folded into the AI extractor (which already fetches
    these pages): that would make images depend on the Gemini rate-limit state.
- [x] **BB-238c — Stop null from clobbering a good image.** Ingest now omits
  `thumbnailUrl` entirely when none was found, so `merge: true` preserves a value
  stored by an earlier run (previously it wrote `null` unconditionally).
- [x] **BB-238d — `app-article-hero`** (`src/app/shared/components/article-hero/`).
  Renders nothing when there's no URL **or** when the image errors, so the card
  falls back to exactly the old text-only layout — no broken-image glyph, no gap.
  `linkedSignal` resets the failed flag on URL change (`@for` recycles hosts as
  the feed scrolls). `loading="lazy"` + `decoding="async"` (heroes are unresized
  originals — one measured 980KB), `referrerpolicy="no-referrer"`, fixed 16:9 box
  so the list doesn't reflow as images arrive.
- [x] **BB-238e — Discover layout.** `.article__body` is a column: hero above the
  headline, inset to the card's content width with the card's corner radius. The
  76×76 `.article__thumb` is gone.

**Verified (2026-09-18, emulators + live feeds, not yet deployed).**
- Ladder + og:image over the live feeds: **56/56 items got an image — 100%**
  (47 in-feed, 9 via og:image), whole run 4.4s.
- Seeded 46 real articles into the emulator through the real ingest path and drove
  the app: **46/46 heroes loaded, 0 broken, 0 pending**; the only text-only cards
  were the two deliberate fixtures (a 404 URL and a null URL). Hero confirmed
  above and left-aligned with the headline; every `<img>` lazy.
- Fred Minnick (og:image-only source) renders its hero at 1085×1088.
- Tests: functions 320/320, frontend 599/599 (incl. 21 new for the ladder,
  og:image parsing, and the hero component's fallback paths).

**Not deployed yet.** After deploy, force an immediate run rather than waiting 6h:
`gcloud scheduler jobs run firebase-schedule-fetchRssFeeds-us-central1 --location us-central1`
(confirm the job name with `gcloud scheduler jobs list`). Because ingest merges on
the URL-hash doc id, that run also backfills images onto articles already stored.

**Follow-ups filed, not done here:**
- **`bodyText` stores the teaser, not the article body** — same `item.content`
  mis-mapping. Undercuts BB-130/BB-227 (the model was meant to see the full body)
  and forces a page re-fetch for nearly every article. One-line fix, but it changes
  AI-extraction inputs so it needs its own ticket + verification. **Do this first.**
- **The Spirits Business ingests nothing** — its feed URL returns HTML, and
  `rss-parser` fails with `Invalid character in entity name (Line 3, Column 491)`.
  Find the real feed URL or drop the source; consider warning when a source
  returns 0 items twice running, since `Promise.allSettled` hides it today.

---

# Epic H — BB-239: `bodyText` stored the teaser, not the article body

**Problem.** `news/index.ts` built `bodyText` from `item.content`. rss-parser sets
that from `<description>` — the ~320-char teaser — because `parseItemRss` writes
it last and overwrites anything else; the full body lives on
`item["content:encoded"]`. So the body cached for AI extraction was *always* a
teaser. It never cleared the extractor's `MIN_BODY_CHARS` (600) bar, which meant
`processArticle` re-fetched almost every article URL over the network — the exact
opposite of what BB-130 and BB-227 were written to achieve.

- [x] **BB-239a — Read the right key.** Prefer `item["content:encoded"]`, fall
  back to `item.content`, longer-wins so an empty or stub `content:encoded` can't
  lose to a teaser that carries more text (Bourbon Guy syndicates its whole post
  in `<description>` and must not regress).

  | Source | avg `bodyText` | page re-fetches |
  |---|---|---|
  | BourbonBlog | 311 → **6,746** | 8/8 → **0/8** |
  | Bourbon & Banter | 216 → **4,724** | 8/8 → **0/8** |
  | The Whiskey Wash | 242 → **4,312** | 8/8 → **1/8** |
  | The Daily Pour | 327 → **3,003** | 8/8 → **0/8** |
  | Bourbon Guy | 3,601 → 3,601 (no `content:encoded`; fallback holds) | 0/8 → 0/8 |
  | Fred Minnick | 236 → 236 (teaser-only; correctly still re-fetches) | 6/6 → 6/6 |

  **Outbound page fetches per cycle: 38/46 → 7/46.**

- [x] **BB-239b — Move the body off the article document.** Fixing 239a alone
  would have made every Dispatch feed page ~75KB heavier: the body is server-only,
  but `news.service.ts` reads whole article documents and the Firestore **client
  SDK has no field projection**, so the UI would download a body it never renders
  (measured 21KB → 96KB per 25-article page). The body now lives at
  `/articleBodies/{articleId}`:
  - Ingest writes article + body as one batch; the article doc carries
    `bodyText: FieldValue.delete()` so pre-BB-239 docs shed the inline field as
    they are re-ingested.
  - `processArticle` reads `/articleBodies/{id}`, falling back to the legacy
    inline field until old docs age out.
  - **Rules deny the client the collection entirely** (`allow read, write: if false`),
    with a rules test asserting an approved user can read the article but NOT its body.
  - Both cleanup paths (`cleanupOldArticles`, `cleanupReadArticles`) delete the
    body alongside the article, so nothing is orphaned.

**Verified (2026-09-18, emulators + live feeds, not deployed).** Ran the real
`fetchRssFeeds` handler via `.run({})` against the Firestore emulator:
- 96 articles ingested; **96/96 have a thumbnailUrl** (BB-238 confirmed at the
  real function level), **96 articleBodies written, 0 articles carrying an inline
  bodyText**.
- **avg article doc 787 bytes → 19KB per 25-article feed page** (vs ~96KB if the
  body had stayed inline). Avg body doc 4,320 bytes, server-side only.
- Bodies resolvable at the new path 96/96; only 9/96 would still re-fetch.
- Seeded an aged article and a 24h-old read article, ran both cleanup handlers:
  article and body both deleted, **no orphans** in either path.
- Tests: functions 324/324, rules 19/19 (incl. the new body-denial test).

**Also reproduced here:** The Spirits Business fails inside the real handler with
`Invalid character in entity name (Line 3, Column 491, Char: &)` — sax choking on
a bare `&`. That is **BB-240**, still open.

---

# Epic I — BB-240: The Spirits Business ingested nothing

**Problem.** The source produced zero articles and had done for as long as the
logs go back (confirmed in production 2026-09-18: the 02:41 and 08:41 runs both
failed). `rss-parser` died on it every cycle with
`Invalid character in entity name (Line 3, Column 491, Char: &)` — sax choking on
a bare `&` in HTML, because the URL serves a web page, not a feed.

**Diagnosis.** The site has no RSS any more. `/feed`, `/feed/`, `/?feed=rss2`,
`/rss`, `/feed/rss`, `/?feed=atom` and category feeds all return the **same
38,994-byte homepage HTML**; `/rss.xml` and `/atom.xml` 404; no FeedBurner
mirror; and the page declares **no `application/rss+xml` autodiscovery links**.
But the publisher is very much alive — posting several times a day — and its
**WordPress REST API is open**, giving more than RSS would.

- [x] **BB-240a — `kind` on a source.** `RssSource` gains
  `kind?: "rss" | "wp-json"` (default `"rss"`), so a publisher without a feed
  can still be ingested. Only The Spirits Business uses `wp-json` today.
- [x] **BB-240b — wp-json adapter** (`functions/src/news/wp-json.ts`). Maps a
  `wp/v2/posts` record onto the **same shape a feed item has**, so the ingest
  loop, `thumbnailFrom()`, `publishedAt()`, `categorize()` and BB-239's body
  selection all work unchanged:
  - `title.rendered` → `title`, decoded through `htmlToText` (rendered fields
    carry entities — `&#8216;` is a curly quote, and untreated it would reach the
    card headline verbatim).
  - `content.rendered` → `content:encoded`, so it feeds both `bodyText` and the
    image ladder's inline-`<img>` rung.
  - `_embedded["wp:featuredmedia"][0].source_url` → `enclosure.url`, the ladder's
    top rung, so the featured image always wins.
  - `date_gmt` → `isoDate` **with a `Z` appended** — WordPress returns UTC with
    no zone designator, so parsing it raw would skew every timestamp by the
    server's offset. Already-zoned values are left alone.
  - Query is `per_page=20&_embed=wp:featuredmedia` plus `_fields=…`: **56KB for
    20 posts** vs 129KB for a naive `_embed=1` — cheaper than most of the RSS
    feeds we already pull.
- [x] **BB-240c — Dead sources stop failing silently.** `fetchRssFeeds` logged
  `Fetched X: 0 articles` at INFO, which reads like a normal run, and
  `Promise.allSettled` swallowed the rest — which is how this rotted unnoticed.
  A zero-item result is now `logger.warn(... source may be dead)`.

**Verified (2026-09-18, emulators + the live endpoint, not deployed).** Ran the
real `fetchRssFeeds` handler via `.run({})`:
- The Spirits Business: **20 articles, 20/20 with a thumbnailUrl, 20/20 with a
  stored body** — from 0.
- Headlines decode correctly (`SWA ‘profoundly concerned’ about English whisky
  GI`), URLs are the real article links, timestamps land in UTC.
- **All 7 sources now ingest** (was 6): Whiskey Wash 20, BourbonBlog 29,
  Spirits Business 20, Bourbon Guy 16, Bourbon & Banter 15, Daily Pour 10,
  Fred Minnick 6.
- Tests: functions 334/334 (10 new for the adapter), rules 19/19.

**Note for the future:** `wp-json` is a general capability now, not a one-off. If
another source loses its feed, adding `kind: "wp-json"` and the REST endpoint is
the whole change.

---

# Epic J — BB-241/242/243: clear the lint backlog

**Context.** `ng lint` reported 18 errors and `functions` 2, all pre-existing on
`main`. Triage found **none of them was a real defect** — every one is the linter
disagreeing with deliberate, correct code. They accumulated because **no CI
workflow has ever run lint or tests** (that is BB-244).

- [x] **BB-241 — `template/eqeqeq` fought `x != null`** (15 errors, 8 files).
  Every occurrence compares a field typed `?: T | null` — optional *and*
  nullable, so the value can be `undefined` or `null`. `!= null` catches both;
  the linter's suggested `!== null` lets `undefined` through and would render
  rating/price blocks for entries that have none. **Applying the suggested fix
  would have introduced 15 bugs.** Configured `allowNullOrUndefined: true`
  rather than touching the code.
  - Verified the relaxation is *narrow*: temporarily adding a real
    `@if (entry().rating == 5)` still errors with
    `Expected === but received ==`. Only null/undefined comparisons are exempt.
- [x] **BB-242 — `functions/invoke-backfill.js` require() errors** (2 errors).
  An operator script, not deployed code. `functions/.eslintrc.js` already ignores
  `scripts/`, which already held ~10 siblings; this one had just been left at the
  functions root. `git mv`d into `scripts/` and its header updated with the new
  invocation path. Verified it still parses and resolves `firebase-admin` from
  the new location.
- [x] **BB-243 — Two directives flagged for intentional design** (3 errors).
  - `directive-selector` prefix is now `["app", "bb"]` — the project genuinely
    uses both, and `bbTourAnchor` is the established name.
  - `InputHelpersDirective`'s element selector (`ion-input, ion-textarea`) is
    the whole point of the directive: every input gets the attributes without
    opting in. An attribute selector would mean marking every input in the app
    and would silently miss new ones. Disabled **inline, with the reason at the
    code**, not hidden in config.
  - `TourAnchorDirective`'s `@Input('bbTourAnchor')` alias is required for
    `[bbTourAnchor]="key"` to bind — the same shape `ngModel` uses. Also an
    inline, documented disable.

**Policy split used here:** things that are project-wide policy (the null
comparison idiom, the two directive prefixes) live in `.eslintrc.json`; genuine
one-off exceptions carry an inline disable with the reason next to the code, so a
future reader sees *why* at the point it matters.

**Result: `ng lint` reports "All files pass linting"; functions lint is 0 errors**
(33 quote-style warnings remain, unchanged and pre-existing). Tests: frontend
599/599, functions 324/324, production build clean.

**BB-244 (CI runs lint + tests) is now unblocked** — it can be switched on green.

---

# Epic M — BB-245: Breaking Bourbon via sitemap + JSON-LD

**Platform.** Webflow, and it publishes no feed of any kind: `/feed`, `/rss`,
`/feed.xml`, `/blog/rss.xml`, `/review/rss.xml` and `wp-json` all 404, so
BB-240's REST-API route does **not** transfer. The sitemap is the only entry
point, and `robots.txt` advertises exactly that (a `Sitemap:` line, no
`Disallow`).

**The finding that shaped the design — the site splits in two.**
`/review/` (~2,400 URLs) carries a JSON-LD `Article` block with a clean
headline, a real `datePublished`, a description and an image. **Every other
section** (press releases 1,760, `/article/` 227, roundtables, tnt, roundups)
has og: tags only and **no publish date anywhere**. `lastmod` cannot stand in
for one — `/whiskey-roundup/april-2021` carries `lastmod=2022-11-11` because a
migration touched every page. A fabricated `publishedAt` would misorder the
feed, defeat the 90-day ingest filter and confuse `cleanupOldArticles`.

**Decisions (user-approved):** ingest `/review/` **only**; **7-day** lastmod
window. Reviews are also what BB-220 values most — `independent_review` keeps
flavor-seeding rights, press releases don't.

- [x] **BB-245a — `kind: "sitemap"`** on `RssSource`, with a `sitemap` config
  block (`pathPrefix`, `windowDays`, `maxFetchesPerRun`).
- [x] **BB-245b — `functions/src/news/sitemap.ts`.** Parses the urlset, selects
  candidates by prefix + window, pulls the Article out of the page's JSON-LD
  (past the Organization/Product blocks, `@graph`-aware, surviving a malformed
  block), and maps onto the **same shape a feed item has** — so `thumbnailFrom`,
  `publishedAt`, `categorize` and BB-239's body selection work unchanged.
  Returns null rather than inventing a date when the page has none.
- [x] **BB-245c — The cost control, and the bug it had.** The design was "only
  fetch URLs we don't already hold". Verification showed that **converges but
  never settles**: 13 of 34 candidates are old reviews the site re-touched
  (real `datePublished` of 2026-01 … 2026-06, `lastmod` this week), which the
  90-day filter drops — so they never became documents, never satisfied the
  existence check, and would have been **re-fetched on every run forever**.
  Fixed with a `newsSkipped/{urlHash}` marker written whenever a page is fetched
  and deliberately not stored, checked alongside `newsArticles`. Markers age out
  on the same monthly sweep as articles.
- [x] **BB-245d — Source health** (`sourceHealth/{sourceName}`), the
  observability the user asked for. BB-240's zero-item warning only reaches
  Cloud Logging, which is **pull, not push** — findable once you already suspect
  something, and buried under audit-log JSON. Every run now records `lastRunAt`,
  `itemCount`, `lastSuccessAt`, `consecutiveZeroRuns` and `lastError`;
  `consecutiveZeroRuns` uses `increment()` so it costs no read. Admin-read-only
  by rules, server-written. The admin page shows it worst-first, amber-flagged
  after **two** consecutive empty runs (one is normal — a publisher can simply
  not post in six hours).
- [x] **BB-245e — `'Breaking Bourbon'`** added to `NEWS_SOURCE_NAMES` (the
  Source filter is hand-synced with `functions/src/news/sources.ts`).

**Verified against the live site (emulators, not deployed).**
- Cold start → **21 articles, 21/21 with an image, a date and a stored body**,
  and **0 outside `/review/`**.
- Convergence, run by run: `13 articles / 12 markers / 9 left` → `21 / 13 / 0` →
  `21 / 13 / 0` → `21 / 13 / 0`. **Steady state is zero page fetches.** All 13
  markers are `older-than-max-age`, exactly the diagnosed cause.
- `sourceHealth` written for all 8 sources with correct counts.
- Tests: functions **349** (20 new for sitemap parsing/selection/mapping and the
  network paths), frontend **603** (4 new for the health panel), rules **20/20**
  (a new case asserting an approved non-admin cannot read `sourceHealth`).
- **The BB-246 ratchet caught a real regression here**: the new code initially
  dropped functions coverage to 51.94% against the 52 floor. Per the rule, the
  fix was tests, not a lower floor — the network paths in `sitemap.ts` are now
  covered and it sits at 52.73/52.64/61.67/52.70, verified against the actual
  floors with `--coverageThreshold`.

**Note:** BB-245 branches off `main`, which does **not** yet carry BB-244/BB-246
— so the floors aren't active on this branch. They will be once those merge,
which is why the coverage was checked explicitly rather than assumed.

---

## BB-247 — One header menu across the tabs

**The problem.** Every tab rendered a different set of header buttons, so the
top-right of the app changed meaning as you moved between tabs. The Hunt List
was the worst case: four end-slot buttons (Share, Lookup, Stores, "+ Sighting")
next to Filter and Sort. It also left two dead ends — **Settings was reachable
only from the Cellar**, **My Stores only from the Hunt List**.

**The shape now.** One right-side drawer, identical on all five tabs, holding
every action that used to be scattered. Each header reads
`[left: view controls] · [right: ☰]`.

- [x] **BB-247a — The drawer.** `app-menu` (`ion-menu side="end"`), mounted once
  in `app.component.html` as a direct child of `ion-app`. Lives in its own small
  `AppMenuModule` — the OnboardingModule trick — so the eager AppModule can
  mount it without pulling SharedModule into the initial bundle. `swipeGesture`
  is **off**: an edge-swipe would fight the `ion-item-sliding` rows on the
  Cellar and Hunt List.
- [x] **BB-247b — The trigger.** `app-menu-button`, one per tab page (six
  templates — the Social tab is *two* pages, `friends-feed` and `friends`, or
  the ☰ vanishes when you flip the segment). A plain `ion-button` rather than
  `ion-menu-button` so the unread badge can overlay the icon.
- [x] **BB-247c — Moved, not buried.** Dispatch (Feed settings), Numbers (Year
  in Review) and Friends (Sightings map, Toggle stale) keep their own buttons —
  moved to the header's **left**, where Cellar/Hunt already put Filter and Sort.
  The `numbers-year` and `social-map` tour anchors ride along with them.
- [x] **BB-247d — The two modals stay lazy.** "Look up a bottle" and "Share hunt
  list" route to `/tabs/hunt-list?lookup=1` / `?share=1` instead of opening the
  modal from the drawer. The lookup sheet drags `@zxing/browser`, the preview
  sheet and TasteMatchService; opening it from an eager root component would
  pull all of that into the initial bundle. `HuntListPage` reads the flag from
  `queryParamMap` (**not** `ionViewWillEnter` — Ionic caches the page, so a flag
  arriving while Hunt is already showing would never re-fire the hook), clears it
  with `replaceUrl`, then opens the existing modal.
- [x] **BB-247e — The badge went global, and a race got fixed.** The unread count
  moved off the Cellar-only bell onto the trigger, so it's visible from every
  tab. `InboxService` exposes it as a signal kept in step by `applyAppBadge` —
  the funnel every read/write path already called. Verification caught a real
  bug: `snapshotUser` is null until Firebase restores the session, so the
  launch-time count raced auth and returned 0, leaving the badge blank until
  something else refreshed it. It now seeds off the shared `currentUser$`
  stream — no new listener, one COUNT aggregation per auth change, and fewer
  reads than the old every-Cellar-tab-enter behaviour.

**Verified in the browser against the emulators.**
- Trigger present on all **six** tab pages; badge correct on every one.
- Drawer items and live counts: `Share hunt list 3`, `Notifications 1`.
- Hand-off works from a tab that never owned the action — "Look up a bottle"
  from **Numbers** and "Share hunt list" from **Dispatch** both land on
  `/tabs/hunt-list` with the modal open and the query flag cleared.
- Gating holds: on `/login` no trigger renders and a forced `menu.open()`
  returns `opened=false`.
- Filter/Sort still conditional — 2 buttons on Hunting, 0 on Shared.
- `ion-item-sliding` rows still open (3 on the Hunt List), so nothing regressed
  from turning the swipe gesture off.
- Closes on Escape and on a tap outside the panel. With the drawer open, browser
  Back navigates and closes it — no trap, no stale overlay. (Ionic's hardware
  back-button handling on Android was not exercised here.)
- Tests **627** (24 new), lint clean, initial bundle **317.33 kB** vs **314.48 kB**
  on `main` — **+2.87 kB** for the whole drawer, confirming the lazy chunks
  stayed lazy. Coverage 53.45/43.16/44.36/53.18, above all four BB-246 floors.
