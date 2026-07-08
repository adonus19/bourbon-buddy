// Production BUILD environment. The dedicated bourbon-buddy-prod Firebase
// project does not exist yet, so production builds intentionally target the
// live bourbonbuddy-dev project with production behavior (service worker on,
// App Check in real — not debug — mode). Placeholder values here caused the
// 2026-07 hosting deploy to fall back to non-prod builds; keep this file
// deployable. When a real prod project is created, swap the config below.
// These values are NOT secrets (Firebase web config ships to the client).

export const environment = {
  production: true,
  useEmulators: false,
  firebase: {
    apiKey: 'AIzaSyAj423AeVQWgEJL92HQcwb_T8JC3yVOSpE',
    authDomain: 'bourbonbuddy-dev.firebaseapp.com',
    projectId: 'bourbonbuddy-dev',
    storageBucket: 'bourbonbuddy-dev.firebasestorage.app',
    messagingSenderId: '906555272492',
    appId: '1:906555272492:web:f0b394b4f243213b5a5089',
    measurementId: 'G-ZV4Y6VD31N',
  },
  vapidKey: 'BGbdzq8vd4Nm2sOE7Fn8tiytt-IzmwWC-OHRdYUIpEnbB68eBgTRmL-XeNtHSVGCGPnMRCry5i-Czk5Z4-M-ugQ',
  maptilerKey: 'sZQiP80L1cqzNxP1VhXr',
  // App Check (BB-121): reCAPTCHA v3 site key. See docs/app-check-setup.md.
  recaptchaSiteKey: '6Lfkl0otAAAAACERAMWW_7u-cXjH8168XEhhL73i',
  emulators: {
    auth: { host: 'localhost', port: 9099 },
    firestore: { host: 'localhost', port: 8080 },
    storage: { host: 'localhost', port: 9199 },
    functions: { host: 'localhost', port: 5001 },
  },
};
