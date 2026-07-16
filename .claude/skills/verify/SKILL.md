---
name: verify
description: Build, launch, and drive Bourbon Buddy locally against the Firebase emulators to verify a change at the UI surface.
---

# Verifying Bourbon Buddy changes in the running app

Recipe that works (cold-started 2026-07, BB-215):

1. **Emulators** (background): `PATH=/usr/local/opt/openjdk/bin:$PATH npx firebase emulators:start --only auth,firestore,storage`
   (Auth 9099, Firestore 8080, Storage 9199. Skip functions unless the change
   needs them — avoids the access-gating triggers and a functions build.)
2. **Flip the flag**: set `useEmulators: true` in
   `src/environments/environment.ts`. **Revert it before committing.**
3. **Dev server** (background): `npx ng serve --port 4299`
4. **Approved test user**: signups are gated (BB-210/211, `approved` custom
   claim). Mint one directly with firebase-admin (available at
   `functions/node_modules/firebase-admin`) with
   `FIREBASE_AUTH_EMULATOR_HOST=localhost:9099`: `createUser({email, password,
   emailVerified: true})` + `setCustomUserClaims(uid, {approved: true})`, plus
   a minimal `users/{uid}` profile doc via the Firestore emulator.
5. **Drive with playwright-core + system-less Chromium**: no Chrome installed
   on this Mac (only Firefox). Install `playwright-core` in the scratchpad and
   `PLAYWRIGHT_BROWSERS_PATH=<scratchpad>/.pw-browsers npx playwright-core
   install chromium`. Use viewport ~420×900 (mobile-first app).

Gotchas:

- Login: fill `ion-input[formcontrolname="email"] input` (the inner native
  input), submit via `ion-button[type="submit"]`, wait for URL `/tabs`.
- Ionic `action-sheet` selects: click the `ion-select`, then
  `ion-action-sheet button:has-text("<option label>")`; allow ~600ms to
  dismiss/re-render.
- Detail pages show a one-time onboarding tip overlay — dismiss with
  `ion-button:has-text("Got it")` before screenshotting.
- Console shows repeated 403s + `requestStorageAccess` errors against the
  emulators (App Check/reCAPTCHA noise) — pre-existing, not a finding.
- Icon-only toolbar buttons: Ionic moves `aria-label` off the `ion-button`
  host, so select via `ion-button:has(ion-icon[name="..."])` — and click the
  button, not the inner icon (the button intercepts pointer events).
- A fresh user gets the first-run tour overlay on the tabs; dismiss with the
  "Skip" button before tapping anything.
- Stacked ion-modals: `modalCtrl.dismiss()` targets the TOP overlay; after a
  child sheet closes, wait for `onDidDismiss` (not `onWillDismiss`) before
  dismissing the parent, or you dismiss the wrong one.
- Teardown: `pkill -f "ng serve --port"` and `pkill -f "emulators:start"`,
  and revert `useEmulators`.
