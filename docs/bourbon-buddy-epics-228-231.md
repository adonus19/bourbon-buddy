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
| A — BB-228 | Radar / preview-sheet load time | 4 | In progress |
| B — BB-229 | Discreet Total Spent | 4 | Not started |
| C — BB-230 | Sharing (friends-only) | 6 | Not started |
| D — BB-231 | Angular 20.3 → latest migration | 1 | Deferred — last |

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

- [~] **BB-228a — Instrument the sheet-open path.** *(instrumentation landed &
  validated; cause not yet named — needs one live-project measurement)*
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

  **Leading hypothesis — unregistered App Check debug token.** On localhost
  [app.module.ts:82](../src/app/app.module.ts#L82) sets
  `FIREBASE_APPCHECK_DEBUG_TOKEN = true`, minting a debug token that **must be
  registered** in Firebase Console → App Check → Apps → Manage debug tokens.
  [docs/app-check-setup.md](app-check-setup.md) §2.2 is explicit: *"Without this,
  local dev against the live project gets rejected once enforcement is on."*
  A rejected App Check request can surface as a CORS error rather than a clean
  403, because the rejection response omits the CORS headers. This also matches
  the "2026-07 outage" the code comment warns about.

  **Decisive test (one line, ~60s):** set `recaptchaSiteKey: ''` in
  `src/environments/environment.ts`. That disables App Check initialization
  entirely (documented rollback, app-check-setup.md §Rollback). Errors gone →
  App Check is the cause; errors persist → it's the Safari/WebChannel transport.

  **Not yet answered — and the emulators cannot answer it.** Local Firestore has
  no WebChannel fallback and App Check is disabled against emulators, so the two
  leading suspects are unreproducible here by construction. Naming the cause needs
  **one trace captured against `bourbonbuddy-dev` on the network where it's slow**
  (`useEmulators: false`, DevTools console, tap a Radar bottle). Finding (3) makes
  the infrastructure hypotheses *more* likely, not less: ~240ms of work cannot
  become 20s without something outside the code path stalling.

- [ ] **BB-228b — Loading state.**
  Skeleton inside `BottlePreviewSheetComponent`; pressed/disabled state on
  `RadarCardComponent.view()` so the tap registers instantly.
  **AC:** no surface can show an empty sheet with no affordance; loader appears
  within one frame of the tap.

- [ ] **BB-228c — Remove redundant work.**
  Bounded in-memory doc cache in `BourbonCatalogService` (kills the duplicate
  `getById`); `Promise.all` the price-history reads; memoize `friendsOnce()`.
  **AC:** one sheet open performs at most one `getById` per bourbonId; friends +
  price-history reads run concurrently.

- [ ] **BB-228d — Apply the infrastructure fix identified by BB-228a.**
  **AC:** the measured p95 open time drops below 2s on a normal connection.

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

- [ ] **BB-229a — Toggle + masked tile + persistence.**
  Eye toggle top-right of the Total Spent card; masked `—` value; `spendPrivacy`
  persisted on the user doc via the existing profile listener.
- [ ] **BB-229b — First-run "Who are we hiding this from?" modal.**
  Three modes above; copy pass.
- [ ] **BB-229c — The gauntlet.**
  7-tier ladder, tier state + weekly reset; partner mode bypasses entirely.
- [ ] **BB-229d — Escape hatch.**
  Settings kill-switch (gauntlet once, then off forever) **and** a quiet "fine,
  show me" after N failed attempts. Without this the feature traps users in their
  own joke — this is an accessibility requirement, not a nicety.

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

- [ ] **BB-230a — Schema + callables.**
  `/users/{uid}/sharedItems/{id}`; `shareBottle` / `shareList` callables with
  server-side `findOrCreate`, block enforcement, rate limit, size cap. New
  `bottleShare` / `listShare` notification types + prefs. Rules + indexes.
- [ ] **BB-230b — Share button on all four bottle surfaces.**
  Cellar detail, Hunt List detail, Dispatch feed preview sheet, Radar preview
  sheet. Shares the catalog bottle only.
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
