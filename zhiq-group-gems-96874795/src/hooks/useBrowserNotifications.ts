import { useCallback, useEffect, useRef, useState } from 'react';

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: any;
  requireInteraction?: boolean;
}

/**
 * Hook para gerenciar notificações do navegador (Web Notifications API)
 * Funciona mesmo com o app em segundo plano
 */
export function useBrowserNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const activeNotificationRef = useRef<Notification | null>(null);

  // Verificar suporte e permissão
  useEffect(() => {
    const supported = 'Notification' in window;
    setIsSupported(supported);
    
    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  // Solicitar permissão
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      console.warn('[Notifications] API não suportada');
      return false;
    }

    if (permission === 'granted') {
      return true;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      console.log('[Notifications] Permissão:', result);
      return result === 'granted';
    } catch (error) {
      console.error('[Notifications] Erro ao solicitar permissão:', error);
      return false;
    }
  }, [isSupported, permission]);

  // Enviar notificação
  const notify = useCallback(async (options: NotificationOptions): Promise<Notification | null> => {
    if (!isSupported) {
      console.warn('[Notifications] API não suportada');
      return null;
    }

    if (permission !== 'granted') {
      console.warn('[Notifications] Permissão não concedida');
      const granted = await requestPermission();
      if (!granted) return null;
    }

    try {
      // Fechar notificação anterior com mesmo tag
      if (activeNotificationRef.current && options.tag) {
        activeNotificationRef.current.close();
      }

      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/favicon.png',
        tag: options.tag || 'viagg-notification',
        data: options.data,
        requireInteraction: options.requireInteraction ?? true,
        silent: false, // Garantir que som do sistema toque
      });

      // Evento de clique - focar na janela
      notification.onclick = () => {
        window.focus();
        notification.close();
        
        // Se tiver dados de rota, navegar
        if (options.data?.rideId) {
          // Dispatch evento customizado para navegação
          window.dispatchEvent(new CustomEvent('notification-click', {
            detail: options.data
          }));
        }
      };

      activeNotificationRef.current = notification;
      console.log('[Notifications] Notificação enviada:', options.title);
      
      return notification;
    } catch (error) {
      console.error('[Notifications] Erro ao enviar:', error);
      return null;
    }
  }, [isSupported, permission, requestPermission]);

  // Fechar notificação ativa
  const closeNotification = useCallback(() => {
    if (activeNotificationRef.current) {
      activeNotificationRef.current.close();
      activeNotificationRef.current = null;
    }
  }, []);

  // Notificação específica para nova corrida
  const notifyNewRide = useCallback(async (rideData: {
    id: string;
    passengerName?: string;
    pickupLocation: string;
    estimatedValue: number;
  }) => {
    return notify({
      title: '🏍️ Nova corrida!',
      body: `${rideData.passengerName || 'Passageiro'} - R$ ${rideData.estimatedValue.toFixed(2).replace('.', ',')}`,
      tag: `ride-${rideData.id}`,
      data: { rideId: rideData.id },
      requireInteraction: true,
    });
  }, [notify]);

  return {
    isSupported,
    permission,
    requestPermission,
    notify,
    notifyNewRide,
    closeNotification,
    hasPermission: permission === 'granted',
  };
}

export default useBrowserNotifications;
