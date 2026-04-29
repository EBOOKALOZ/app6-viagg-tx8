import { useEffect, useCallback, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// Tipo para Capacitor Push Notifications
interface PushNotificationSchema {
  title?: string;
  body?: string;
  data?: Record<string, string>;
}

interface ActionPerformed {
  notification: PushNotificationSchema;
  actionId: string;
}

interface RegistrationEvent {
  value: string;
}

interface RegistrationErrorEvent {
  error: string;
}

interface DeliveredNotifications {
  notifications: PushNotificationSchema[];
}

// Interface do plugin Capacitor Push Notifications
interface PushNotificationsPlugin {
  requestPermissions(): Promise<{ receive: 'granted' | 'denied' | 'prompt' }>;
  register(): Promise<void>;
  getDeliveredNotifications(): Promise<DeliveredNotifications>;
  removeDeliveredNotifications(options: { notifications: PushNotificationSchema[] }): Promise<void>;
  removeAllDeliveredNotifications(): Promise<void>;
  createChannel(options: { id: string; name: string; importance: number; sound?: string; vibration?: boolean }): Promise<void>;
  addListener(event: 'registration', callback: (event: RegistrationEvent) => void): Promise<{ remove: () => void }>;
  addListener(event: 'registrationError', callback: (event: RegistrationErrorEvent) => void): Promise<{ remove: () => void }>;
  addListener(event: 'pushNotificationReceived', callback: (notification: PushNotificationSchema) => void): Promise<{ remove: () => void }>;
  addListener(event: 'pushNotificationActionPerformed', callback: (action: ActionPerformed) => void): Promise<{ remove: () => void }>;
}

// Declaração global para Capacitor
declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform(): boolean;
      Plugins?: {
        PushNotifications?: PushNotificationsPlugin;
      };
    };
  }
}

/**
 * Hook para gerenciar Push Notifications nativas via FCM/APNs
 * 
 * Features:
 * - Registro automático de device token
 * - Canal ride_calls com prioridade máxima
 * - Som personalizado ride_alert
 * - Vibração obrigatória
 * - Funciona com app fechado
 */
export function usePushNotifications() {
  const { user, activeProfile } = useAuth();
  const [isRegistered, setIsRegistered] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt' | 'unsupported'>('unsupported');
  const listenersRef = useRef<Array<{ remove: () => void }>>([]);
  
  // Verificar se estamos em plataforma nativa
  const isNative = typeof window !== 'undefined' && 
    window.Capacitor?.isNativePlatform?.() === true;
  
  // Registrar token no banco de dados
  const saveToken = useCallback(async (token: string) => {
    if (!user?.id || !activeProfile) return;
    
    console.log('[Push] 💾 Salvando token para:', activeProfile);
    
    try {
      // Upsert: atualiza se existir, insere se não
      const { error } = await supabase
        .from('device_tokens')
        .upsert(
          {
            user_id: user.id,
            fcm_token: token,
            role: activeProfile,
          },
          {
            onConflict: 'fcm_token',
          }
        );
      
      if (error) {
        console.error('[Push] ❌ Erro ao salvar token:', error);
        return;
      }
      
      setIsRegistered(true);
      console.log('[Push] ✅ Token registrado com sucesso');
    } catch (err) {
      console.error('[Push] ❌ Exceção ao salvar token:', err);
    }
  }, [user?.id, activeProfile]);
  
  // Criar canal de notificação (Android only)
  const createNotificationChannel = useCallback(async () => {
    if (!isNative) return;
    
    const PushNotifications = window.Capacitor?.Plugins?.PushNotifications;
    if (!PushNotifications?.createChannel) return;
    
    try {
      await PushNotifications.createChannel({
        id: 'ride_calls',
        name: 'Chamadas de Corrida',
        importance: 5, // IMPORTANCE_HIGH (5) para prioridade máxima
        sound: 'ride_alert', // Arquivo ride_alert.mp3 em res/raw/
        vibration: true,
      });
      console.log('[Push] ✅ Canal ride_calls criado');
    } catch (err) {
      console.warn('[Push] Canal já existe ou erro:', err);
    }
  }, [isNative]);
  
  // Solicitar permissão e registrar
  const registerForPushNotifications = useCallback(async (): Promise<boolean> => {
    if (!isNative) {
      console.log('[Push] Não é plataforma nativa, ignorando');
      return false;
    }
    
    const PushNotifications = window.Capacitor?.Plugins?.PushNotifications;
    if (!PushNotifications) {
      console.warn('[Push] Plugin PushNotifications não disponível');
      return false;
    }
    
    try {
      // 1. Solicitar permissão
      const permResult = await PushNotifications.requestPermissions();
      console.log('[Push] Permissão:', permResult.receive);
      setPermissionStatus(permResult.receive);
      
      if (permResult.receive !== 'granted') {
        toast.warning('Ative as notificações para receber chamadas de corrida');
        return false;
      }
      
      // 2. Criar canal Android
      await createNotificationChannel();
      
      // 3. Registrar no FCM/APNs
      await PushNotifications.register();
      console.log('[Push] 📱 Registro iniciado...');
      
      return true;
    } catch (err) {
      console.error('[Push] ❌ Erro ao registrar:', err);
      return false;
    }
  }, [isNative, createNotificationChannel]);
  
  // Setup listeners
  useEffect(() => {
    if (!isNative) return;
    
    const PushNotifications = window.Capacitor?.Plugins?.PushNotifications;
    if (!PushNotifications) return;
    
    const setupListeners = async () => {
      // Limpar listeners anteriores
      listenersRef.current.forEach(l => l.remove());
      listenersRef.current = [];
      
      // Listener de registro bem-sucedido
      const regListener = await PushNotifications.addListener(
        'registration',
        (event: RegistrationEvent) => {
          console.log('[Push] 🎉 Token recebido:', event.value.substring(0, 30) + '...');
          saveToken(event.value);
        }
      );
      listenersRef.current.push(regListener);
      
      // Listener de erro de registro
      const errorListener = await PushNotifications.addListener(
        'registrationError',
        (event: RegistrationErrorEvent) => {
          console.error('[Push] ❌ Erro de registro:', event.error);
        }
      );
      listenersRef.current.push(errorListener);
      
      // Listener de notificação recebida (app em foreground)
      const receivedListener = await PushNotifications.addListener(
        'pushNotificationReceived',
        (notification: PushNotificationSchema) => {
          console.log('[Push] 📬 Notificação recebida:', notification);
          
          // Disparar evento para GlobalCallContext processar
          if (notification.data?.type === 'ride_call') {
            window.dispatchEvent(new CustomEvent('push-ride-call', {
              detail: {
                ride_id: notification.data.ride_id,
                passenger_name: notification.data.passenger_name,
                pickup_location: notification.data.pickup_location,
                destination: notification.data.destination,
                estimated_value: parseFloat(notification.data.estimated_value || '0'),
                service_type: notification.data.service_type,
              }
            }));
          }
        }
      );
      listenersRef.current.push(receivedListener);
      
      // Listener de ação na notificação (usuário tocou)
      const actionListener = await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (action: ActionPerformed) => {
          console.log('[Push] 👆 Ação na notificação:', action);
          
          // Navegar para corrida se disponível
          if (action.notification.data?.ride_id) {
            window.dispatchEvent(new CustomEvent('push-notification-tap', {
              detail: {
                ride_id: action.notification.data.ride_id,
              }
            }));
          }
        }
      );
      listenersRef.current.push(actionListener);
      
      console.log('[Push] 👂 Listeners configurados');
    };
    
    setupListeners();
    
    return () => {
      listenersRef.current.forEach(l => l.remove());
      listenersRef.current = [];
    };
  }, [isNative, saveToken]);
  
  // Auto-registrar quando mototaxi estiver ativo
  useEffect(() => {
    if (activeProfile === 'mototaxi' && user?.id && isNative) {
      registerForPushNotifications();
    }
  }, [activeProfile, user?.id, isNative, registerForPushNotifications]);
  
  // Remover token ao fazer logout ou trocar perfil
  const unregisterToken = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      await supabase
        .from('device_tokens')
        .delete()
        .eq('user_id', user.id);
      
      setIsRegistered(false);
      console.log('[Push] 🗑️ Token removido');
    } catch (err) {
      console.warn('[Push] Erro ao remover token:', err);
    }
  }, [user?.id]);
  
  return {
    isNative,
    isRegistered,
    permissionStatus,
    registerForPushNotifications,
    unregisterToken,
  };
}

export default usePushNotifications;
