// Production environment — Firebase project: bourbon-buddy-prod
// TODO(setup): The bourbon-buddy-prod Firebase project does not exist yet.
// Once it is created, paste its web app config below. These values are NOT
// secrets (Firebase web config is shipped to the client), but the prod
// project must have its own Security Rules deployed before going live.

export const environment = {
  production: true,
  useEmulators: false,
  firebase: {
    apiKey: 'REPLACE_WITH_PROD_API_KEY',
    authDomain: 'bourbon-buddy-prod.firebaseapp.com',
    projectId: 'bourbon-buddy-prod',
    storageBucket: 'bourbon-buddy-prod.firebasestorage.app',
    messagingSenderId: 'REPLACE_WITH_PROD_SENDER_ID',
    appId: 'REPLACE_WITH_PROD_APP_ID',
    measurementId: 'REPLACE_WITH_PROD_MEASUREMENT_ID',
  },
  emulators: {
    auth: { host: 'localhost', port: 9099 },
    firestore: { host: 'localhost', port: 8080 },
    storage: { host: 'localhost', port: 9199 },
    functions: { host: 'localhost', port: 5001 },
  },
};
