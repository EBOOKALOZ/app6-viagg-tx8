import { useEffect, useCallback, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { requestFCMToken, onForegroundMessage } from "@/lib/firebase";
import { toast } from "sonner";

export function useFCMWebPush() {
  const { user, activeProfile } = useAuth();
  const [isRegistered, setIsRegistered] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>("default");

  const unsubForegroundRef = useRef<(() => void) | null>(null);

  // Salva token via Edge Function (backend)
  const saveToken = useCallback(
    async (token: string) => {
      if (!user?.id) {
        console.warn("[FCM Web] user.id ausente, abortando saveToken");
        return;
      }

      const role = activeProfile ?? "unknown";

      try {
        console.log("[FCM Web][TEST] Chamando save-device-token", {
          user_id: user.id,
          role,
        });

        const result = await supabase.functions.invoke("save-device-token", {
          body: {
            user_id: user.id,
            fcm_token: token,
            role,
          },
        });

        console.log("[FCM Web][TEST] Resposta da Edge:", result);

        if (result.error) {
          console.error("[FCM Web] ❌ Edge Function retornou erro:", result.error);
          return;
        }

        setIsRegistered(true);
        console.log("[FCM Web] ✅ Token FCM salvo com sucesso");
      } catch (err) {
        console.error("[FCM Web] ❌ Exceção ao salvar token:", err);
      }
    },
    [user?.id, activeProfile],
  );

  // Registro Web Push
  const registerWebPush = useCallback(async (): Promise<boolean> => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      console.warn("[FCM Web] APIs de notificação não suportadas");
      return false;
    }

    try {
      console.log("[FCM Web] Buscando VAPID key…");

      const { data, error } = await supabase.functions.invoke("get-vapid-key");

      if (error || !data?.vapidKey) {
        console.error("[FCM Web] ❌ Erro ao buscar VAPID key:", error);
        return false;
      }

      console.log("[FCM Web] VAPID key obtida");

      const token = await requestFCMToken(data.vapidKey);

      if (!token) {
        setPermissionStatus(Notification.permission);
        if (Notification.permission === "denied") {
          toast.warning("Notificações bloqueadas. Ative nas configurações do navegador.");
        }
        return false;
      }

      console.log("[FCM Web] 🔑 Token FCM gerado (preview):", token.slice(0, 30) + "…");

      setPermissionStatus("granted");
      await saveToken(token);

      // Listener foreground
      if (unsubForegroundRef.current) {
        unsubForegroundRef.current();
      }

      unsubForegroundRef.current = onForegroundMessage((payload) => {
        if (payload.data?.type === "ride_call") {
          window.dispatchEvent(
            new CustomEvent("push-ride-call", {
              detail: payload.data,
            }),
          );
        }
      });

      return true;
    } catch (err) {
      console.error("[FCM Web] ❌ Erro ao registrar Web Push:", err);
      return false;
    }
  }, [saveToken]);

  // 🔑 Registrar automaticamente após login
  useEffect(() => {
    if (!user?.id) return;

    console.log("[FCM Web] Usuário logado → iniciando registro FCM", user.id);

    registerWebPush();

    return () => {
      if (unsubForegroundRef.current) {
        unsubForegroundRef.current();
        unsubForegroundRef.current = null;
      }
    };
  }, [user?.id, activeProfile, registerWebPush]);

  // Listener de clique em notificação (Service Worker)
  useEffect(() => {
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === "NOTIFICATION_CLICK" && event.data?.rideId) {
        window.dispatchEvent(
          new CustomEvent("push-notification-tap", {
            detail: { ride_id: event.data.rideId },
          }),
        );
      }
    };

    navigator.serviceWorker?.addEventListener("message", handleSWMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", handleSWMessage);
  }, []);

  // ⚠️ No Lovable Cloud, remoção deve ser via Edge Function (ajustaremos depois)
  const unregisterToken = useCallback(async () => {
    console.warn("[FCM Web] unregisterToken chamado — não implementado via Edge ainda");
    setIsRegistered(false);
  }, []);

  return {
    isRegistered,
    permissionStatus,
    registerWebPush,
    unregisterToken,
  };
}

export default useFCMWebPush;
