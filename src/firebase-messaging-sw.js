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

// Initializing messaging keeps FCM's token/subscription plumbing working; we do
// NOT use its onBackgroundMessage handler, which doesn't fire on iOS PWAs.
firebase.messaging();

// Render every background push ourselves (BB-092). iOS delivers web push to the
// standard `push` event — the only handler that reliably fires for an installed
// PWA. Messages are sent data-only, so payload fields live under `data`; we also
// read `notification` defensively in case a legacy message arrives.
self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }
  let payload = {};
  try {
    payload = event.data.json();
  } catch (e) {
    payload = {};
  }
  const data = payload.data || {};
  const note = payload.notification || {};
  const title = note.title || data.title || 'Bourbon Buddy';
  const options = {
    body: note.body || data.body || '',
    icon: '/assets/icon/icon-192.png',
    badge: '/assets/icon/icon-192.png',
    data,
  };
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      // BB-093: reflect the server-supplied unread count on the app icon.
      const count = parseInt(data.badge, 10);
      if (!Number.isNaN(count) && 'setAppBadge' in navigator) {
        try {
          await navigator.setAppBadge(count);
        } catch (e) {
          /* Badging API unavailable */
        }
      }
    })()
  );
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
