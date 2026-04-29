 
// Firebase Messaging Service Worker — recebe push em background

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDPF3QRJtSeiq6BzShN8q6jJSKfJ3A-NuI",
  authDomain: "viagg-tx8-4bbd9.firebaseapp.com",
  projectId: "viagg-tx8-4bbd9",
  storageBucket: "viagg-tx8-4bbd9.firebasestorage.app",
  messagingSenderId: "878772886380",
  appId: "1:878772886380:web:015e0817e3bc2cb45fb149",
});

const messaging = firebase.messaging();

// Notificação em background
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Push em background:', payload);

  const title = payload.notification?.title || '🏍️ Nova Corrida!';
  const body = payload.notification?.body || 'Você tem uma nova solicitação';

  const options = {
    body,
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag: payload.data?.ride_id || 'ride-call',
    requireInteraction: true,
    vibrate: [300, 100, 300, 100, 300],
    data: payload.data || {},
  };

  self.registration.showNotification(title, options);
});

// Clique na notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rideId = event.notification.data?.ride_id;
  const url = rideId ? `/?ride=${rideId}` : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'NOTIFICATION_CLICK', rideId });
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
