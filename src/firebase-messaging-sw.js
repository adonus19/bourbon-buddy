/* Firebase Cloud Messaging service worker (BB-090).
 *
 * Handles notifications that arrive while the app is in the background or
 * closed. Served from the origin root as /firebase-messaging-sw.js (see the
 * angular.json assets entry). The Firebase config below is public web config
 * (the same values shipped in the app bundle) — not a secret. Keep it in sync
 * with src/environments/environment.ts.
 */
importScripts(
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js'
);
importScripts(
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js'
);

firebase.initializeApp({
  apiKey: 'AIzaSyAj423AeVQWgEJL92HQcwb_T8JC3yVOSpE',
  authDomain: 'bourbonbuddy-dev.firebaseapp.com',
  projectId: 'bourbonbuddy-dev',
  storageBucket: 'bourbonbuddy-dev.firebasestorage.app',
  messagingSenderId: '906555272492',
  appId: '1:906555272492:web:f0b394b4f243213b5a5089',
});

const messaging = firebase.messaging();

// Show a notification for data/background messages.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Bourbon Buddy';
  const options = {
    body: payload.notification?.body || '',
    icon: '/assets/icon/icon-192.png',
    badge: '/assets/icon/icon-192.png',
    data: payload.data || {},
  };
  self.registration.showNotification(title, options);
});

// Deep-link on tap: focus an existing tab or open the target path.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage({ type: 'notification-click', target });
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      })
  );
});
