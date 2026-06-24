# Bourbon Buddy — Iteration Plan (MVP)

**Version:** 1.1
**Last Updated:** 2026-06-24
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

## Backlog (Post-MVP / Future Phases)

### Phase 2 — Personal Features Completion
- Offline / offline-first (Firestore offline persistence enabled)
- Barcode scanning for bottle entry (Capacitor ML Kit or Quagga.js)
- AI "Find Bottles" from news articles (Claude API via Firebase Function)
- FCM push notifications (price alerts, new article summaries)
- Price alerts for wishlist bottles

### Phase 3 — Native App
- Capacitor iOS build and TestFlight
- App Store submission (iOS)
- Android Capacitor build and Google Play

### Phase 4 — Social / Multi-User
- Friend connections and social following
- Shared wishlists
- Activity feed (friends' recent tries)
- Crowd-sourced bottle sightings visible across friend network
- Group tasting events and sessions
- Bottle splits

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
