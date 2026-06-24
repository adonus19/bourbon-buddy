# Bourbon Buddy — User Stories

**Version:** 1.1
**Last Updated:** 2026-06-24
**Scope:** MVP — Single User (Daniel)

---

## Story Format

> **As a** user, **I want to** [action], **so that** [benefit].

Each story includes:
- **Story ID** — referenced in the iteration plan
- **Acceptance Criteria (AC)** — testable conditions that confirm the story is done
- **Story Points (SP)** — relative effort (Fibonacci: 1, 2, 3, 5, 8, 13)

---

## Epic 1: Authentication & Account Setup

### BB-001 — Email/Password Registration
**As a** new user, **I want to** create an account with my email and password, **so that** my bourbon data is saved to my account.

**AC:**
- Registration screen accepts email, password, and display name
- Firebase Auth creates the account; a Firestore `/users/{uid}` document is created on first sign-in
- Password minimum 8 characters (Firebase Auth enforced)
- Duplicate email rejected with a clear message
- On success, user is automatically signed in and taken to the log screen

**SP:** 3

---

### BB-002 — Social Sign-In (Google, Apple, Facebook)
**As a** new or returning user, **I want to** sign in with Google, Apple, or Facebook, **so that** I don't have to manage a separate password.

**AC:**
- Login screen offers buttons for Google, Apple, and Facebook sign-in alongside email/password
- Each provider uses the appropriate Firebase Auth SDK method
- On first social sign-in, a Firestore user profile document is created if one doesn't exist
- On subsequent sign-ins, the user is taken directly to the log screen
- Apple Sign-In is available on iOS (required by Apple guidelines)

**SP:** 5

---

### BB-003 — Persistent Session
**As a** returning user, **I want to** stay signed in between app sessions, **so that** I don't have to log in every time I open the app.

**AC:**
- Firebase Auth session persistence is configured for local persistence
- On app launch, if a valid session exists, the user goes directly to the log screen without seeing the login screen
- Expired or revoked sessions redirect to login

**SP:** 2

---

### BB-004 — Password Reset
**As a** user, **I want to** reset my password via email, **so that** I can regain access if I forget it.

**AC:**
- "Forgot password" link on the login screen
- User enters their email; Firebase Auth sends a reset link
- Reset email is sent regardless of whether the address exists (no enumeration)
- After clicking the link and resetting, user is redirected to login
- Success message is shown after submitting the email form

**SP:** 2

---

### BB-005 — User Profile Edit
**As a** user, **I want to** update my display name, avatar, and bio, **so that** my profile reflects my preferences.

**AC:**
- Profile settings screen allows editing of display name, bio, and home region
- Avatar can be taken with camera or selected from photo library; uploaded to Firebase Storage
- Changes update both Firebase Auth profile (display name) and the Firestore user document
- Success confirmation shown on save

**SP:** 3

---

## Epic 2: Bourbon Log — Core

### BB-010 — Add Log Entry (Core Fields)
**As a** user, **I want to** add a bourbon to my log with its basic details, **so that** I have a record of what I've tried.

**AC:**
- "Add Entry" accessible from the log list screen (FAB button)
- Required field: Bourbon Name
- Bourbon name input searches the `/bourbons` catalog with autocomplete as user types
- If no match found, user can proceed and a new catalog document is created on save
- Optional fields: Distillery, Bottler, Category (dropdown), Sub-type (dropdown), Entry Type (dropdown), Purchase Price, Purchase Location, Purchase Date, Bottle Size
- "Did Not Purchase" toggle grays out and clears price and location fields
- Entry is saved to `/users/{uid}/logEntries`; user is taken to the new entry's detail screen

**SP:** 8

---

### BB-011 — Tasting Notes & Rating
**As a** user, **I want to** rate a bourbon and add structured tasting notes, **so that** I can remember exactly what I thought of it.

**AC:**
- Half-star rating widget (0.5–5.0 increments)
- Separate flavor tag selectors for Nose, Palate, and Finish — tags grouped by category, scrollable, multi-select
- Freeform text field beneath each stage's tags
- Finish Length selector: Short / Medium / Long
- General personal notes field
- Would Buy Again: Yes / No / Maybe
- All tasting note fields are optional; an entry can be saved without them and updated later

**SP:** 8

---

### BB-012 — Bottle Details
**As a** user, **I want to** record detailed bottle information, **so that** I can compare bottles accurately over time.

**AC:**
- Fields: Age Statement (years) with NAS toggle (mutually exclusive — toggling NAS clears age and vice versa), Proof (decimal), Mash Bill (Corn %, Rye %, Wheat %, Malt % — each independent, no sum validation), Batch Number, Barrel Number, Series/Collection
- All fields optional
- These fields are part of the Add/Edit Entry flow, not a separate screen

**SP:** 3

---

### BB-013 — Label Photo
**As a** user, **I want to** attach a label photo to my log entry, **so that** I can visually identify the bottle later.

**AC:**
- Photo option in the entry form — camera or photo library
- Photo compressed client-side before upload to Firebase Storage
- Upload path: `/labels/{userId}/{entryId}/label.jpg`
- Photo URL stored on the log entry document
- Displayed on the log entry card (thumbnail) and full-width on the detail screen
- User can replace or remove the photo from the edit screen

**SP:** 5

---

### BB-014 — View Log List
**As a** user, **I want to** see all my logged bourbons in a list, **so that** I can browse my history.

**AC:**
- List view shows: bourbon name, distillery, star rating display, entry date, label photo thumbnail, entry type badge
- Default sort: entry date descending (most recent first)
- Sort options accessible from a sort control: Date Added, Rating (high–low), Name (A–Z), Distillery, Proof
- Empty state shows a friendly message and "Add Your First Bourbon" CTA
- List uses Ionic virtual scroll for performance with large lists

**SP:** 5

---

### BB-015 — Filter & Search Log
**As a** user, **I want to** filter and search my log, **so that** I can find specific entries quickly.

**AC:**
- Search bar filters by bourbon name and distillery in real time (client-side against loaded data)
- Filter panel (Ionic modal or slide-in) accessible via filter icon
- Filters: Category (multi-select chips), Rating range (range slider), Entry Type (multi-select), Proof range (range slider), Date range (date pickers), Flavor Tags (multi-select)
- Active filters shown as dismissible chips beneath the search bar
- All filters and search combine additively (AND logic)

**SP:** 5

---

### BB-016 — Log Entry Detail
**As a** user, **I want to** view all details of a logged bourbon, **so that** I can revisit my full notes.

**AC:**
- Shows all fields from the entry and bottle details
- Flavor tags displayed as chips grouped by stage (Nose / Palate / Finish)
- Value score displayed if both rating and price are present (with a tooltip explaining the formula)
- Label photo displayed full-width at top
- Edit and Delete actions in the page header or via FAB
- List of pour sessions at the bottom (if any)

**SP:** 3

---

### BB-017 — Edit Log Entry
**As a** user, **I want to** edit an existing log entry, **so that** I can correct mistakes or add notes I forgot.

**AC:**
- Edit action on the detail screen opens the entry in edit mode with all fields pre-populated
- Saving updates the Firestore document (including recomputing valueScore if rating or price changed)
- Cancel returns to detail view without changes
- updatedAt timestamp refreshed on save

**SP:** 3

---

### BB-018 — Delete Log Entry
**As a** user, **I want to** delete a log entry, **so that** I can remove mistakes.

**AC:**
- Delete action on detail screen
- Confirmation dialog shown before deletion
- Document is deleted from Firestore (hard delete acceptable for MVP; soft delete can be added later)
- User returned to log list on confirmation

**SP:** 2

---

### BB-019 — Value Score Display
**As a** user, **I want to** see a value score on my log entries, **so that** I can identify which bottles gave me the best experience per dollar.

**AC:**
- Value score = `(rating / 5) × 100 / purchasePrice`
- Displayed on the detail screen and as an optional column in list view
- Only shown when both `rating` and `purchasePrice` are present
- Log list can be sorted by value score (highest first)
- Info icon or tooltip explains the formula

**SP:** 2

---

### BB-020 — Pour Session Log
**As a** user, **I want to** log individual pours from a bottle I own, **so that** I can track how my perception of a bourbon changes over time.

**AC:**
- "Log a Pour" action only visible on entries where `entryType === 'bottle_purchased'`
- Pour form fields: Date, Setting Notes, Rating (optional), Tasting Notes
- Pour sessions stored in subcollection `logEntries/{entryId}/pourSessions`
- Sessions listed chronologically on the detail screen
- Average pour rating displayed alongside the original entry rating
- Bottle remaining percentage is editable directly from the detail screen

**SP:** 5

---

## Epic 3: Wishlist

### BB-030 — Add to Wishlist
**As a** user, **I want to** add a bourbon to my wishlist, **so that** I can track bottles I want to try.

**AC:**
- "Add to Wishlist" accessible from the wishlist screen (FAB)
- Bourbon name searches the catalog with autocomplete; new entries create a catalog document
- Fields: Bourbon Name (required), Distillery, Category, MSRP, Priority Tier, Status, External Tasting Notes, Personal Notes, Discovery Source, Discovery URL, Review Links (add multiple)
- Saved to `/users/{uid}/wishlistEntries`

**SP:** 5

---

### BB-031 — View Wishlist
**As a** user, **I want to** view all bourbons on my wishlist, **so that** I can plan what to try next.

**AC:**
- List shows: bourbon name, distillery, priority badge (color-coded), MSRP, best non-stale sighting price, status
- Default sort: Priority (Grail → High → Normal → Low), then name alphabetically
- Sort options: Priority, Name, MSRP, Best Price
- Filter by: Priority Tier, Category, Price range
- "Logged" entries hidden from the active list; accessible via "Archived" toggle
- Empty state with CTA

**SP:** 3

---

### BB-032 — Price Sightings on Wishlist Entry
**As a** user, **I want to** record prices I find for a wishlist bourbon, **so that** I can track where to get the best deal.

**AC:**
- "Add Sighting" accessible from the wishlist entry detail screen
- Fields: Store Name (required), Price (required), Date Observed (required), City, State, Notes
- Sightings saved as subcollection documents under the wishlist entry
- Multiple sightings per entry supported
- Best (lowest, non-stale) price cached on the wishlist entry document and shown on the list card
- MSRP vs. best sighting shown as a delta percentage
- Sightings older than 60 days are visually flagged as stale

**SP:** 5

---

### BB-033 — Wishlist Entry Detail
**As a** user, **I want to** see all details and sightings for a wishlist bourbon, **so that** I can research a bottle before buying.

**AC:**
- All wishlist fields displayed
- Sightings listed, sorted by price then date, with stale visual treatment
- Review links shown as tappable external links
- Edit and Delete actions available
- "Found It — Log It" action prominent on this screen

**SP:** 3

---

### BB-034 — Move Wishlist Entry to Log
**As a** user, **I want to** convert a wishlist entry to a log entry when I try or buy it, **so that** I don't have to re-enter all the information.

**AC:**
- "Found It — Log It" action on the wishlist entry detail screen
- Opens the Add Log Entry form pre-filled with: bourbon name, distillery, category, sub-type (from wishlist entry)
- External tasting notes from wishlist carried into the personal notes field (user can edit/clear)
- On save, the wishlist entry's `status` is set to `'logged'` and it disappears from the active wishlist
- Wishlist entry is NOT deleted — accessible in archived view

**SP:** 5

---

### BB-035 — Edit & Delete Wishlist Entry
**As a** user, **I want to** edit or delete a wishlist entry, **so that** I can keep my list accurate.

**AC:**
- Edit button pre-populates all fields
- Delete shows confirmation dialog; document is deleted from Firestore
- Editing a price sighting: tap sighting to edit or swipe to delete

**SP:** 2

---

## Epic 4: Bottle Sightings

### BB-040 — Log a Bottle Sighting
**As a** user, **I want to** log where I spotted a bottle and its price, **so that** I can find it again later.

**AC:**
- Sighting can be logged from: wishlist entry detail, log entry detail, or a standalone entry point
- Fields: Bourbon Name (auto-filled from context when available), Store Name, Price, Date, City, State, Notes
- New sighting saved as a subcollection doc under the wishlist entry (or associated entry)
- `bestSightingPrice` on the parent wishlist entry is updated after save

**SP:** 5

---

### BB-041 — View Sightings for a Bottle
**As a** user, **I want to** see all sightings for a specific bourbon, **so that** I can find the best place to buy it.

**AC:**
- Sightings list on both log entry detail and wishlist entry detail
- Sorted by price asc, then date desc
- Stale sightings (>60 days) visually de-emphasized with a "May be outdated" label
- Each row: Store Name, Price, Date, City/State, MSRP delta

**SP:** 3

---

### BB-042 — Mark Sighting as Stale
**As a** user, **I want to** manually mark a sighting as outdated, **so that** the list stays accurate.

**AC:**
- Swipe action or context menu on a sighting: "Mark as Outdated"
- Sets `markedStaleManually: true` on the sighting document
- Sighting immediately moves to the stale visual state
- `bestSightingPrice` on parent wishlist entry is recalculated

**SP:** 2

---

## Epic 5: News Feed

### BB-050 — View News Feed
**As a** user, **I want to** see a curated feed of bourbon and whiskey news, **so that** I can stay informed and discover new bottles.

**AC:**
- News tab shows a scrollable list of article cards
- Each card: headline, source name, relative time, excerpt, thumbnail (if available)
- Tapping a card opens the article URL in the device's default browser
- Feed loads within 2 seconds on a typical connection (data is in Firestore, not fetched from RSS on demand)
- Pull-to-refresh re-queries Firestore for the latest articles
- Empty state if no articles match user preferences

**SP:** 5

---

### BB-051 — Configure Feed Preferences
**As a** user, **I want to** customize my news feed, **so that** it surfaces articles relevant to my interests.

**AC:**
- Feed Settings accessible from the news tab header
- Watch Keywords: text input with add/remove chips
- Watch Distilleries: text input with autocomplete from bourbon catalog, add/remove chips
- News Categories: toggles for Release Announcements, Award Results, Distillery News, Conventions & Festivals, General News (General on by default)
- Exclude Keywords: text input with add/remove chips
- Settings saved to `/userNewsPreferences/{uid}` in Firestore
- Feed re-filters immediately after settings are saved

**SP:** 5

---

### BB-052 — Article State Management
**As a** user, **I want to** mark articles as read, saved, or dismissed, **so that** my feed stays relevant and uncluttered.

**AC:**
- Swipe left on an article card reveals: "Mark Read," "Save," "Not Interested"
- State written to `/users/{uid}/articleStates/{articleId}`
- Read articles viewable in a "Read" archive tab/section
- Saved articles viewable in a "Saved" section
- Dismissed articles never appear in the main feed again
- Unread count badge on the News tab icon (count of new articles since last visit)

**SP:** 5

---

## Epic 6: Statistics Dashboard

### BB-060 — Summary Statistics
**As a** user, **I want to** see an overview of my bourbon journey statistics, **so that** I can understand my taste profile and track my progress.

**AC:**
- Stats screen shows: Total bourbons logged, Total distilleries tried, Total spent (sum of purchase prices), All-time average rating
- Rating distribution bar chart (count per star value)
- Bottles by category breakdown (chart)
- Top 3 distilleries by average rating (min 2 entries each)
- Top 5 most-used flavor tags
- All statistics calculated from the user's `/logEntries` subcollection

**SP:** 8

---

### BB-061 — Preference Curves
**As a** user, **I want to** see how my ratings correlate with proof and age, **so that** I understand what style of bourbon I prefer.

**AC:**
- Proof preference chart: X-axis = proof ranges (≤90, 91–100, 101–110, 111–120, >120), Y-axis = average rating
- Age preference chart: X-axis = age ranges (NAS, <6yr, 6–10yr, 11–15yr, >15yr), Y-axis = average rating
- Charts only shown when at least 5 data points exist in a range; otherwise "Not enough data yet" placeholder per chart
- Charts rendered using an Ionic-compatible charting library (e.g., Chart.js via ng2-charts)

**SP:** 5

---

### BB-062 — Activity Over Time
**As a** user, **I want to** see a chart of how many bourbons I've logged over time, **so that** I can see my activity trends.

**AC:**
- Bar chart: bottles logged per month
- Toggle: past 3 months / past 12 months / all-time
- Tapping a bar shows the list of entries for that month

**SP:** 3

---

## Epic 7: Search

### BB-070 — Global Search
**As a** user, **I want to** search across my log and wishlist from one search bar, **so that** I can find anything in the app quickly.

**AC:**
- Dedicated search tab or persistent search icon
- Results appear as user types (debounced 300ms, min 2 characters)
- Results grouped by section: "In My Log," "On My Wishlist"
- Each result shows name, distillery, and a key detail (rating or price)
- Tapping a result navigates to that entry's detail screen
- Search is client-side against locally cached Firestore data for MVP

**SP:** 5

---

## Epic 8: Data Export

### BB-080 — Export Data as CSV
**As a** user, **I want to** export my bourbon log and wishlist as CSV files, **so that** I own my data.

**AC:**
- Export option in app Settings
- User can choose: Log only, Wishlist only, or Both
- CSV generated client-side from Firestore data
- File shared via the device native share sheet
- All entry fields included in the CSV
- Completes within 10 seconds for up to 500 entries

**SP:** 3

---

## Story Summary Table

| Story ID | Title | Epic | SP |
|---|---|---|---|
| BB-001 | Email/Password Registration | Auth | 3 |
| BB-002 | Social Sign-In (Google, Apple, Facebook) | Auth | 5 |
| BB-003 | Persistent Session | Auth | 2 |
| BB-004 | Password Reset | Auth | 2 |
| BB-005 | User Profile Edit | Auth | 3 |
| BB-010 | Add Log Entry (Core) | Log | 8 |
| BB-011 | Tasting Notes & Rating | Log | 8 |
| BB-012 | Bottle Details | Log | 3 |
| BB-013 | Label Photo | Log | 5 |
| BB-014 | View Log List | Log | 5 |
| BB-015 | Filter & Search Log | Log | 5 |
| BB-016 | Log Entry Detail | Log | 3 |
| BB-017 | Edit Log Entry | Log | 3 |
| BB-018 | Delete Log Entry | Log | 2 |
| BB-019 | Value Score Display | Log | 2 |
| BB-020 | Pour Session Log | Log | 5 |
| BB-030 | Add to Wishlist | Wishlist | 5 |
| BB-031 | View Wishlist | Wishlist | 3 |
| BB-032 | Price Sightings on Wishlist Entry | Wishlist | 5 |
| BB-033 | Wishlist Entry Detail | Wishlist | 3 |
| BB-034 | Move Wishlist Entry to Log | Wishlist | 5 |
| BB-035 | Edit & Delete Wishlist Entry | Wishlist | 2 |
| BB-040 | Log a Bottle Sighting | Sightings | 5 |
| BB-041 | View Sightings for a Bottle | Sightings | 3 |
| BB-042 | Mark Sighting as Stale | Sightings | 2 |
| BB-050 | View News Feed | News | 5 |
| BB-051 | Configure Feed Preferences | News | 5 |
| BB-052 | Article State Management | News | 5 |
| BB-060 | Summary Statistics | Stats | 8 |
| BB-061 | Preference Curves | Stats | 5 |
| BB-062 | Activity Over Time | Stats | 3 |
| BB-070 | Global Search | Search | 5 |
| BB-080 | Export Data as CSV | Data | 3 |

**Total Story Points: 152**
