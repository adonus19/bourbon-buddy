# Bourbon Buddy — Claude Code Working Notes

Mobile-first PWA for tracking bourbon/whiskey. **Ionic 8 + Angular 20** frontend,
**Firebase** backend (Auth, Firestore, Storage, Cloud Functions). Single-user MVP.

## Source of truth
Full specs live in [docs/](docs/). Read these before non-trivial work:
- [docs/bourbon-buddy-README.md](docs/bourbon-buddy-README.md) — overview, conventions
- [docs/bourbon-buddy-feature-spec.md](docs/bourbon-buddy-feature-spec.md) — every feature/field/rule
- [docs/bourbon-buddy-data-model.md](docs/bourbon-buddy-data-model.md) — Firestore schemas + queries
- [docs/bourbon-buddy-user-stories.md](docs/bourbon-buddy-user-stories.md) — stories + acceptance criteria
- [docs/bourbon-buddy-iteration-plan.md](docs/bourbon-buddy-iteration-plan.md) — sprint plan / DoD

## Architecture
- **NgModules with lazy-loaded feature modules** (not standalone) — deliberate choice.
- `src/app/core/` — singleton services, guards, auth. `src/app/shared/` — reusable
  components, pipes, constants. `src/app/features/` — lazy feature modules
  (log, wishlist, news, stats, search). `src/app/models/` — TS interfaces matching
  Firestore (import from `models` barrel).
- AngularFire is wired in [src/app/app.module.ts](src/app/app.module.ts) via
  `provideFirebaseApp/provideAuth/provideFirestore/provideStorage/provideFunctions`.
  Toggle `useEmulators` in [src/environments/environment.ts](src/environments/environment.ts).
- State: Angular services + RxJS BehaviorSubjects (NgRx only if complexity demands).

## Key rules (see README for full list)
- **Value Score** = `(rating/5)*100/purchasePrice`; stored on the log entry, only
  when both rating and price exist.
- **Sighting staleness**: stale if `markedStaleManually || sightingDate > 60 days`;
  computed on read, never stored.
- **Bourbon catalog** (`/bourbons`) is shared; created on first use of a new name.
- Timestamps use Firestore `Timestamp`, never JS Date/string.

## Commands
- `npm start` — dev server (`ng serve`)
- `npm run build:prod` — production build to `www/`
- `npm run emulators` — Firebase Emulator Suite (Auth 9099, Firestore 8080,
  Storage 9199, Functions 5001, UI on). Set `useEmulators: true` to use them.
- `npm run deploy:hosting` / `:rules` / `:indexes` / `:functions`
- Functions: `cd functions && npm run build` (TypeScript → `lib/`, Node 20)

## Conventions
- Branches: `feature/BB-XXX-short-description` off `main`.
- Commits: conventional, e.g. `feat(BB-010): add log entry form`.
- Firebase project aliases (`.firebaserc`): `dev` = bourbonbuddy-dev (default),
  `prod` = bourbon-buddy-prod (not created yet).
- Test Security Rules / Functions against the emulator before deploying.
