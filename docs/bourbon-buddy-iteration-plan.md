# Bourbon Buddy — Iteration Plan (MVP)

**Version:** 1.5
**Last Updated:** 2026-07-05
**Methodology:** Agile / Scrum-style iterations (2-week sprints)
**Velocity Assumption:** ~25 story points per iteration (solo developer, part-time; adjust based on actual pace)
**Total MVP Scope:** 152 SP across 7 iterations (not counting Iteration 0)

---

## Iteration Philosophy

Each iteration delivers a vertically complete, runnable slice of the app. The goal is that at the end of every iteration, you can open the PWA on your phone and interact with the newly completed features. No iteration is purely backend or purely frontend — they build together.

The order reflects both technical dependencies (auth before features, log before statistics) and personal value priority (the log and wishlist are the core product and should be usable as early as possible).

---

## Iteration 0 — Foundation & Setup

> *Not a delivery iteration. Complete before starting Iteration 1. These are setup and scaffolding tasks, not pointed user stories.*

**Goals:**
- All tooling installed and configured
- Firebase project(s) created and connected
- Ionic/Angular app scaffolded and running locally
- Firebase emulator suite working for local development
- Deployment pipeline working (build → Firebase Hosting)

**Tasks:**

**Environment Setup:**
- [ ] Install Node.js LTS, Ionic CLI, Angular CLI, Firebase CLI
- [ ] Create two Firebase projects: `bourbon-buddy-dev` and `bourbon-buddy-prod`
- [ ] Enable Firestore, Firebase Auth, Firebase Storage, Firebase Hosting, Firebase Functions on both
- [ ] Upgrade both projects to Blaze (pay-as-you-go) plan
- [ ] Install and configure Firebase Local Emulator Suite (Auth, Firestore, Storage, Functions emulators)

**Project Scaffold:**
- [ ] `ionic start bourbon-buddy blank --type=angular` — generate base project
- [ ] Configure Angular standalone components or NgModule structure (decision: use NgModules with lazy-loaded feature modules for this project size)
- [ ] Install and configure AngularFire (`@angular/fire`) for Firestore, Auth, Storage
- [ ] Set up `environment.ts` / `environment.prod.ts` with Firebase config objects (never commit real keys — use `.env` or CI secrets for prod)
- [ ] Initialize Firebase Functions in `functions/` directory with TypeScript

**Firestore Setup:**
- [ ] Create `firestore.rules` with initial restrictive rules (deny all by default)
- [ ] Create `firestore.indexes.json` with indexes from the data model document
- [ ] Seed the flavor tags reference data (can be a one-time script or manual Firestore console entry)

**CI/CD:**
- [ ] GitHub repository created
- [ ] `.github/workflows/deploy.yml` — on push to `main`, run `ionic build --prod` and `firebase deploy --only hosting`
- [ ] Separate workflow or manual deploy for Functions

**Branching Strategy:**
- `main` — production-deployable at all times
- `develop` — integration branch (optional for solo dev)
- `feature/BB-XXX-description` — feature branches

**End State:** `ionic serve` runs the app locally. `firebase emulators:start` runs Auth, Firestore, Storage, and Functions emulators. A push to `main` deploys to Firebase Hosting. The app shows a blank shell with no features.

---

## Iteration 1 — Authentication & App Shell (17 SP)

**Stories:** BB-001, BB-002, BB-003, BB-004, BB-005
**Goal:** A fully working authentication layer. User can register, log in with any provider, stay logged in, reset their password, and edit their profile. The app shell with navigation tabs is in place.

**What gets built:**

*Firebase / Backend:*
- Firebase Auth enabled for: Email/Password, Google, Apple, Facebook providers
- Auth trigger (or client-side `onAuthStateChanged`) creates `/users/{uid}` document on first sign-in
- Firestore Security Rules: basic per-user access to their document

*Ionic/Angular:*
- `AuthModule` (lazy-loaded): Login page, Register page, Forgot Password page
- `AuthGuard` — redirects unauthenticated users to login
- `AuthService` — wraps AngularFire Auth; exposes `currentUser$`, `signIn()`, `signOut()`, `register()`, `resetPassword()`
- Tab bar navigation shell: Log / Wishlist / News / Stats / Search tabs (all tabs load empty/placeholder pages except Login)
- `ProfilePage` under Settings: edit display name, bio, home region, avatar upload to Firebase Storage
- Social sign-in buttons: Google (AngularFire GoogleAuthProvider), Apple (AngularFire AppleAuthProvider), Facebook (AngularFire FacebookAuthProvider)

**Definition of Done:**
- [ ] Email/password registration creates Auth user and Firestore profile document
- [ ] Google, Apple, and Facebook sign-in each work end-to-end
- [ ] Signed-in session persists on app close and reopen
- [ ] Password reset email is sent by Firebase
- [ ] Profile name and avatar update in both Firebase Auth and Firestore
- [ ] Auth guard blocks unauthenticated access to all tabs
- [ ] Tab bar navigation shell is present with correct icons

---

## Iteration 2 — Core Log: Add & View (24 SP)

**Stories:** BB-010, BB-011, BB-012, BB-014, BB-016
**Goal:** The fundamental value of the app. You can add a bourbon to your log with full tasting notes and ratings, and view your list and entry details. This is the most important iteration.

**What gets built:**

*Firestore:*
- `/bourbons` collection and Security Rules for catalog
- `/users/{uid}/logEntries` subcollection
- Flavor tags stored as a static reference (Firestore document or hardcoded constant — decide during dev; hardcoded TS constant is simplest for MVP)
- Composite indexes for log queries

*Ionic/Angular:*
- `LogModule` (lazy-loaded)
- `LogListPage`: Ionic virtual scroll list, sort control, empty state with CTA
- `AddEditEntryPage`: multi-section scrolling form (or Ionic slides for multi-step UX)
  - Section 1: Bourbon identity (name with catalog autocomplete, distillery, category, sub-type)
  - Section 2: Bottle details (age/NAS toggle, proof, mash bill, batch/barrel, series)
  - Section 3: Purchase info (entry type, price, location, date, did-not-purchase toggle)
  - Section 4: Rating and tasting notes (star widget, flavor tag selectors by stage, freeform notes, finish length, would-buy-again)
- Star rating component (custom Ionic component, half-star support)
- Flavor tag chip selector component (grouped by category, multi-select, per tasting stage)
- `LogEntryDetailPage`: full detail view with all fields, flavor tag chips, label photo placeholder
- `BourbonCatalogService`: search, create in `/bourbons`
- `LogEntryService`: CRUD operations on `/users/{uid}/logEntries`
- Value score computed and stored on save

**Definition of Done:**
- [ ] Can add a log entry with all fields filled in
- [ ] Bourbon name autocomplete searches catalog and creates new entry if no match
- [ ] Half-star rating widget works correctly
- [ ] Flavor tags selectable per stage (Nose/Palate/Finish) and saved correctly
- [ ] Value score is calculated and stored when rating and price are both present
- [ ] Log list shows all entries sorted by date descending
- [ ] Detail screen shows all saved data accurately
- [ ] Empty state renders correctly

---

## Iteration 3 — Log: Photos, Edit, Filter & Wishlist (28 SP)

**Stories:** BB-013, BB-015, BB-017, BB-018, BB-019, BB-030, BB-031, BB-033, BB-035
**Goal:** Round out the log with photo support, editing, deletion, and filtering. Add a fully working wishlist. After this iteration the core tracking experience is complete.

**What gets built:**

*Firebase Storage:*
- Storage rules: users can only read/write their own paths (`/labels/{userId}/...`, `/avatars/{userId}/...`)

*Ionic/Angular — Log completion:*
- Photo capture and upload in `AddEditEntryPage` (Ionic Camera API via Capacitor or PWA-compatible file input)
- Photo displayed as thumbnail on list cards and full-width on detail screen
- Edit flow: pre-populate `AddEditEntryPage` with existing entry data; save updates Firestore document
- Delete: confirmation alert; Firestore document delete; navigate back to list
- Filter modal: category multi-select, rating slider, entry type multi-select, proof slider, date range pickers, flavor tag multi-select
- Active filter chips below search bar; each chip dismissible
- Sort control on list screen

*Ionic/Angular — Wishlist:*
- `WishlistModule` (lazy-loaded)
- `WishlistListPage`: list with priority badges, MSRP, best sighting price, sort and filter controls
- `AddEditWishlistPage`: form with all wishlist fields (name, distillery, MSRP, priority, status, notes, discovery source/URL, review links)
- `WishlistEntryDetailPage`: full detail, review links as tappable URLs, Edit/Delete actions, "Found It — Log It" button (navigation only for now — full conversion logic is Iteration 4)
- `WishlistService`: CRUD on `/users/{uid}/wishlistEntries`

**Definition of Done:**
- [ ] Label photo can be taken or selected, uploads to Firebase Storage, displays on list and detail
- [ ] Existing log entries can be edited; all changes persist
- [ ] Delete works with confirmation; entry removed from list
- [ ] Log list can be filtered by all filter types; filters combine correctly
- [ ] Filter chips display active filters and can be individually dismissed
- [ ] Wishlist entries can be added, viewed, edited, and deleted
- [ ] Wishlist sorts by priority correctly

---

## Iteration 4 — Sightings, Pour Sessions & Wishlist Conversion (20 SP)

**Stories:** BB-020, BB-032, BB-034, BB-040, BB-041, BB-042
**Goal:** Add the bottle sightings system, pour session tracking, and the wishlist-to-log conversion flow. These features make the app useful while actively hunting bottles.

**What gets built:**

*Ionic/Angular:*
- `SightingFormComponent`: modal/sheet for adding a sighting (store, price, date, city, state, notes)
- Sightings subcollection service: CRUD on `wishlistEntries/{id}/sightings`
- Sightings list on wishlist entry detail: sorted by price asc, date desc; stale visual treatment
- "Mark as Stale" swipe action on sightings
- `bestSightingPrice` update logic on add/mark-stale
- MSRP vs. best price delta display
- "Found It — Log It" full implementation: pre-fill `AddEditEntryPage`, on save set wishlist `status = 'logged'`
- Wishlist archive view (toggle to show `status === 'logged'` entries)
- Pour sessions: "Log a Pour" FAB on `LogEntryDetailPage` for `bottle_purchased` entries
- Pour session form: date, setting notes, rating, tasting notes
- Pour sessions subcollection: CRUD on `logEntries/{id}/pourSessions`
- Pour list on detail page: chronological, with average pour rating

**Definition of Done:**
- [ ] Price sightings can be added from wishlist entry detail
- [ ] Sightings list sorts correctly and stale sightings are visually differentiated
- [ ] "Mark as Stale" works and updates bestSightingPrice
- [ ] "Found It — Log It" pre-fills the log entry form correctly; wishlist entry archived on save
- [ ] Archived wishlist entries visible in archive view and hidden from active list
- [ ] Pour sessions can be added to purchased bottle entries
- [ ] Pour sessions display chronologically on the log entry detail screen

---

## Iteration 5 — News Feed (15 SP)

**Stories:** BB-050, BB-051, BB-052
**Goal:** Build the news feed: Cloud Function RSS fetcher, personalized feed display, and article state management.

**What gets built:**

*Firebase Cloud Functions:*
- `fetchRssFeeds` — scheduled function (Cloud Scheduler, every 12 hours)
  - Fetches each RSS source from the configured source list (stored in Firebase Remote Config so sources can be added without redeploy)
  - Parses feed items using `rss-parser` npm package
  - Deduplicates by URL (uses URL hash as Firestore document ID)
  - Writes new articles to `/newsArticles` collection
  - Skips articles older than 90 days
- `cleanupOldArticles` — scheduled function (monthly)
  - Deletes `/newsArticles` documents with `publishedAt` older than 90 days

*Firestore:*
- `/newsArticles` collection and Security Rules (read: authenticated; write: functions only)
- `/userNewsPreferences/{uid}` collection and Security Rules
- `/users/{uid}/articleStates` subcollection

*Ionic/Angular:*
- `NewsModule` (lazy-loaded)
- `NewsFeedPage`: Ionic virtual scroll of article cards (headline, source, time, excerpt, thumbnail)
- Article card tap → `window.open(url, '_system')` (opens in device browser)
- Pull-to-refresh re-queries Firestore
- Swipe actions on article cards: Mark Read, Save, Not Interested (uses `IonItemSliding`)
- Read and Saved archive views (segment tabs on the news page)
- `FeedSettingsPage`: watch keywords, watch distilleries, category toggles, exclude keywords
- Feed filtering: client-side match against `keywords` and `categories` arrays in article documents, filtered by user preferences
- `NewsService`: reads articles from Firestore, manages article states, user preferences CRUD
- Unread badge on News tab (count articles with no articleState document for current user — approximated)

**Definition of Done:**
- [ ] Cloud Function runs on schedule and populates `/newsArticles` with articles from all configured sources
- [ ] News feed screen loads articles within 2 seconds
- [ ] Tapping an article opens it in the device browser
- [ ] Pull-to-refresh gets latest articles from Firestore
- [ ] Watch keywords and category filters correctly narrow the feed
- [ ] Read/Save/Dismiss article state actions persist and affect feed display
- [ ] Read and Saved archives show correct articles
- [ ] Feed settings changes take effect immediately on next feed load

---

## Iteration 6 — Statistics, Global Search & Data Export (16 SP)

**Stories:** BB-060, BB-061, BB-062, BB-070, BB-080
**Goal:** Complete the product with statistics, search, data export, and overall polish pass.

**What gets built:**

*Ionic/Angular:*
- `StatsModule` (lazy-loaded)
- `StatsPage`:
  - Summary metric cards (totals, averages)
  - Rating distribution chart
  - Category breakdown chart
  - Top distilleries and top flavor tags
  - Activity over time chart with toggle
  - Proof and age preference curve charts (with "not enough data" states)
  - Charts via Chart.js with ng2-charts Angular wrapper
- `SearchPage`: global search across log and wishlist (client-side filter against Firestore-cached data), grouped results, navigate to entry on tap
- Settings page: CSV export action
- `ExportService`: generates CSV string from Firestore data, triggers file download / share sheet

*Polish pass across all screens:*
- Ionic skeleton loaders on all list screens while data loads
- Friendly empty states with illustrations or icons on all list screens
- Error states with retry action on Firestore read failures
- Consistent use of Ionic color variables and typography
- Ionic back-button behavior correct on all pages
- Tab bar badge for news unread count
- Review app on iOS Safari / PWA install behavior (manifest.webmanifest, service worker)

**Definition of Done:**
- [ ] All stat metrics calculate correctly from real Firestore data
- [ ] Charts render correctly; preference curve charts show placeholder when insufficient data
- [ ] Global search returns results from both log and wishlist
- [ ] CSV export generates a correct file and opens the share sheet
- [ ] All screens have loading states, empty states, and error states
- [ ] No broken navigation paths in the app
- [ ] App installs as a PWA on iOS Safari (Add to Home Screen)
- [ ] Firebase Hosting deployment is clean and the production URL is accessible

---

## Iteration Summary

| # | Focus | Stories | SP | Cumulative |
|---|---|---|---|---|
| 0 | Foundation & Setup | (non-pointed tasks) | — | — |
| 1 | Auth & App Shell | BB-001–005 | 15 | 15 |
| 2 | Core Log: Add & View | BB-010–012, BB-014, BB-016 | 27 | 42 |
| 3 | Log: Photos, Edit, Filter & Wishlist | BB-013, BB-015, BB-017–019, BB-030–031, BB-033, BB-035 | 28 | 70 |
| 4 | Sightings, Pour Sessions & Wishlist Conversion | BB-020, BB-032, BB-034, BB-040–042 | 20 | 90 |
| 5 | News Feed | BB-050–052 | 15 | 105 |
| 6 | Statistics, Search & Polish | BB-060–062, BB-070, BB-080 | 16 | 121 |

> Note: Total here (121) differs from the story table total (152) because several stories (BB-011, BB-012, BB-019) are included within the scope of their iteration's Definition of Done rather than broken out as separate delivery items in the count above. All 33 stories are delivered across the 6 iterations.

---

## Post-MVP Iteration Roadmap (Iterations 7+)

> Sequenced in dependency order. **Decision (2026-06-29):** build the social
> experience for a **small circle** now (free tier), and treat the public launch
> as a later, explicit gate. The cost/monetization/compliance reasoning lives in
> "Going Public" in [bourbon-buddy-feature-spec.md](bourbon-buddy-feature-spec.md);
> full ACs for every story below are in
> [bourbon-buddy-user-stories.md](bourbon-buddy-user-stories.md).

### Iteration 7 — Foundations & No-Regrets Wins
**Stories:** BB-090, BB-091, BB-120, plus Firestore offline persistence, personal wishlist price alerts
**Goal:** Infrastructure that serves both the circle and a future public launch.
- **Offline persistence** — enable Firestore offline; genuinely valuable since the app is used in liquor stores with poor signal
- **Notifications foundation** — BB-090 (FCM setup) + BB-091 (preferences); unlocks alerts now and social alerts later
- **BB-120 Billing kill-switch + budget alerts** — cheap insurance, built before any public exposure
- **Personal price alerts** on your own wishlist (uses BB-090)

### Iteration 8 — Social Data Foundation (Catalog + Sightings Refactor)
**Stories:** BB-160, BB-161, BB-162
**Goal:** Fix the data shape that the social-sightings features depend on, *before* building them.
- **BB-160 Catalog canonicalization** — one entry per real bottle; improves stats now and is the hard prerequisite for sighting↔wishlist matching
- **BB-161 Decouple sightings** — move sightings to first-class, catalog-keyed `/sightings`; a Hunt List entry's sightings become a query; migrate existing data; repoint the Iteration 7 price-alert trigger
- **BB-162 "Spotted it" capture** — log a sighting for *any* bottle, not just ones on your own list (the change that makes crowd-sourcing possible)
- **BB-163 (creation-side) abuse guards** — per-user sighting rate limits, price/input validation, catalog-spam limits, App Check, stale-sighting cleanup. Ship *with* the decouple, since open creation is the new attack surface.
- *Why now:* MVP sightings are welded to your own wishlist, so a spotter can't report a bottle a friend wants. Building BB-110/112 on that would be building on sand.

> **AI "Find Bottles" (BB-130) moved out of this iteration.** It's independent of
> the social refactor and can be scheduled whenever — see the standalone AI slot
> below.

### Iteration 9 — Social Graph ✅ *(complete)*
**Stories:** BB-100, BB-101, BB-102, BB-103
**Goal:** Friends. The prerequisite network for everything social.
- **BB-100** — opt-in `username` + `/usernames` reservation (transactional,
  case-insensitive uniqueness); `/publicProfiles/{uid}` as the only
  cross-user-readable view (public fields only, since rules can't field-filter);
  "discoverable by username" toggle (default off).
- **BB-101** — exact-handle search (keyed getDocs, no query); `sendFriendRequest`
  callable (self/block/duplicate guards + daily rate limit); outgoing pending +
  cancel; `onFriendRequestCreated` recipient push.
- **BB-102** — `respondToFriendRequest` callable: one transaction writes both
  reciprocal `/friends` edges + both `friendCount`s + request status; idempotent.
- **BB-103** — friends list (hydrated from public profiles), `removeFriend` +
  `blockUser` callables (block also severs friendship & clears pending),
  client-side unblock, read-only public-profile tap-through at `/u/:id`.
- **Deploy:** rules (+`/publicProfiles`, `/usernames`, `/friendRequests`),
  2 `friendRequests` indexes, functions (`sendFriendRequest`,
  `respondToFriendRequest`, `removeFriend`, `blockUser`, `onFriendRequestCreated`).
- **Cost posture:** no new app-wide listeners — every social listener is
  page-scoped to the Friends page; all cross-user writes go through Admin
  callables (a client can't write another user's docs).

### Iteration 10 — Social Sightings & Alerts (the circle payoff) ✅ *(complete)*
**Stories:** BB-110, BB-111, BB-112, BB-113
**Goal:** The headline — get notified when a friend spots a bottle on your Hunt List. Built on the decoupled `/sightings` foundation from Iteration 8.
- **BB-110** — per-sighting visibility (Only me / Friends) + user-level default;
  rules let a spotter's friends read `visibility:'friends'` sightings via a
  `/friends` edge `exists()` check (private stays private, revoked on unfriend).
- **BB-111** — friends' sightings feed: paginated one-shot reads (no live
  listener), hunt-list matches highlighted from the already-open wishlist signal
  (zero extra reads), stale de-emphasis + hide toggle. Index
  `sightings(visibility, spotterUid, createdAt)`.
- **BB-112 ★** — sightings trigger (now `onDocumentWritten`) fans a
  `sightingMatch` push out to the spotter's friends with the bottle on their
  active hunt list; pref-gated, block-safe (blocking severs the edge), with a
  per-recipient marker at `/sightings/{id}/alertRecipients/{uid}` for
  at-most-once + a ≥5% price-drop re-alert threshold.
- **BB-113** — inbox record written alongside every push (recoverable if the
  push is missed); `/inbox` page with unread badge + mark-read + deep-link;
  daily `cleanupOldNotifications` purges records older than 30 days.
- **Also:** iOS home-screen splash screens generated from the logo.
- **Partially deferred — BB-163 (fan-out-side):** per-recipient dedup + the
  price-drop threshold ship here; broader per-spotter fan-out caps / bulk-logging
  coalescing / sighting flagging remain backlog for the public-launch gate.
- **Push caveat:** iOS PWA web-push is workable but flaky. For the *circle* it's
  good enough to validate; reliable push is a reason native iOS (Iteration 12)
  precedes a true public launch.

### AI "Find Bottles" (BB-130, BB-131) — independent slot
No dependency on the social refactor; schedule whenever there's capacity (it was
originally bundled into Iteration 8). BB-130 is the cached, near-zero-cost
extraction; BB-131 (guardrails/BYO key) only matters once a *per-user* AI feature
exists.

### Iteration 11 — Public-Launch Readiness (the gate)
**Stories:** BB-121, BB-122, BB-131, BB-140, BB-141, BB-150, BB-151
**Goal:** Everything required before opening the doors — do **not** start until the circle validates the product.
- Abuse/cost: BB-121 App Check, BB-122 quotas, BB-131 AI guardrails/BYO key
- Revenue: BB-140 subscription infra, BB-141 Pro gating & paywall
- Legal: BB-150 age gate + ToS/Privacy, BB-151 account deletion & data rights
- Business setup (non-code): LLC, ToS/Privacy authored, tax, app-store alcohol compliance

### Iteration 12+ — Native iOS (Phase 3)
Capacitor iOS build, reliable native push, barcode scanning, TestFlight, App
Store submission. Best paired with / just ahead of the public launch so push and
camera are first-class. Android follows after iOS is proven.

---

## Active Roadmap (Post-Social) — agreed 2026-07-05

> The social/sightings foundation (BB-100–BB-113, BB-160–BB-163) has shipped.
> This is the current working plan on top of it. Full stories + acceptance
> criteria live under **Epics 12–15** in
> [bourbon-buddy-user-stories.md](bourbon-buddy-user-stories.md). Iterations are
> labelled R1–R4 to distinguish them from the original MVP iteration numbering.

### Iteration R1 — Header & Sighting Hygiene (~7 SP)
**Stories:** BB-170 ✅, BB-171, BB-172
**Goal:** Declutter the Cellar/Hunt List headers, make sighting freshness
realistic (Fresh/Aging/Stale at 15/30 days), and tune the news + AI cadences
(6h / 30 min). Small, mostly config + a pure-function change (TDD).

### Iteration R2 — Fast Sighting Capture (~13 SP)
**Stories:** BB-173, BB-174, BB-175, BB-176
**Goal:** Contextual FAB speed-dial (add-bottle / log-sighting) plus a PWA
barcode scanner that builds a crowdsourced UPC→catalog index and prefills the
sighting flow. Makes crowd-sourced sightings a one-tap, no-typing action.

### Iteration R3 — Geo Sightings & Proximity Alerts (~17 SP)
**Stories:** BB-177, BB-183, BB-178, **BB-092** (push-reliability fix, inserted
before BB-180 since proximity alerts depend on working background push),
**BB-093** (app-icon badge, follow-on to BB-092), BB-179, BB-180
**Goal:** Opt-in location on sightings (coords + geohash, privacy-guarded), a
user base location + alert radius, a nearby-sightings map, and radius-filtered
Hunt List match alerts (extends BB-112). Needs the geolocation + privacy design
done up front.

### Iteration R4 — Palate & Reliability (~8 SP)
**Stories:** BB-181 ✅, BB-182 ✅
**Goal:** Expand the flavor picker into a curated, tiered flavor wheel (BB-181 —
the canonical taxonomy that R5 depends on) and add offline-first sighting capture
so poor in-store signal never drops a find.
**BB-182 note:** sightings are created through the `logSighting` **callable**, which
Firestore's offline cache can't queue — so BB-182 uses an **explicit outbox**
(`SightingOutboxService`, localStorage-backed) that replays on reconnect, made
duplicate-safe by a client-generated `clientId` the server keys the doc on. A
tappable banner (`OfflineSyncBadgeComponent`) surfaces the pending count.

### Iteration R5 — Guided Tasting & Catalog Intelligence (~8 SP) ✅
**Stories:** BB-185 ✅, BB-186 ✅
**Goal:** AI-enrich catalog bottles with a flavor profile **mapped to the BB-181
taxonomy** (no scraping, no verbatim third-party notes), then pre-fill those
suggestions when logging a bottle (Untappd-style; you confirm/adjust). Reuses the
Groq extraction infra (BB-130) + free-tier pacing.
**Depends on:** BB-181 (canonical vocabulary).

### Iteration R6 — Fast Sighting Entry (~5 SP) ✅
**Stories:** BB-187 ✅
**Goal:** Tap a nearby retailer to auto-fill store + city/state on a sighting,
via an OpenStreetMap **Overpass** query run server-side (cached, fair-use). First
pass = Retailers; Venues (bars/restaurants, BB-189) are backlog.
**Independent** of R5 — can slot whenever.

### Iteration R7 — Bottle Lifecycle & the Graveyard (~8 SP) ✅
**Stories:** BB-191 ✅ (promoted from backlog), BB-192 ✅ *(shipped — PR #98)*
**Goal:** Answer "the bottle is empty." Fill-level becomes glanceable on the
Cellar list, killing a bottle is a one-tap, kept-forever event (with a
time-to-kill stat), and the Cellar splits into **Shelf / Journal / Graveyard**
segments. Core model change: a `logEntry` is a **physical bottle instance**;
`/bourbons` is the **product**. Adds one explicit lifecycle field
(`bottleStatus`) + `finishedAt`; everything else derives from the existing
`entries` signal via unit-tested `deriveBottleStatus` / `matchesCellarView` pure functions — **no
migration, no new listeners/indexes** (legacy entries fall back to
`bottleRemainingPct`).

### Iteration R8 — Rebuys, Bottle History & Barrel Variance (~11 SP) ✅
**Stories:** BB-193 ✅, BB-194 ✅, BB-195 ✅ *(shipped — PR #99)*
**Goal:** Answer "I bought it again" and "this single barrel tastes different." A
**Buy Again** action clones a bottle's identity/spec into a fresh instance (own
price, date, pour log); a **Bottle History roll-up** on the bourbon detail page
groups your logs by `bourbonId` (times logged, price trend, avg rating,
open/killed counts) — all client-side; and **single-barrel variance** turns
per-barrel differences into a comparison that highlights your favorite pick.
Depends on R7's `bottleStatus`; all additive schema
(`repurchaseOfEntryId`, `barrelLabel`).

### Iteration R9 — Price History & Release Radar (~29 SP)
**Stories:** Epic 19 — BB-202, BB-203, BB-204, BB-205, BB-206 (17 SP);
Epic 20 — BB-207, BB-208, BB-209 (12 SP).
**Goal:** The two features that let Bourbon Buddy compete with OnlyDrams on
**pricing history** and **new-release discovery** — built on data the app already
collects, no scraping.
- **Price History (Epic 19):** a per-bottle price timeline that *accumulates over
  time*. Crowd sightings are purged at 30 days, so each spot mints a **durable,
  immutable price point** in a new top-level `/priceHistory` collection (written in
  the `logSighting` callable, own/friends visibility). The `app-price-history`
  detail-page component plots durable crowd points **+** your own permanent purchase
  prices (`bottleHistory().priceTrend`) with honest per-point provenance, an MSRP
  delta, and an "on shelves now" callout from live sightings. Reads are two bounded
  one-shots (no listeners); +1 tiny write per sighting (bounded by the BB-163 rate
  limit). Chain: BB-202 → BB-203 → BB-204 → (BB-205, BB-206).
- **Release Radar (Epic 20):** a "New & Noteworthy" segment on the Dispatch tab,
  derived **client-side** from already-extracted `mentionedBottles` (BB-130) — zero
  new backend, zero extra reads. Taste-match badges, Hunt-List/Cellar annotations,
  add-to-Hunt-List, and the existing preview sheet. Honestly framed as "spotted in
  the news." Chain: BB-207 → BB-208 → BB-209. Independent of Epic 19 (parallelizable).

**Deferred (documented, not scoped):** Radar confidence states
(`firstSeenInNewsAt` / `isNewToCatalog`) and the **TTB COLA** authoritative
upgrade (needs Cloud Run + an admin review queue) — revisit at scale.

### Iteration R10 — Gated Access & Notification Housekeeping (~22 SP)
**Stories:** Epic 21 — BB-210, BB-211, BB-212 (18 SP);
Epic 22 — BB-213, BB-214 (4 SP).
**Goal:** The app is now shared with friends — close the door to strangers and
clean up notification loose ends.
- **Gated Access (Epic 21):** anyone can sign up, but a new account has no access
  until approved. Enforcement is an `approved: true` **custom claim** checked by
  Security Rules and callables (zero extra reads). Allowlisted + verified emails
  auto-approve in seconds; everyone else lands in a pending queue, the owner gets
  a push, and an admin screen (approve/deny + allowlist manager) waves friends
  in. Deny is soft. Chain: BB-210 (backend + rules) → BB-211 (pending flow) →
  BB-212 (admin screen).
  **⚠ Rollout order (lockout hazard):** deploy functions → run
  `backfill-approved-claims.js` (must merge claims, preserving `admin`) → deploy
  app → **deploy rules LAST**.
- **Notification Housekeeping (Epic 22):** remove the dev-era test-notification
  button/callable (visible to every user today — BB-213), and let users prune
  their inbox with an edit mode (multi-select + select-all, no confirm) plus
  swipe-to-delete (BB-214).

**After R10** the backlog remains — **Gamification (Phase 5)** is top of the list,
then **Crowdsourced Flavor Aggregation (BB-188)**, **Nearby Venue Picker
(BB-189)**, and **News Full-Text Search (BB-190)**.

### Iteration R11 — Hunt Lookup & Form Polish *(shipped, doc'd retroactively)*
**Stories:** BB-215 ✅, BB-216 ✅, BB-217 ✅, BB-218 (boot splash — in flight)
Catalog lookup from the Hunt List, Found-It prefill, and form polish. Recorded
here for continuity; this iteration predates its doc entry.

## Active Roadmap — Article Intelligence & My Stores — agreed 2026-07-16

> Full stories + acceptance criteria live under **Epics 23–24** in
> [bourbon-buddy-user-stories.md](bourbon-buddy-user-stories.md). The two tracks
> are independent and may interleave; within each track, order = dependency
> order. Check items off as they ship.

### Iteration R12 — Article Intelligence (Epic 23, ~13 SP)
**Goal:** extract more standardized signal from the articles the AI already
reads — hard facts to backfill the catalog, article-type classification that
gates flavor/verdict trust (press releases never seed the consensus profile),
critic ratings parsed deterministically from printed strings, and per-tag
provenance counts. All in the existing one-call-per-article budget
(`max_tokens` 768 → 1024).

- [x] **BB-219** — Fact extraction + null-only catalog backfill (proof /
      ageStatement / msrp / releaseType), verbatim-in-text guards,
      `extractionVersion` + versioned re-sweep ✅
- [x] **BB-220** — `articleType` classification + per-bottle `verdict`;
      press-release flavor seeds dropped; provenance chip in Dispatch ✅
- [x] **BB-222** ✅ — Per-tag provenance counts on `flavorProfile` — **reordered
      before BB-221 and expanded (2026-07-17):** marketing (press-release)
      notes are captured again, but as a separate lowest-trust tier
      (`marketingTagCounts`) shown as "Distillery says…" — never entering the
      profile arrays, and acting only as a **weak corroborator** (adds weight
      to a tag a review already mentions; marketing-only tags are display-only,
      never feeding Taste Match / Similar Bottles). Review mentions stay the
      load-bearing tier (`tagCounts`, "×N" badges, "Based on N reviews").
- [x] **BB-226** ✅ — **Provider migration (inserted 2026-07-17, urgent):**
      Groq shuts down our Llama models 2026-08-16. AI pipeline moved to the
      Gemini API — extraction on `gemini-3.1-flash-lite` (schema-constrained
      decoding; free tier 15 RPM / 250K TPM / 500 RPD, RPD binds), flavor
      enrichment on `gemma-4-31b-it` (+ fence-stripper; schema required or it
      answers in prose; the 26b-a4b variant degenerates — do not use). Secret
      `GEMINI_API_KEY`; rotate the key post-merge (it transited chat).
- [x] **BB-221** — Numeric ratings: raw-string extraction, server-side
      `parseRating`, idempotent `criticSignals` map, `app-critic-summary` UI
- [x] **BB-188** — Crowdsourced flavor aggregation — **promoted from backlog
      (2026-07-17; user base is growing):** blend users' own confirmed tags
      into the catalog as the TOP trust tier (`userTagCounts`), above reviews >
      marketing > AI-suggested. DONE 2026-07-18: floor 2, full blend, log-write
      trigger `onLogEntryWrittenAggregateFlavor`; distinct-user dedupe, separate
      `userTags`/`userTagCounts`/`contributorCount` on `flavorProfile`,
      `blendedProfileTags` at read (server + client mirror). New COLLECTION_GROUP
      index on `logEntries.bourbonId` — deploy `:indexes` before `:functions`.

### Iteration R13 — My Stores (Epic 24, ~9 SP)
**Goal:** a private retailer notebook — manual price-tier + specialties +
shipment/allocation notes per store, backed by *computed evidence* from the
user's own `/priceHistory` (visits, last seen, avg % vs MSRP). Nav entry in the
Hunt List toolbar next to bottle lookup. No Security Rules change (existing
owner-only subcollection wildcard covers `/users/{uid}/stores`).

- [ ] **BB-223** — `StoreNote` model + `StoreNotesService` (signal state-holder),
      list page, dual-mode form (`/stores`, `/stores/new`, `/stores/:id/edit`),
      Hunt toolbar entry
- [ ] **BB-224** — Store detail page: intel + evidence panel from `/priceHistory`
      (+ composite index `spotterUid ASC, storeName ASC, sightingDate DESC`)
- [ ] **BB-225** — Sighting → store handoff: post-save "Add store intel" toast →
      prefilled `/stores/new`; recent-store suggestions in the store form

---

## Backlog (Post-MVP / Future Phases)

### Phase 2 — Personal Features Completion
- Offline / offline-first (Firestore offline persistence enabled)
- Barcode scanning for bottle entry (Capacitor ML Kit or Quagga.js)
- AI "Find Bottles" from news articles (Claude API via Firebase Function)
- **Notifications & Alerts Foundation (Epic 9)** — the plumbing every alert
  needs, built here so later phases can layer on top:
  - **BB-090 Push Notification Setup (FCM)** — permission flow, device-token
    storage, a reusable send-helper Cloud Function, web-push via service worker
  - **BB-091 Notification Preferences** — per-type opt-in toggles, default off
- Price alerts for wishlist bottles (uses BB-090; richer once Phase 4 adds
  crowd-sourced sightings)
- News digest push (uses BB-090)

### Phase 3 — Native App
- Capacitor iOS build and TestFlight
- App Store submission (iOS)
- Android Capacitor build and Google Play

### Phase 4 — Social / Multi-User

The headline of this phase is **Sighting Match Alerts (BB-112)** — you get
notified when a friend spots a bottle on your Hunt List, with the store and
price. It sits on top of the social graph, shareable sightings, and the Phase 2
push foundation. Build in this order:

**Social Graph (Epic 10)** — the prerequisite network:
- **BB-100 Public Profile & Username** — opt-in discoverable handle
- **BB-101 Find & Add Friends** — search + send requests
- **BB-102 Respond to Friend Requests** — accept/decline, reciprocal edges
- **BB-103 Manage Friends** — list, remove, block

**Social Sightings & Alerts (Epic 11)** — the payoff:
- **BB-110 Share Sightings with Friends** — per-sighting privacy, queryable
  top-level `/sightings` collection
- **BB-111 Friends' Sightings Feed** — see friends' shared finds, Hunt-List
  matches highlighted
- **BB-112 Sighting Match Alerts** ★ — Cloud Function matches a new shared
  sighting against friends' active Hunt Lists and pushes the alert
- **BB-113 Notification Inbox** — in-app, recoverable record of every alert

> **Dependency chain:** BB-112 requires BB-110 (shared sightings) + BB-101/102
> (friends) + BB-090 (push from Phase 2). Don't start BB-112 until those land.

**Further social backlog (not yet story-scoped):**
- Shared wishlists
- Activity feed (friends' recent tries)
- Group tasting events and sessions
- Bottle splits and trade board

Full acceptance criteria for BB-090–BB-113 live in
[bourbon-buddy-user-stories.md](bourbon-buddy-user-stories.md); supporting
schemas in [bourbon-buddy-data-model.md](bourbon-buddy-data-model.md).

### Phase 5 — Gamification
- Palate badges and achievements
- Distillery passport
- Leaderboards
- Annual "Bourbon Wrapped" shareable stats card

### Phase 6 — Web / Public Site
- Public-facing website (beyond PWA)
- Public user profiles (opt-in)
- Trade board

---

## Development Conventions

**Commits:** Conventional commits format
- `feat(BB-010): add log entry core form`
- `fix(BB-014): correct list sort order on category filter`
- `chore: update firestore.rules for sightings access`

**Branching:**
- `feature/BB-XXX-short-name` off `main`
- PR even if solo — keeps git history readable and documents decisions

**Firestore:**
- Always test Security Rules changes locally with emulator before deploying
- Never modify Firestore schema manually in console — reflect all changes in TypeScript models and firestore.rules

**Functions:**
- Test functions locally with emulator before deploying
- Keep function cold-start time low — avoid heavy imports at module level
- All external HTTP calls (RSS fetching) inside try/catch with per-source error handling so one failing feed doesn't break the entire job
