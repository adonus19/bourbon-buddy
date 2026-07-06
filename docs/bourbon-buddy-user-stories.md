# Bourbon Buddy — User Stories

**Version:** 1.4
**Last Updated:** 2026-06-30
**Scope:** MVP — Single User (Daniel) + Post-MVP Social stories (Phases 2 & 4)

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
- Freshness tiers (BB-171): `aging` (15–30d) softly flagged, `stale` (>30d) de-emphasized with a "May be outdated" label
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

---

# Post-MVP User Stories — Social, Sightings & Notifications

> **Scope:** Beyond the single-user MVP. These stories deliver the headline
> social feature — **Sighting Match Alerts** (be notified when a friend spots a
> bottle on your Hunt List) — and every supporting capability it depends on.
> They map to **Phase 2 (Notifications foundation)** and **Phase 4 (Social /
> Multi-User)** in the iteration plan. The dependency chain is:
> BB-112 (the alert) → BB-110 (shared sightings) + BB-101/102 (friends) +
> BB-090 (push). Build the foundation first.

## Epic 9: Notifications & Alerts Foundation *(Phase 2)*

### BB-090 — Push Notification Setup (FCM)
**As a** user, **I want** the app to send me push notifications, **so that** I'm alerted to time-sensitive events even when the app is closed.

**AC:**
- Notification permission is requested contextually (when the user first enables a notification-backed feature), never on cold first launch
- On grant, an FCM registration token is obtained and stored at `/users/{uid}/fcmTokens/{tokenId}` with device metadata and `updatedAt`
- Tokens refresh on rotation and are deleted on sign-out or permission revocation
- A reusable Cloud Function helper delivers to all of a user's valid tokens and prunes any that return `messaging/registration-token-not-registered`
- Works as a PWA (web push via the service worker) and is forward-compatible with a future Capacitor native build
- If permission is denied, the app degrades gracefully and relies on the in-app inbox (BB-113) only

**SP:** 8

---

### BB-091 — Notification Preferences
**As a** user, **I want to** control which notifications I receive, **so that** I only get the alerts I care about.

**AC:**
- Settings exposes a per-type toggle for each notification category (Sighting match alerts, Wishlist price alerts, Friend requests, News digest)
- Preferences are stored at `/users/{uid}/notificationPrefs`; every type defaults **off** until explicitly enabled
- A master "Pause all notifications" switch overrides the individual toggles
- Every sending Cloud Function checks the recipient's preference before delivering; a disabled type is never sent
- Preference changes take effect on the next event with no redeploy

**SP:** 3

---

## Epic 10: Social Graph *(Phase 4)*

### BB-100 — Public Profile & Username
**As a** user, **I want** an opt-in public handle and profile, **so that** friends can find and recognize me.

**AC:**
- User can claim a unique, case-insensitive username (3–20 chars, alphanumeric + underscore); uniqueness enforced by a `/usernames/{usernameLower}` reservation document written transactionally
- Profile has a "Discoverable by username" toggle (default off); when off the user cannot be found in search
- A public profile exposes only displayName, username, avatar, home region, and aggregate counts — never log/wishlist contents
- Username changes release the previous reservation atomically
- Security rules block claiming a taken username and reading other users' private fields

**SP:** 5

---

### BB-101 — Find & Add Friends
**As a** user, **I want to** search for people and send friend requests, **so that** I can build my network.

**AC:**
- Search by exact username returns matching discoverable profiles (self and blocked users excluded)
- "Add friend" creates `/friendRequests/{requestId}` with `fromUid`, `toUid`, and `pending` status
- Sending to an existing friend or with a request already pending is prevented; you cannot friend yourself
- Sender sees the pending state and can cancel an outgoing request
- Outgoing pending requests are rate-limited to deter spam

**SP:** 5

---

### BB-102 — Respond to Friend Requests
**As a** user, **I want to** accept or decline incoming requests, **so that** I control who is in my network.

**AC:**
- Incoming requests list shows the sender's public profile with Accept / Decline actions
- Accept transactionally creates a reciprocal edge for both users (`/users/{uid}/friends/{friendUid}` on each side) and marks the request `accepted` — both edges or neither
- Decline marks the request `declined` and clears it from the list; the sender is not separately notified of a decline
- The recipient receives a push + inbox notification when a request arrives (respects BB-091)
- Accepting an already-accepted request is idempotent

**SP:** 5

---

### BB-103 — Manage Friends (List, Remove, Block)
**As a** user, **I want to** view, remove, and block people, **so that** I manage my connections and safety.

**AC:**
- Friends list shows all connections with profile and tap-through to the public profile
- Remove friend deletes both friendship edges and revokes each side's access to the other's shared content
- Block (stored at `/users/{uid}/blocks/{blockedUid}`) prevents the blocked user from searching, friending, or seeing the blocker's shared sightings
- Friend/aggregate counts remain consistent after removal or block
- A blocked user can be unblocked

**SP:** 3

---

## Epic 11: Social Sightings & Alerts *(Phase 4)*

### BB-110 — Sighting Visibility & Privacy
**As a** user, **I want to** control who can see each sighting I log, **so that** I share useful finds with friends while keeping some private.

> **Depends on the decoupled model (BB-161).** Sightings are first-class
> `/sightings` docs; this story adds the visibility dimension to them.

**AC:**
- Every sighting has a `visibility`: `private` (only me) or `friends` (my accepted, non-blocked friends)
- A user-level default visibility, overridable per sighting at log/edit time
- Security rules: a `/sightings` doc is readable by its `spotterUid` always, and by the spotter's friends when `visibility == 'friends'`; writable only by the spotter
- `private` sightings never surface to others, never appear in the friends' feed (BB-111), and never trigger alerts (BB-112)
- Changing a sighting from `friends` to `private` immediately removes it from others' views
- Location stays limited to store + city/state (no precise geolocation)

**SP:** 5

---

### BB-111 — Friends' Sightings Feed
**As a** user, **I want to** see recent sightings shared by my friends, **so that** I can act on local finds.

**AC:**
- A feed lists friends' shared sightings newest-first: bottle, store, price, city/state, who shared it, and relative time
- Sightings matching a bottle on my **active** Hunt List are highlighted ("On your hunt list")
- Stale sightings (beyond the staleness window) are de-emphasized, with a toggle to hide them
- Tapping a sighting opens its detail; a match offers a shortcut to the corresponding Hunt List entry
- Reads are paginated/limited to control Firestore cost

**SP:** 5

---

### BB-112 — Sighting Match Alerts ★ *(headline feature)*
**As a** user, **I want to** be notified when a friend spots a bottle on my Hunt List, **so that** I can chase it down before it's gone.

**AC:**
- When a `visibility: 'friends'` sighting is created (BB-161/110), a Cloud Function finds the spotter's friends who have the same `bourbonId` on their **active** Hunt List
- Each matched friend who has the alert enabled (BB-091) and has not blocked / been blocked by the spotter receives a push notification with: bottle name, store, price, city/state, and who spotted it
- Tapping the notification deep-links to the sighting and the matching Hunt List entry
- An inbox record (BB-113) is created alongside every push so a missed notification is recoverable
- De-duplication: a given (sighting → recipient) alert is delivered at most once; later price edits do not re-spam beyond a meaningful price-drop threshold
- No alert is sent to the owner, to non-friends, for private sightings, or for sightings back-dated beyond the staleness window

**SP:** 8

---

### BB-113 — Notification Inbox
**As a** user, **I want** an in-app list of my alerts, **so that** I don't lose notifications I missed.

**AC:**
- An inbox lists notifications (sighting matches, friend requests, price alerts) newest-first with read/unread state
- Records are stored at `/users/{uid}/notifications/{notificationId}` and created alongside each push
- Tapping an item deep-links to the relevant screen and marks it read
- An unread count badges the inbox entry point
- Notifications auto-expire (e.g., after 30 days) via a scheduled cleanup function

**SP:** 5

---

## Post-MVP Story Summary (Phases 2 & 4)

| Story ID | Title | Epic | Phase | SP |
|---|---|---|---|---|
| BB-090 | Push Notification Setup (FCM) | Notifications | 2 | 8 |
| BB-091 | Notification Preferences | Notifications | 2 | 3 |
| BB-100 | Public Profile & Username | Social Graph | 4 | 5 |
| BB-101 | Find & Add Friends | Social Graph | 4 | 5 |
| BB-102 | Respond to Friend Requests | Social Graph | 4 | 5 |
| BB-103 | Manage Friends (List, Remove, Block) | Social Graph | 4 | 3 |
| BB-110 | Sighting Visibility & Privacy | Social Sightings | 4 | 5 |
| BB-111 | Friends' Sightings Feed | Social Sightings | 4 | 5 |
| BB-112 | Sighting Match Alerts | Social Sightings | 4 | 8 |
| BB-113 | Notification Inbox | Social Sightings | 4 | 5 |

**Post-MVP Total: 52 SP** (Phase 2: 11 · Phase 4: 41)

---

# Post-MVP User Stories — Going Public (Cost, AI, Monetization & Compliance)

> **Why these exist:** the social features above are built for a small circle on
> Firebase's free tier. Opening the app to the public changes the economics and
> the legal posture. These epics make a public launch *sustainable and safe*.
> See "Going Public: Cost, Monetization & Compliance" in
> [bourbon-buddy-feature-spec.md](bourbon-buddy-feature-spec.md) for the full
> reasoning and unit-economics model. Sequencing lives in the **Post-MVP
> Iteration Roadmap** in [bourbon-buddy-iteration-plan.md](bourbon-buddy-iteration-plan.md).

## Epic 12: Cost Controls & Abuse Prevention

### BB-120 — Billing Budget Alerts & Kill-Switch
**As the** owner, **I want** a hard ceiling on spend, **so that** a bug or abuse can't run up an unbounded Firebase bill.

**AC:**
- A GCP billing budget is configured with alert thresholds (e.g., 50 / 90 / 100%) emailing the owner
- A Pub/Sub-triggered Cloud Function disables project billing at a defined cap (Google's documented "cap usage" pattern), with a written runbook to re-enable
- The documented monthly budget and the degradation behavior when hit are recorded (app should fail to read-only/offline, not silently break)
- Verified against a test billing trigger
- **Built early** (cheap insurance) even though it's a public-launch concern

**SP:** 3

---

### BB-121 — App Check Enforcement
**As the** owner, **I want** only my genuine app to reach my backend, **so that** bots and scrapers can't drive up cost or harvest data.

**AC:**
- App Check enabled with reCAPTCHA (web/PWA) and DeviceCheck / App Attest (when native)
- Enforcement turned on for Firestore, Cloud Functions, and Storage
- Legitimate app traffic is unaffected; unattested requests are rejected
- A debug provider is configured for local dev and CI

**SP:** 5

---

### BB-122 — Read/Write Quotas & Abuse Guards
**As the** owner, **I want** per-user bounds on expensive actions, **so that** one account can't hammer the database or AI.

**AC:**
- Security rules cap unbounded list reads (require `limit()` where feasible)
- Per-user/day soft limits on expensive actions (AI calls, sighting creation) are tracked and enforced server-side
- Abusive patterns are logged and alertable
- Limits are configurable without a redeploy where practical

**SP:** 3

---

## Epic 13: AI Features

### BB-130 — AI "Find Bottles" from Articles
**As a** user, **I want** bottles mentioned in a news article surfaced as one-tap wishlist adds, **so that** I can act on releases I read about.

**AC:**
- Extraction runs server-side **once per article** inside `fetchRssFeeds` (shared + cached), using a low-cost model (Claude Haiku); results are stored on the `/newsArticles` doc as `bottleCandidates` (name, optional distillery, confidence)
- **No per-user AI calls** — every user reads the cached candidates, so cost is O(articles), not O(users × articles)
- On an article, detected bottles render as chips with one-tap "Add to Hunt List" that pre-fills the wishlist form via catalog autocomplete / canonical match (BB-160)
- Extraction failures are non-fatal (the article still ingests); token-limited, Batch API used where latency allows
- Low-confidence candidates are de-emphasized or hidden; candidates dedupe against the catalog

**SP:** 8

---

### BB-131 — AI Usage Guardrails & Bring-Your-Own-Key
**As the** owner, **I want** any *per-user* AI bounded, **so that** users (including friends) can't run up my AI bill.

**AC:**
- Per-user monthly AI credit (free tier N, Pro tier higher) tracked server-side; over-limit prompts an upgrade or BYO key
- Cheapest viable model used, with prompt caching and Batch API where applicable
- Optional "bring your own Claude API key," stored server-side (never plaintext on the client), grants unlimited personal use
- AI spend is logged per feature for the owner
- *Only required once a per-user AI feature exists — BB-130 does not need it*

**SP:** 5

---

## Epic 14: Monetization

### BB-140 — Subscription Infrastructure
**As the** owner, **I want to** sell a Pro subscription, **so that** revenue covers infrastructure at public scale.

**AC:**
- RevenueCat integrated (web now, native-ready); monthly + annual products and a `pro` entitlement defined
- The Pro entitlement is exposed as a signal the app reads to gate features
- Purchases, restores, and cancellations are handled; entitlement state syncs to the user
- Sandbox/test purchases verified end-to-end
- Store fees (Apple/Google 15–30%) and RevenueCat's 1% (over $2.5k MTR) are documented in the revenue model

**SP:** 8

---

### BB-141 — Pro Gating & Paywall
**As a** user, **I want** a clear sense of free vs Pro value, **so that** I understand what I'm paying for.

**AC:**
- A free-vs-Pro matrix is enforced (e.g., free: 10 AI finds/mo, basic stats, limited sighting history; Pro: unlimited AI, price & sighting alerts, advanced stats, full history)
- A paywall screen presents the value prop and a trial (17–32 days, per conversion benchmarks)
- Gated features show an upgrade prompt, never a dead end
- **Core tracking (log, wishlist, sightings) stays free forever**

**SP:** 5

---

## Epic 15: Compliance & Public Launch

### BB-150 — Age Gate & Legal Acceptance
**As the** owner, **I want** age verification and ToS / Privacy acceptance, **so that** the app meets alcohol-app and app-store requirements.

**AC:**
- An age gate (of-age by region, 21+ in the US) appears on first run; the result is recorded on the user doc
- Terms of Service and Privacy Policy are presented; acceptance is recorded with version + timestamp
- App-store alcohol category metadata and content rating are set
- Re-acceptance is prompted when the ToS/Privacy version changes

**SP:** 3

---

### BB-151 — Account Deletion & Data Rights
**As a** user, **I want to** delete my account and export my data, **so that** I control my information (and the app meets store and privacy-law requirements).

**AC:**
- In-app "Delete my account" removes the Auth user and all owned Firestore + Storage data via a Cloud Function fan-out
- Deletion cascades social edges (friends, friend requests, shared sightings) and revokes FCM tokens
- Data export is available on request (reuses the CSV export)
- A confirmation flow prevents accidental deletion
- Completion is logged for compliance evidence

**SP:** 5

---

## Epic 16: Data Quality

### BB-160 — Bourbon Catalog Canonicalization
**As the** owner, **I want** one canonical catalog entry per real bottle, **so that** social matching and statistics are accurate.

**AC:**
- Catalog writes normalize the name (trim/case/punctuation) and store `nameLowercase` + optional `aliases`
- New-entry creation matches against existing canonical names/aliases to avoid duplicates
- An admin/maintenance path merges duplicate catalog docs and repoints references
- Sighting Match (BB-112) and stats group on the canonical `bourbonId`
- Improves stats grouping immediately, independent of social
- **Hard prerequisite for BB-161** — sighting↔wishlist matching by `bourbonId` is meaningless if one bottle has duplicate catalog docs

**SP:** 5

---

## Epic 17: Sightings Decoupling *(Iteration 8 — prerequisite for social sightings)*

> **Why:** MVP sightings live *under a wishlist entry*, so you can only log one
> for a bottle already on your own list. That blocks crowd-sourcing — you can't
> report a bottle you spot *for a friend*. These stories make sightings
> first-class, catalog-keyed records, decoupled from the wishlist. They must land
> **before** the social-sightings iteration (BB-110/111/112), which assumed the
> old coupled model.

### BB-161 — Decouple Sightings to First-Class, Catalog-Keyed Records
**As a** user, **I want** sightings stored as standalone observations about a catalog bottle (not buried under my wishlist), **so that** any spotter can report any bottle and any hunter sees the relevant sightings.

**AC:**
- Sightings move to a top-level `/sightings/{id}` keyed by `bourbonId`, with `spotterUid`, store, price, city/state, date, `markedStaleManually`, `visibility`, `createdAt`
- A wishlist entry's sightings become a **query** by `bourbonId` (own + permitted others'), not a stored subcollection
- `bestSightingPrice` recomputes from the viewer-visible, non-stale sightings for that `bourbonId` when a matching sighting changes
- Staleness unchanged (`markedStaleManually || date > 30 days`), computed on read
- The price-alert trigger (Iteration 7) is repointed from the old subcollection path to `/sightings`
- Existing `/users/{uid}/wishlistEntries/{entryId}/sightings` docs are migrated (one-time): `spotterUid = uid`, `visibility = 'private'`, `bourbonId` from the parent entry
- Requires canonical `bourbonId` (BB-160)

**SP:** 8

### BB-162 — "Spotted It" Standalone Capture
**As a** user, **I want to** log a sighting for any bottle I see — even one not on my Hunt List — **so that** I can report finds for myself or my friends.

**AC:**
- A global "Spotted it" action (FAB / quick-add) opens a sighting form: search the shared catalog (or add a new bottle), then store, price, city/state, date
- The sighting saves to `/sightings` under the chosen `bourbonId`, regardless of whether it's on the spotter's Hunt List
- If it *is* on the spotter's Hunt List, it reflects there immediately
- At log time, surface "🎯 \<friend\> is hunting this" when a connected friend wants it (contribution nudge) — *active once the social graph exists*
- Designed for minimal friction; barcode scan + geolocation (Phase 2) make capture near-instant
- Honest dependency: crowd-sourcing only pays off if logging is fast and people see that it helps friends

**SP:** 5

### BB-163 — Sighting Abuse & Fan-out Controls
**As the** owner, **I want** sighting creation and the alerts it triggers to be rate-limited, validated, and dedup'd, **so that** one careless or malicious user can't spam friends, poison prices, bloat the DB, or run up cost.

> **The threat:** decoupled sightings let anyone log anything. Worst cases: a user
> logs every bottle in a store (notification storm + DB writes + function fan-out
> cost); a troll posts fake low prices to grief friends; a bot mass-creates fake
> sightings/catalog bottles. Protect the **app, DB, users, and the bill**. Splits
> across two iterations — creation guards ship with the decouple (It8), fan-out
> guards ship with social sightings (It10).

**AC — creation-side (Iteration 8, with BB-161/162):**
- Per-user sighting rate limit (e.g. ≤ N/day + a short cooldown), enforced server-side via a counter; over-limit writes are rejected
- Input validation in security rules + function: price within sane bounds (> 0, below an absurd ceiling), store/city/state length caps, required fields
- Creating a **new catalog bottle** from "Spotted it" is rate-limited and dedup'd against the canonical catalog (BB-160) to block catalog spam
- App Check (BB-121) required on sighting/catalog writes so bots can't hit the endpoint directly
- A scheduled cleanup purges sightings well past the staleness window so the `/sightings` collection stays bounded

**AC — fan-out-side (Iteration 10, with BB-110/112):**
- Per-spotter cap on alerts generated per day; per-recipient cap on alerts from one spotter per window (anti-harassment)
- Bulk logging **coalesces**: several sightings to the same recipient in a short window batch into one push ("Daniel spotted 3 bottles on your list at Total Wine") instead of N pushes
- (sighting → recipient) dedup; price edits don't re-alert beyond a meaningful drop
- Users can **flag** a sighting as inaccurate; auto-hide after K flags; repeat-offender spotters are throttled/suppressed
- Friends-only visibility bounds blast radius to your circle; the billing kill-switch (BB-120) is the hard backstop

**SP:** 8

---

## Post-MVP Story Summary — Going Public

| Story ID | Title | Epic | SP |
|---|---|---|---|
| BB-120 | Billing Budget Alerts & Kill-Switch | Cost Controls | 3 |
| BB-121 | App Check Enforcement | Cost Controls | 5 |
| BB-122 | Read/Write Quotas & Abuse Guards | Cost Controls | 3 |
| BB-130 | AI "Find Bottles" from Articles | AI Features | 8 |
| BB-131 | AI Usage Guardrails & BYO Key | AI Features | 5 |
| BB-140 | Subscription Infrastructure | Monetization | 8 |
| BB-141 | Pro Gating & Paywall | Monetization | 5 |
| BB-150 | Age Gate & Legal Acceptance | Compliance | 3 |
| BB-151 | Account Deletion & Data Rights | Compliance | 5 |
| BB-160 | Bourbon Catalog Canonicalization | Data Quality | 5 |
| BB-161 | Decouple Sightings (First-Class, Catalog-Keyed) | Sightings Decoupling | 8 |
| BB-162 | "Spotted It" Standalone Capture | Sightings Decoupling | 5 |
| BB-163 | Sighting Abuse & Fan-out Controls | Sightings Decoupling | 8 |

**Going-Public + Foundations Total: 71 SP** · **Grand Post-MVP Total: 123 SP**
(BB-110 reduced 8→5 with the decoupled model; +18 net for the sightings
foundation incl. abuse controls.)

---

# Active Post-Social Roadmap (Epics 12–15)

> Agreed 2026-07-05. Iteration-scoped in
> [bourbon-buddy-iteration-plan.md](bourbon-buddy-iteration-plan.md) under
> **Active Roadmap (R1–R4)**. These build on the completed social/sightings
> foundation (BB-100–BB-113, BB-160–BB-163).

## Epic 12: Header & Sighting Hygiene *(Post-Social)*

### BB-170 — Declutter Cellar & Hunt List Headers ✅ *(shipped 2026-07-05)*
**As a** user, **I want** the Cellar and Hunt List title bars uncluttered, **so that** the action icons have room and I rely on the highlighted tab to know where I am.

**AC:**
- Cellar and Hunt List no longer render an `<ion-title>` text label
- **Cellar:** Filter + Sort on the left (`slot="start"`); alert bell + profile stay on the right
- **Hunt List:** Filter + Sort on the left; a single Sighting action (add icon + "Sighting" label) on the right, always visible (not gated on list length)
- Filter/Sort only render when the list is non-empty
- Placeholder left for a future Bigfoot SVG on the Sighting button (swap `name` → `[src]`)

**SP:** 3

---

### BB-171 — Sighting Freshness Tiers (Fresh / Aging / Stale)
**As a** user, **I want** sightings to age out on a realistic timeline with an in-between "aging" state, **so that** I can tell an almost-certainly-still-there find from a probably-gone one.

**AC:**
- Freshness computed on read (never stored), three tiers by sighting age:
  - **Fresh** — ≤ 15 days
  - **Aging** — > 15 and ≤ 30 days — shown with a soft "may be getting old" treatment, still visible/usable
  - **Stale** — > 30 days OR `markedStaleManually` — de-emphasized and eligible for cleanup
- New `sightingFreshness(s)` pure util returns `'fresh' | 'aging' | 'stale'`; `isSightingStale` retained as a thin wrapper (no caller breakage)
- `bestNonStalePrice` continues to exclude `aging`? **No** — aging sightings still count as valid prices; only `stale` is excluded
- Server `cleanupStaleSightings` hard-deletes at **30 days** (was 90)
- Aging tier surfaced on the Hunt List detail and Friends' Feed sighting rows
- Unit tests cover the 15-day and 30-day boundaries (TDD)
- **Supersedes** the "> 60 days" de-emphasis in BB-041 and the 30/90-day notes in the data model & CLAUDE.md; those docs updated to match

**SP:** 3

---

### BB-172 — News & AI Extraction Cadence Tuning
**As a** user, **I want** fresher news and faster bottle extraction, **so that** chips appear soon after articles arrive.

**AC:**
- `fetchRssFeeds` schedule: every 12h → **every 6h**
- `sweepArticleBottles` schedule: every 2h → **every 30 min**
- Per-call pacing (`BACKFILL_SPACING_MS`) retained so a backlog burst stays under Groq's 6k TPM cap
- Confirmed to remain within Groq free tier (steady-state ≪ 14.4k RPD / 500k TPD) and Firebase Blaze free allowances; the only cost is the pre-existing ~$0.20/mo for >3 Cloud Scheduler jobs (unchanged by cadence)

**SP:** 1

---

## Epic 13: Fast Sighting Capture *(Post-Social)*

### BB-173 — Contextual Floating Action Menu
**As a** user, **I want** the page FAB to fan out into context-aware actions, **so that** logging a sighting is one tap from the Cellar or Hunt List.

**AC:**
- Cellar/Hunt List FAB becomes an `ion-fab` speed-dial (`ion-fab-list`)
- **Cellar** actions: "Add bottle" + "Log sighting"
- **Hunt List** actions: "Add to Hunt" + "Log sighting"
- "Log sighting" routes to the standalone capture (`/spotted/new`) and is the primary sighting entry point (Hunt List header button becomes a secondary path)
- Existing single-purpose FAB behavior preserved as the default/primary action

**SP:** 3

---

### BB-174 — Barcode Scan Capture
**As a** user, **I want** to scan a bottle's barcode with my camera, **so that** I can start a sighting or entry without typing.

**AC:**
- `core` BarcodeScannerService wraps the browser-native `BarcodeDetector` API with a `@zxing/browser` fallback (iOS Safari)
- Camera modal with live preview, torch toggle where supported, and a clear "enter manually" fallback
- Decodes UPC-A / EAN-13; returns the raw code to the caller
- Graceful handling of denied camera permission, no camera, and no detection (timeout → manual entry)
- Works over HTTPS PWA; no native shell required

**SP:** 5

---

### BB-175 — Crowdsourced UPC → Catalog Index
**As a** user, **I want** scanned barcodes to resolve to catalog bottles, **so that** scanning gets faster for everyone over time.

**AC:**
- `/bourbons` gains a `upc: string[]` field (indexed for lookup)
- A scanned code first queries the catalog by UPC; a hit prefills the bottle
- A miss prompts the user to pick/create the bottle (reusing `findOrCreate`), then stores the UPC on that catalog doc for future scans
- No paid third-party UPC API; the index is built from user confirmations
- Security rules allow appending a UPC to an existing catalog doc under the same constraints as other catalog edits

**SP:** 3

---

### BB-176 — Scan-to-Sighting & Quick-Add Wiring
**As a** user, **I want** a scan to drop me into a prefilled sighting (or cellar add), **so that** capture is near-instant.

**AC:**
- "Log sighting" in the FAB menu (BB-173) can launch the scanner (BB-174)
- A resolved bottle (BB-175) prefills the sighting form (name, distillery, category, `bourbonId`)
- Optional: scanner reachable from the Cellar "Add bottle" action for quick-add
- Unknown code still lands the user in a usable manual form, not a dead end

**SP:** 2

---

## Epic 14: Geo Sightings & Proximity Alerts *(Post-Social)*

### BB-177 — Sighting Location Capture (opt-in)
**As a** user, **I want** my sightings to record where I am, **so that** proximity features and a map can work — without exposing my exact position.

**AC:**
- Opt-in capture of device coordinates (browser Geolocation API) at spot-time; `lat`, `lng`, and a `geohash` stored on the sighting
- Skipping location is always allowed; sighting still saves with store/city/state only
- Precise coordinates are used **server-side only**; other users see approximate info (store/city), never raw coords
- Privacy copy explains what's captured and why

**SP:** 3

---

### BB-183 — Auto-fill City / State from Location
**As a** user logging a sighting, **I want** the City and State fields pre-filled from my location, **so that** I don't have to type them (a common ask surfaced while testing the barcode scanner).

**Context:** reuses the coordinates captured in BB-177. Reverse-geocoding
(coords → city/state) can be done with a **free, key-less, CORS-enabled client
API** (e.g. BigDataCloud's reverse-geocode-client) — no paid Google/Mapbox
dependency, keeping it within the free-tier philosophy. Nominatim/OSM is a
fallback but its usage policy is stricter.

**AC:**
- When location is granted (BB-177), reverse-geocode the coordinates and pre-fill the sighting's City and State
- Fields remain **editable** — auto-fill is a convenience, never a lock
- Fully degrades: no permission / offline / lookup failure → fields simply stay blank, no error surfaced
- No paid geocoding service; stays within free tier
- Depends on **BB-177** (needs the captured coordinates)

**SP:** 2

---

### BB-178 — Alert Radius & Base Location Preference
**As a** user, **I want** to set a home area and a max alert distance, **so that** I'm only notified about finds near me.

**AC:**
- Profile gains an opt-in base location (coords) and `alertRadiusMiles` setting (sensible default, e.g. 30)
- Setting is editable and clearable from Settings
- Stored on `/users/{uid}`; used only by alert matching

**SP:** 2

---

### BB-179 — Nearby Sightings Map View
**As a** user, **I want** a map of recent nearby sightings, **so that** I can plan a run to grab a bottle.

**AC:**
- Map view plots non-stale sightings that have coordinates, within the user's radius
- Markers show store/bottle/price; stale (BB-171) sightings excluded
- Tapping a marker opens the sighting detail
- Reads use the shared sightings listener/geohash query; no per-marker fetch fan-out

**SP:** 5

---

### BB-180 — Proximity-Filtered Match Alerts
**As a** user, **I want** Hunt List match alerts limited to my radius, **so that** notifications stay relevant.

**AC:**
- Extends BB-112: when a new sighting matches a friend's Hunt List, the alert function computes haversine distance between the sighting and the recipient's base location
- Sightings outside the recipient's `alertRadiusMiles` are silently dropped (no push, no inbox record)
- Recipients without a base location fall back to current (non-geo) behavior
- Distance calc runs server-side only

**SP:** 3

---

## Epic 15: Palate & Reliability *(Post-Social — last iteration before backlog)*

### BB-181 — Structured Flavor Profile
**As a** user, **I want** to capture nose/palate/finish with a structured flavor picker, **so that** my notes are consistent and can later power recommendations.

**AC:**
- Structured flavor tags (nose / palate / finish) selectable on a log entry, alongside free-text notes
- Backed by the reference flavor-tag data; stored on the log entry
- Displayed on the entry detail
- Data shaped so a future "bottles like this" recommendation can consume it

**SP:** 5

---

### BB-182 — Offline-First Sighting Capture
**As a** user, **I want** to log a sighting with no signal and have it sync later, **so that** poor in-store connectivity never loses a find.

**AC:**
- Sighting capture works offline: the entry is queued locally and syncs when connectivity returns (Firestore offline persistence and/or an explicit outbox)
- UI reflects pending/synced state to the user
- No duplicate sightings on reconnect
- Scoped to the sighting path (broader offline support remains backlog)

**SP:** 5

---

# Backlog (Not Yet Iteration-Scoped)

### BB-190 — News Full-Text Search (Algolia)
**As a** user, **I want to** search the entire news archive, **so that** I can find any article, not just the pages I've already scrolled.

**Context:** the Dispatch feed has cursor pagination + client-side search over
loaded articles (good for browsing). True "find that one article from weeks ago"
needs a hosted full-text index. Chosen direction: **Algolia** (best DX, the
official Firebase "Search with Algolia" extension auto-syncs a collection, and
the rolling ~90-day shared `newsArticles` corpus should fit the free tier).
Typesense is the cheaper-at-scale alternative if Algolia costs grow.

**AC:**
- `newsArticles` is synced to an Algolia index on add (`fetchRssFeeds`) and on
  delete (cleanup functions) — via the Firebase extension or a small Cloud Function
- Dispatch search queries the index for full-text matches (headline, source,
  excerpt) across **all** stored articles, not just loaded pages
- Results respect article-state filtering (read/saved/dismissed) and open like
  feed articles
- Stays within Algolia's free tier for the shared corpus; usage monitored
- Falls back to the current client-side search if the index is unavailable

**SP:** 5

---

### BB-191 — Bottle Fill-Level & Pour Tracking
**As a** user, **I want to** track how much is left in an open bottle and log pours against it, **so that** I know what I'm running low on.

**Context:** partly covered already by **BB-020 (Pour Session Log)**, whose AC
includes an editable "bottle remaining percentage." This backlog item is the
explicit extension — fill-level as a first-class, glanceable attribute on the
Cellar list, "kill bottle" action, and low-stock surfacing — to be scoped as an
extension of BB-020 rather than a parallel feature.

**AC (draft):**
- Fill level visible on the Cellar list, not just the detail screen
- "Mark open" / "Kill bottle" quick actions
- Optional low-stock indicator/sort
- Reuses BB-020's pour subcollection; no schema fork

**SP:** TBD *(backlog)*

---

### Gamification — Palate Badges, Distillery Passport, "Bourbon Wrapped"
Top of the backlog to pick up after the Active Roadmap. Already scoped at a high
level under **Phase 5 — Gamification** in
[bourbon-buddy-iteration-plan.md](bourbon-buddy-iteration-plan.md). Needs its own
story breakdown (badge catalog, unlock rules, passport data model, shareable
stats card) when promoted out of the backlog.
