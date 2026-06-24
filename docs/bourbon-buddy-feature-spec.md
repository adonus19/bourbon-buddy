# Bourbon Buddy — Product Feature Specification

**Version:** 1.1
**Last Updated:** 2026-06-24
**Scope:** MVP — Single User

---

## Overview

Bourbon Buddy is a mobile-first personal bourbon and whiskey tracking application. The MVP is a Progressive Web App (PWA) built with Ionic and Angular, backed by Firebase. It is designed to be used primarily while the user is away from a computer — in a bottle shop, at a bar, or at a tasting event.

---

## Feature Areas

---

### 1. Authentication & Account Management

Powered by **Firebase Authentication**.

**Sign-in methods (all MVP):**
- Email and password
- Google Sign-In
- Apple Sign-In
- Facebook Login

**Features:**
- Registration with email/password creates a Firestore user profile document on first sign-in
- Social sign-in (Google, Apple, Facebook) also creates a profile document on first authentication if one does not exist
- Password reset via email (Firebase Auth built-in)
- User profile: display name, avatar photo (stored in Firebase Storage), home region (optional), bio (optional)
- Account settings: update display name, avatar, bio; email/password users can update email and password
- Session persistence handled by Firebase Auth SDK (tokens refresh automatically)

---

### 2. Bourbon Log (The Tracker)

The heart of the app. Every bourbon the user has tried is logged here.

#### 2a. Log Entry Fields

**Core Identity:**
- Bourbon/Whiskey Name (required)
- Distillery name
- Bottler name (if different from distillery — relevant for sourced whiskeys and private labels)
- Category: Bourbon / Rye / Wheat Whiskey / Tennessee / Other American / Scotch / Irish / Japanese / World Other
- Sub-type: Single Barrel / Small Batch / Blended / Cask Strength / NAS / Straight / Bottled-in-Bond

**Bottle Details:**
- Age Statement (years, numeric) or NAS flag (mutually exclusive toggle)
- Proof (ABV, decimal — e.g., 107.0)
- Mash Bill: Corn %, Rye %, Wheat %, Malt % (each optional; no validation that they sum to 100)
- Batch Number (optional text)
- Barrel Number (optional text)
- Series/Collection name (optional — e.g., "Buffalo Trace Antique Collection")

**Purchase / Experience Info:**
- Entry Type: Tried as a Drink / Purchased Bottle / Gift Received / Sample or Split / Virtual Tasting
- Did Not Purchase flag (grays out price and location fields — e.g., tried at a friend's house)
- Purchase Price (numeric, optional)
- Purchase Location / Venue Name (text, optional)
- Purchase Date (date picker, optional; defaults to today)
- Bottle Size: 50ml / 200ml / 375ml / 750ml / 1L / 1.75L
- Bottle Remaining: Full / Three-Quarters / Half / One-Quarter / Empty (only relevant when Entry Type is Purchased Bottle)

**Ratings & Notes:**
- Overall Star Rating: 1–5 stars in half-star increments
- Structured Tasting Notes:
  - Nose: selectable flavor tags + freeform text field
  - Palate: selectable flavor tags + freeform text field
  - Finish: selectable flavor tags + freeform text field
  - Finish Length: Short / Medium / Long
- Personal Notes / Story (freeform — e.g., "had this on my anniversary")
- Would Buy Again: Yes / No / Maybe
- Label Photo (taken with camera or selected from photo library; stored in Firebase Storage)
- Entry Date (auto-populated to today; user can change)

**Computed Field:**
- Value Score: `(rating / 5) × 100 / purchasePrice` — stored as a field on save, recalculated on rating or price update; only populated when both rating and price are present

**Flavor Tag Library (categories and examples — full list defined during development):**
- Sweet: Vanilla, Caramel, Honey, Butterscotch, Brown Sugar, Maple, Chocolate, Toffee
- Fruit: Cherry, Apple, Pear, Citrus, Dried Fruit, Banana, Berry
- Spice: Rye Spice, Cinnamon, Nutmeg, Black Pepper, Clove, Ginger
- Oak / Wood: Oak, Toasted Oak, Char, Cedar
- Grain: Corn, Wheat, Malt, Biscuit, Bread
- Other: Leather, Tobacco, Floral, Mint, Earthy, Nutty, Coffee, Smoke

#### 2b. Pour Log (Sub-feature of a Purchased Bottle Entry)

Users who logged a purchased bottle may record individual pour sessions from that bottle over time.

- Pour Date
- Setting / Occasion notes (freeform)
- Per-Pour Rating (optional, 0.5–5.0)
- Per-Pour Tasting Notes (freeform)

Pour sessions display chronologically on the log entry detail screen. The average rating across all pours is shown alongside the original entry rating.

#### 2c. Log Views & Filters

- **List view:** bourbon name, distillery, star rating, entry date, label photo thumbnail (if any), entry type badge
- **Sort options:** Date Added (default), Rating high–low, Name A–Z, Distillery, Proof
- **Filter panel:** Category (multi-select), Rating range, Distillery (text), Entry Type (multi-select), Proof range, Date range, Flavor Tags (multi-select)
- **Search:** real-time filter by name and distillery
- Active filters displayed as dismissible chips

#### 2d. Log Entry Detail

Full detail view of a single entry showing all fields, flavor tag chips grouped by stage, value score (if applicable), label photo, and the list of pour sessions.

---

### 3. Wishlist

Tracks bourbons the user wants to try.

#### 3a. Wishlist Entry Fields

**Core Identity:**
- Bourbon/Whiskey Name (required)
- Distillery
- Category and Sub-type
- MSRP

**Research & Notes:**
- External Tasting Notes (freeform — from reviews, articles, podcasts)
- External Review Links (one or more URLs with optional display labels)
- Personal Notes (why they want to try it)
- Source of Discovery (text — e.g., "Whisky Advocate," "friend's recommendation")
- Discovery URL (link to article or review that surfaced the bottle)

**Priority & Status:**
- Priority Tier: Grail (must-have) / High / Normal / Low
- Status: Actively Looking / Casually Looking / Just Browsing

**Price Sightings (sub-list within each wishlist entry):**
Each sighting records:
- Store / Venue Name (required)
- Price Observed (required)
- Date Observed (required)
- City, State (optional)
- Notes (optional)
- Stale flag: automatically true when sighting date is more than 60 days ago (computed on read)

The best (lowest) price from all non-stale sightings is surfaced on the wishlist card. MSRP vs. best sighting is compared and displayed as a delta ("15% above MSRP" or "5% below MSRP").

#### 3b. Wishlist Views

- List sorted by: Priority (default), Name, MSRP, Best Price
- Filter by: Priority Tier, Category, Price range
- "Found It — Log It" action converts the wishlist entry to a log entry form pre-populated with bottle details; on save the wishlist entry status becomes `logged` and it moves to an archive view

---

### 4. Bottle Sightings

Records of where the user found a specific bottle and at what price. In MVP this is self-sourced. In future social versions this becomes crowd-sourced.

Sightings can be created from:
- A wishlist entry detail screen
- A log entry detail screen
- A standalone "Add Sighting" entry point

Each sighting is stored as a subcollection document under the relevant `bourbons` catalog document and also referenced from the user's wishlist or log entry.

Sightings list view for a bottle:
- Sorted by price (lowest first), then date (most recent first)
- Sightings older than 60 days visually flagged as stale
- Each row: Store Name, Price, Date, City/State, MSRP comparison delta
- Manual "Mark as Stale" option per sighting

---

### 5. News Feed

A curated, personalized feed of bourbon and whiskey news articles, fetched from trusted RSS sources by a Firebase Cloud Function on a schedule (every 12 hours).

#### 5a. RSS Sources (Initial Set)

The following sources have confirmed RSS feeds and are bourbon/whiskey focused with consistent publishing cadence:

| Source | Focus | RSS URL |
|---|---|---|
| Breaking Bourbon | Bourbon news, reviews, release calendar | `breakingbourbon.com/articles/feed` |
| The Bourbon Review | Bourbon lifestyle, events, reviews | `gobourbon.com/feed` |
| The Whiskey Wash | Broad whiskey news and reviews | `thewhiskeywash.com/feed` |
| Whisky Advocate | America's leading whisky magazine | `whiskyadvocate.com/feed/?x=1` |
| Modern Thirst | Bourbon and craft spirits reviews | `modernthirst.com/feed` |
| Fred Minnick | Author/journalist bourbon coverage | `fredminnick.com/news/feed` |
| The Spirits Business | Industry-level spirits news | `thespiritsbusiness.com/feed` |
| BourbonBlog | Reviews, industry updates, culture | `bourbonblog.com/feed` |
| Bourbon Guy | Approachable reviews, distillery tours | `bourbonguy.com/blog?format=rss` |
| GlobeNewswire (bourbon tag) | Press releases, new releases, awards | `rss.globenewswire.com/en/search/tag/bourbon` |

Additional sources can be added to the Firebase Remote Config feed list without a code deploy.

#### 5b. Feed Fetching (Firebase Cloud Function)

- Scheduled Cloud Function runs every 12 hours
- Fetches each RSS source, parses feed items
- Deduplicates by article URL before writing to Firestore
- Stores: headline, source name, excerpt, URL, thumbnail URL (if available), published date, fetched date, category tags
- Articles older than 90 days are not ingested; cleanup job removes articles older than 90 days monthly

#### 5c. User Feed Customization

Users configure their feed via a Feed Settings screen:

- **Watch Keywords:** specific bourbon or whiskey names (e.g., "Blanton's," "Pappy Van Winkle") — articles containing these terms surface with a highlight
- **Watch Distilleries:** select/type distillery names to follow
- **News Categories to include:**
  - Release Announcements
  - Award Results & Competition Coverage
  - Distillery News & Events
  - Conventions & Festivals
  - General Bourbon / Whiskey News (on by default)
- **Exclude Keywords:** filter out topics the user doesn't care about

Filtering is applied client-side against the Firestore article collection, using the user's preferences document.

#### 5d. Feed Item Display

Each article card shows:
- Headline
- Source name
- Relative time ("2 days ago")
- 2–3 sentence excerpt
- Thumbnail image (if available)

Tapping a card opens the article in the device's default browser (external link).

#### 5e. Article State Management

- **Mark as Read** — removes from active feed, accessible in Read archive
- **Save for Later** — bookmarked list
- **Not Interested** — permanently dismissed from this user's feed
- Unread count badge on the News tab

#### 5f. AI "Find Bottles" Feature — BACKLOGGED

The quick-add-to-wishlist AI feature (extracting bottle names from articles using the Claude API) is planned but not included in MVP scope. It is documented in the backlog section of the iteration plan for future implementation.

---

### 6. Statistics & Insights Dashboard

Personal analytics about the user's bourbon journey.

**Summary metrics:**
- Total bourbons logged (lifetime)
- Total unique distilleries tried
- Total spent (sum of all purchase prices where price was entered)
- All-time average rating

**Charts and visualizations:**
- Rating distribution: histogram of entries by star rating
- Bottles by category: pie or bar chart
- Favorite distilleries: top 3 by average rating (minimum 2 entries each)
- Top flavor tags: top 5 most-selected across all entries
- Activity over time: bottles logged per month for the past 12 months (toggle: 3 months / 12 months / all-time)
- Proof preference curve: average rating by proof range (80–90, 91–100, 101–110, 111–120, 120+); shown only when 5+ data points per band
- Age preference curve: average rating by age range (NAS, under 6yr, 6–10yr, 11–15yr, 15+yr); shown only when 5+ data points per band

Tapping a chart bar shows the contributing log entries for that data point.

---

### 7. Global Search

- Searches across the user's log entries, wishlist entries, and bottle sightings simultaneously
- Real-time results as user types (debounced, minimum 2 characters)
- Results grouped: "In My Log" / "On My Wishlist" / "Sightings"
- Tapping a result navigates to that entry's detail screen

---

### 8. Data Export

- Export full log and/or wishlist as CSV
- File shared via the device's native share sheet (save to Files, email, etc.)
- Available from app Settings

---

## Non-Functional Requirements (MVP)

- **Platform:** PWA via Ionic/Angular, mobile-first. Tested primarily on iOS Safari.
- **Offline:** Online required for MVP. Firestore offline persistence is a post-MVP enhancement.
- **Performance:** Feed load < 2 seconds; log entry save < 1 second perceived
- **Privacy:** All user data private by default; Firestore Security Rules enforce per-user isolation
- **PWA requirements:** Manifest, service worker (for installability), HTTPS

---

## Out of Scope for MVP (Backlog)

- Offline / offline-first data access
- Native iOS / Android app (Capacitor builds)
- Android support
- Public-facing website
- Friend connections, social following, activity feed
- Shared wishlists
- Group tasting events and sessions
- Bottle splits and trade board
- Crowd-sourced sightings across users
- Gamification (badges, leaderboards, passport)
- Barcode scanning
- AI "Find Bottles" from news articles (Claude API integration)
- Push notifications (FCM wiring deferred)
- Price alerts
- Flavor profile recommendation engine
