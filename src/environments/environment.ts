// Development environment — Firebase project: bourbon-buddy-dev
// `ng build` replaces this file with environment.prod.ts via the
// fileReplacements array in angular.json.

export const environment = {
  production: false,
  // Set to true to route Auth/Firestore/Storage/Functions at the local
  // Firebase Emulator Suite (see firebase.json for ports). Keep false to
  // talk to the live bourbon-buddy-dev project.
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
  // Web Push (FCM) public VAPID key. Generate in Firebase Console → Project
  // settings → Cloud Messaging → Web Push certificates → Generate key pair,
  // then paste the public key here. Push stays disabled until this is set.
  vapidKey: '',
  emulators: {
    auth: { host: 'localhost', port: 9099 },
    firestore: { host: 'localhost', port: 8080 },
    storage: { host: 'localhost', port: 9199 },
    functions: { host: 'localhost', port: 5001 },
  },
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
