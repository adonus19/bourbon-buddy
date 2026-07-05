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
- **Templates use Angular built-in control flow** (`@if` / `@for` / `@switch`), not
  `*ngIf` / `*ngFor`. Angular 20 idiom; keep new templates consistent.
- `src/app/core/` — singleton services, guards, auth. `src/app/shared/` — reusable
  components (SharedModule), pipes, constants. `src/app/features/` — lazy feature
  modules. `src/app/models/` — TS interfaces matching Firestore (import from the
  `models` barrel).
- **Feature dirs/routes use the product vocabulary from the UI/UX brief**, not the
  data-model nouns: `cellar` (log), `hunt-list` (wishlist), `dispatch` (news),
  `numbers` (stats), `search`. Firestore collections keep their original names
  (`logEntries`, `wishlistEntries`, `newsArticles`). Auth pages live under
  `features/auth/{login,register,forgot-password}`.
- Routing: `/login`, `/register`, `/forgot-password` (publicOnlyGuard) and `/tabs`
  (authGuard) with the 5 tab children. See [app-routing.module.ts](src/app/app-routing.module.ts).
- AngularFire is wired in [src/app/app.module.ts](src/app/app.module.ts) via
  `provideFirebaseApp/provideAuth/provideFirestore/provideStorage/provideFunctions`.
  Toggle `useEmulators` in [src/environments/environment.ts](src/environments/environment.ts).
- State: signal-based **state-holder services**. A singleton service opens each
  Firebase listener once and exposes the data as a readonly `Signal`; components
  consume the signal and never open their own listeners.

## Firebase call discipline (cost control — read before touching data code)
- **One listener per concern, shared.** `AuthService` holds the single shared
  `onAuthStateChanged` listener (`currentUser$` via `shareReplay({refCount:false})`)
  and the single profile-doc listener (`switchMap` swaps it per user). Components
  read `authService.currentUser()` / `authService.profile()` signals.
- **Never call Firestore inside `computed()` or `effect()`.** Those re-run on
  dependency changes and would multiply reads/writes. Derive from already-loaded
  signals; do reads/writes in explicit methods or one-time `switchMap` streams.
- Prefer one realtime listener over repeated one-shot `getDoc`/`getDocs` polling;
  use `toSignal` to expose a stream as a signal in the holder service.
- Avoid god components: extract presentational sub-components (e.g. avatar upload,
  card, rating widget) rather than growing one page component.

## Angular conventions
- Angular **20.3** + Ionic 8. `@Injectable({providedIn:'root'})` and **Reactive
  Forms** (NOT `@Service()` / Signal Forms — those are v21+).
- The **angular-developer** skill (`.agents/skills/angular-developer`) is the
  best-practice reference; consult its `references/` for signals, DI, routing, etc.
- Scaffold with the Angular CLI (`ng generate ...`) for consistency; run
  `ng build` after generating code.

## Key rules (see README for full list)
- **Value Score** = `(rating/5)*100/purchasePrice`; stored on the log entry, only
  when both rating and price exist.
- **Sighting freshness** (BB-171): three tiers computed on read, never stored —
  `fresh` (≤15d), `aging` (15–30d), `stale` (`markedStaleManually || >30d`).
  `sightingFreshness()` in [sighting.ts](src/app/shared/utils/sighting.ts);
  `isSightingStale` = the stale tier. Server drops stale sightings at 30 days.
- **Bourbon catalog** (`/bourbons`) is shared; created on first use of a new name.
- Timestamps use Firestore `Timestamp`, never JS Date/string.
- **Design system** lives in [src/theme/variables.scss](src/theme/variables.scss)
  (tokens + Ionic var mapping) and global utilities in
  [src/global.scss](src/global.scss) (`.glass-surface`, `.glass-modal`, `.eyebrow`).
  App is always dark — no OS dark-mode palette. Full spec:
  [docs/bourbon-buddy-ui-ux-brief.md](docs/bourbon-buddy-ui-ux-brief.md).
- **Category accent overrides** (deviates from the brief, intentionally): Rye is
  green (`--color-cat-rye`, real-world green-label convention) and Irish is burgundy
  (`--color-cat-irish`, Redbreast) to avoid a green-on-green clash. See
  [category-display.ts](src/app/shared/constants/category-display.ts).

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
