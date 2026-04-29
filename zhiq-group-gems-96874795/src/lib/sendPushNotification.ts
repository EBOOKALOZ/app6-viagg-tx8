import { supabase } from '@/integrations/supabase/client';

interface RidePushPayload {
  ride_id: string;
  passenger_name?: string;
  pickup_location: string;
  destination: string;
  estimated_value: number;
  service_type: string;
}

/**
 * Envia push notification para todos os mototaxis
 * Chamado quando uma nova corrida é criada
 */
export async function sendRidePushNotification(payload: RidePushPayload): Promise<{
  success: boolean;
  sent?: number;
  error?: string;
}> {
  console.log('[Push] 📤 Enviando push para corrida:', payload.ride_id);
  
  try {
    const { data, error } = await supabase.functions.invoke('send-push-notification', {
      body: payload,
    });
    
    if (error) {
      console.error('[Push] ❌ Erro na edge function:', error);
      return { success: false, error: error.message };
    }
    
    console.log('[Push] ✅ Resultado:', data);
    return { 
      success: true, 
      sent: data?.sent || 0,
    };
  } catch (err) {
    console.error('[Push] ❌ Exceção:', err);
    return { success: false, error: String(err) };
  }
}

export default sendRidePushNotification;
