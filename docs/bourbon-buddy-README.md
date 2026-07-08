# Bourbon Buddy — Project Overview & Claude Code Context

**Version:** 1.1
**Last Updated:** 2026-06-24
**Status:** Pre-development — planning complete, Iteration 0 not yet started

---

## What Is Bourbon Buddy?

Bourbon Buddy is a mobile-first personal bourbon and whiskey tracking app for enthusiasts. Think Untappd, but purpose-built for bourbon. The MVP is a single-user personal tool. Future versions will add social, community, and web features.

**Primary use context:** The user is most often using this app while out — in a bottle shop, at a bar or pub, or at a tasting event. They are away from a computer nearly every time they use the app. Mobile is not an afterthought; it is the entire point.

The app allows a user to:
1. **Log every bourbon they've tried** — structured tasting notes, ratings, purchase details, label photos
2. **Maintain a wishlist** — bourbons to try, with research notes, reviews, and price sightings
3. **Track bottle sightings** — where they found a bottle and at what price
4. **Stay informed via a curated news feed** — personalized bourbon/whiskey news
5. **View personal statistics and insights** — preference curves, value scores, activity trends

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend / Mobile | Ionic with Angular | Mobile-first PWA for MVP; Capacitor native builds are a later milestone |
| Auth | Firebase Authentication | Email/password, Google, Apple, Facebook sign-in |
| Database | Cloud Firestore | Primary data store |
| File Storage | Firebase Storage | Label photos |
| Backend Logic | Firebase Cloud Functions | Scheduled jobs, API integrations, business logic that must run server-side |
| News Feed Fetching | Firebase Cloud Functions (scheduled) | Every 12 hours via Cloud Scheduler; Blaze plan required |
| Hosting | Firebase Hosting | PWA deployment |
| Push Notifications | Firebase Cloud Messaging (FCM) | Wired in later; not MVP scope |
| AI Feature | Backlogged | "Find Bottles" from articles is a nice-to-have, not MVP |

### PWA Strategy
The app ships as a Progressive Web App (PWA) for the entire MVP and personal-use phase. Capacitor-based native iOS builds and App Store submission are a milestone that comes after all MVP features are complete. Android follows after iOS native. A web-facing website for broader public use is a separate, later phase beyond single-user MVP.

### Firebase Plan
Blaze (pay-as-you-go) plan required for scheduled Cloud Functions (news feed fetching). All other MVP usage will remain within or near free tier limits for a single user.

---

## Documentation Files

Read all four companion files before starting any development work.

| File | Purpose |
|---|---|
| `bourbon-buddy-feature-spec.md` | Full product feature specification — every feature, field, behavior, and business rule |
| `bourbon-buddy-data-model.md` | Complete Firestore data model — collections, document schemas, and query patterns |
| `bourbon-buddy-user-stories.md` | Agile user stories with acceptance criteria and story point estimates |
| `bourbon-buddy-iteration-plan.md` | Sprint-by-sprint plan with goals, story assignments, and definitions of done |

---

## Project Structure (Recommended)

```
bourbon-buddy/
├── src/
│   ├── app/
│   │   ├── core/                  # Singleton services, guards, interceptors
│   │   │   ├── auth/
│   │   │   ├── services/
│   │   │   └── guards/
│   │   ├── shared/                # Shared components, pipes, directives
│   │   │   ├── components/
│   │   │   └── pipes/
│   │   ├── features/              # Feature modules (lazy-loaded)
│   │   │   ├── log/
│   │   │   ├── wishlist/
│   │   │   ├── news/
│   │   │   ├── stats/
│   │   │   └── search/
│   │   ├── models/                # TypeScript interfaces matching Firestore schemas
│   │   └── app.module.ts
│   ├── assets/
│   ├── environments/
│   │   ├── environment.ts         # Dev Firebase config
│   │   └── environment.prod.ts    # Prod Firebase config
│   └── theme/                     # Ionic/CSS variables, global styles
├── functions/                     # Firebase Cloud Functions
│   ├── src/
│   │   ├── news/                  # RSS fetch + scheduled job
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
└── package.json
```

---

## Key Business Logic Rules

**Value Score**
`(rating / 5) × 100 / purchase_price`. Only shown when both rating and price exist. Stored as a field on the log entry document (denormalized) so it can be sorted on without a computed query.

**Bottle Sighting Staleness** (BB-171)
Freshness has three tiers, computed on read from `sightingDate`, never stored: `fresh` (≤15 days), `aging` (15–30 days), `stale` (`markedStaleManually` or >30 days). Stale sightings remain visible but are visually de-emphasized. A weekly Cloud Function (`cleanupStaleSightings`) deletes sightings older than 30 days.

**Wishlist → Log Conversion**
"Found It — Log It" opens the Add Log Entry form pre-filled from the wishlist entry. On save, the wishlist entry gains `status: 'logged'` and is hidden from the active wishlist (archived, not deleted).

**Bourbon Catalog**
The `bourbons` collection is a shared reference catalog. When a user creates a log or wishlist entry with a bottle name not found in the catalog, a new catalog document is created. This catalog grows over time and benefits all users in future social phases.

**News Feed Refresh**
Cloud Function runs on a schedule twice daily (every 12 hours). Articles are deduplicated by URL before write. The frontend reads from Firestore — it never calls external RSS sources directly.

---

## Firebase / Firestore Conventions

- All document IDs are auto-generated by Firestore unless otherwise noted
- All timestamps use Firestore `Timestamp` type (not plain JS Date or string)
- User-scoped data lives at paths like `/users/{userId}/logEntries/{entryId}` (subcollections)
- Shared/catalog data lives at top-level collections like `/bourbons/{bourbonId}`, `/newsArticles/{articleId}`
- Firestore Security Rules enforce that users can only read/write their own subcollection data
- Cloud Functions run in Node.js 20 with TypeScript

## Firestore Security Rules Summary
- `/users/{userId}/**` — authenticated user can read/write only their own documents
- `/bourbons/**` — any authenticated user can read; any authenticated user can create; only creator can update their own additions
- `/newsArticles/**` — any authenticated user can read; only Cloud Functions (admin SDK) can write
- `/userNewsPreferences/{userId}` — user can read/write their own document only

---

## Development Conventions

- **Branching:** feature branches off `main`, named `feature/BB-XXX-short-description`
- **Commits:** Conventional commits — `feat(BB-010): add log entry form`
- **Angular modules:** Lazy-loaded feature modules per major section (Log, Wishlist, News, Stats)
- **State management:** Angular services with RxJS BehaviorSubjects for MVP; NgRx if complexity demands it later
- **Environment config:** Firebase project config in `environment.ts` / `environment.prod.ts`; never hardcode keys
- **Offline (MVP):** Online required. Firestore offline persistence is a post-MVP enhancement.

---

## Environments

Two Firebase projects: one for development/staging, one for production.

```
environments/
  environment.ts       → Firebase dev project config
  environment.prod.ts  → Firebase prod project config
```

All Firebase config values (apiKey, projectId, etc.) stored in environment files, not hardcoded anywhere else.
