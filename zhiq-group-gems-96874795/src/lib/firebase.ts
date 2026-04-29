import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported, Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyDPF3QRJtSeiq6BzShN8q6jJSKfJ3A-NuI",
  authDomain: "viagg-tx8-4bbd9.firebaseapp.com",
  projectId: "viagg-tx8-4bbd9",
  storageBucket: "viagg-tx8-4bbd9.firebasestorage.app",
  messagingSenderId: "878772886380",
  appId: "1:878772886380:web:015e0817e3bc2cb45fb149",
};

const app = initializeApp(firebaseConfig);

let messagingInstance: Messaging | null = null;

/**
 * Retorna instância do Firebase Messaging (apenas se suportado no navegador)
 */
export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance;

  const supported = await isSupported();
  if (!supported) {
    console.warn('[Firebase] Messaging não suportado neste navegador');
    return null;
  }

  messagingInstance = getMessaging(app);
  return messagingInstance;
}

/**
 * Solicita permissão e retorna o FCM token para web push
 */
export async function requestFCMToken(vapidKey: string): Promise<string | null> {
  try {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return null;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[Firebase] Permissão de notificação negada');
      return null;
    }

    // Registrar service worker para push em background
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    console.log('[Firebase] Service Worker registrado');

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    console.log('[Firebase] 🔥 FCM Token obtido:', token?.substring(0, 30) + '...');
    return token;
  } catch (error) {
    console.error('[Firebase] Erro ao obter token:', error);
    return null;
  }
}

/**
 * Escuta mensagens recebidas em foreground
 */
export function onForegroundMessage(callback: (payload: any) => void): (() => void) | null {
  if (!messagingInstance) return null;

  const unsubscribe = onMessage(messagingInstance, (payload) => {
    console.log('[Firebase] 📬 Mensagem foreground:', payload);
    callback(payload);
  });

  return unsubscribe;
}

export { app };
