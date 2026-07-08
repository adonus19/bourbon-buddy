# App Check Setup (BB-121)

App Check proves that requests to Firestore, Storage, and Cloud Functions come
from the real Bourbon Buddy web app, not a script replaying our (public)
Firebase config. The code is already wired on both sides:

- **Client** ([app.module.ts](../src/app/app.module.ts)): `provideAppCheck` with
  reCAPTCHA v3, activated only when `environment.recaptchaSiteKey` is non-empty.
- **Functions** (`ENFORCE_APP_CHECK` in
  [functions/src/shared/guards.ts](../functions/src/shared/guards.ts)): every
  callable carries `enforceAppCheck: true`.

**Order matters.** Deploying the functions before the client is configured and
shipped will reject every callable request from the app. Follow the steps in
order; each is safe on its own.

## 1. Register the app (console)

1. Firebase Console → **App Check** → **Apps** → select the web app.
2. Choose **reCAPTCHA v3** as the attestation provider. The flow creates a
   reCAPTCHA site key (or use an existing one from
   https://www.google.com/recaptcha/admin).
3. Copy the **site key**.

## 2. Configure and ship the client

1. Paste the site key into `recaptchaSiteKey` in
   `src/environments/environment.ts` (and `environment.prod.ts` once the prod
   project exists).
2. **Local dev:** run the app once; the SDK logs an `App Check debug token` in
   the browser console. Register it under App Check → Apps → **Manage debug
   tokens**. Without this, local dev against the live project gets rejected
   once enforcement is on. (The emulator suite ignores App Check.)
3. Deploy hosting: `npm run deploy:hosting`.

## 3. Watch metrics, then enforce

1. In App Check → **APIs**, watch the request metrics for a day or two:
   "verified" should approach 100% once every device has picked up the new
   deploy (remember the PWA shell updates on second launch).
2. Deploy the functions: `npm run deploy:functions` — callables now reject
   unattested traffic (`ENFORCE_APP_CHECK`).
3. In the console, click **Enforce** for **Cloud Firestore** and **Cloud
   Storage** as well. (Those are console toggles, not code.) This closes the
   direct-SDK path to the database, which rules alone can't fully close for
   cost abuse.

## Rollback

- Callables: set `ENFORCE_APP_CHECK = false` in
  `functions/src/shared/guards.ts` and redeploy functions.
- Firestore/Storage: turn off enforcement in the console (instant).
- Client: an empty `recaptchaSiteKey` disables App Check init entirely.
