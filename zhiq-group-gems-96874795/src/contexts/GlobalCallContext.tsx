// 🔥 GlobalCallContext.tsx (FINAL STABILIZED VERSION)

import React, { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from "react";
import { IncomingCall, useRealtimeCalls } from "@/hooks/useRealtimeCalls";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import IncomingCallModal from "@/components/IncomingCallModal";
import DeliveryOfferCard from "@/components/motoboy/DeliveryOfferCard";
import DeliveryQueueCard from "@/components/motoboy/DeliveryQueueCard";
import DeliveryAcceptedCard from "@/components/motoboy/DeliveryAcceptedCard";
import { useDeliveryOfferListener, stopMotobyAudio } from "@/hooks/useDeliveryOfferListener";
import { useGeolocation } from "@/hooks/useGeolocation";
import { MissedCall } from "@/components/motoboy/MissedCallsSection";

interface GlobalCallState {
  activeCall: IncomingCall | null;
  showModal: boolean;
  isProcessing: boolean;
  lastAcceptedRideId: string | null;
}

interface GlobalCallContextType {
  activeCall: IncomingCall | null;
  showModal: boolean;
  hasActiveCall: boolean;
  isProcessing: boolean;
  isConnected: boolean;
  isSoundBlocked: boolean;
  lastAcceptedRideId: string | null;
  missedCalls: MissedCall[];
  clearMissedCalls: () => void;
  removeMissedCall: (callId: string) => void;
  acceptCall: (callId: string) => Promise<void>;
  rejectCall: (callId: string) => void;
  closeModal: () => void;
  enableSound: () => Promise<void>;
  clearLastAcceptedRideId: () => void;
  stopBeepLoop: () => void;
  deliveryOffer: any | null;
  deliveryPhase: 'idle' | 'ringing' | 'queue' | 'accepted';
  acceptDeliveryOffer: (id: string) => Promise<void>;
  dismissDeliveryOffer: (id: string) => Promise<void>;
  proceedToAwait: (id: string) => void;
}

const GlobalCallContext = createContext<GlobalCallContextType | undefined>(undefined);

interface GlobalCallProviderProps {
  children: ReactNode;
}

export function GlobalCallProvider({ children }: GlobalCallProviderProps) {
  const { user, activeProfile } = useAuth();
  
  // 1. Ouvinte de Entregas (Novo sistema - Motoboy Dashboard)
  const { 
    currentOffer, 
    phase: deliveryPhase, 
    accept: acceptDeliveryOffer, 
    dismiss: dismissDeliveryOffer,
    proceedToAwait,
  } = useDeliveryOfferListener();

  // 2. Ouvinte de Chamadas (Sistema Legado + Mototaxi Rides)
  const {
    incomingCalls,
    removeCall,
    broadcastRideAccepted
  } = useRealtimeCalls({
    enabled: !!user?.id,
    listenDeliveries: false, // Desabilitado aqui, pois useDeliveryOfferListener já cuida
    listenRides: true,       // Ativo para Mototaxi/Carro
    activeProfileId: user?.id
  });

  const { getCurrentPosition } = useGeolocation();

  const [state, setState] = useState<GlobalCallState>({
    activeCall: null,
    showModal: false,
    isProcessing: false,
    lastAcceptedRideId: null,
  });

  // Sincronizar activeCall com incomingCalls[0]
  useEffect(() => {
    if (incomingCalls.length > 0) {
      setState(prev => ({ 
        ...prev, 
        activeCall: incomingCalls[0], 
        showModal: true 
      }));
    } else {
      setState(prev => ({ 
        ...prev, 
        activeCall: null, 
        showModal: false 
      }));
    }
  }, [incomingCalls]);

  const [missedCalls, setMissedCalls] = useState<MissedCall[]>([]);
  const isSoundBlocked = false;
  const stopBeepLoop = useCallback(() => {}, []);

  // 📡 Presence Heartbeat (Motoboy only)
  // Importante: envia coordenadas reais (GPS ou cadastro) — nunca 0,0
  // pois o dispatcher usa proximidade e 0,0 colocaria o motoboy no oceano.
  useEffect(() => {
    if (activeProfile !== 'motoboy' || !user?.id) return;
    const userId = user.id;

    // Cache das coordenadas de residência (fallback quando GPS indisponível)
    let fallbackLat: number | null = null;
    let fallbackLng: number | null = null;

    supabase
      .from('motoboy_profiles')
      .select('latitude_residencia, longitude_residencia')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.latitude_residencia && data?.longitude_residencia) {
          fallbackLat = data.latitude_residencia;
          fallbackLng = data.longitude_residencia;
        }
      });

    const pulse = async () => {
      try {
        const pos = await getCurrentPosition().catch(() => null);
        const lat = pos?.lat ?? fallbackLat;
        const lng = pos?.lng ?? fallbackLng;

        // Não envia presença se não há coordenada válida (evita 0,0 no oceano)
        if (!lat || !lng) {
          console.warn('[PresenceHeartbeat] ⚠️ Sem coordenadas — pulso ignorado');
          return;
        }

        console.log('[PresenceHeartbeat] 📡 Pulso de presença:', { lat, lng, fromGPS: !!pos });
        await supabase.rpc('update_motoboy_presence', { p_lat: lat, p_lng: lng });
      } catch (err) {
        console.error('[PresenceHeartbeat] ❌ Erro:', err);
      }
    };

    pulse();
    const interval = setInterval(pulse, 45000);
    return () => clearInterval(interval);
  }, [activeProfile, user?.id, getCurrentPosition]);

  // Ação: Aceitar Chamada (Mototaxi)
  const acceptCall = async (callId: string) => {
    if (state.isProcessing) return;
    setState(prev => ({ ...prev, isProcessing: true }));

    try {
      const { data, error } = await supabase.rpc('accept_ride', {
        p_ride_id: callId,
      });

      if (error) throw error;
      const response = data as any;

      if (response?.ok) {
        toast.success("Corrida aceita!");
        await broadcastRideAccepted(callId);
        setState(prev => ({ 
          ...prev, 
          lastAcceptedRideId: callId,
          showModal: false,
          isProcessing: false 
        }));
        removeCall(callId);
      } else {
        const errorMsg = response?.reason || "Não foi possível aceitar.";
        toast.error(`Falha: ${errorMsg}`);
        console.error("[GlobalCall] Erro no retorno do RPC:", response);
        setState(prev => ({ ...prev, isProcessing: false }));
        removeCall(callId);
      }
    } catch (err: any) {
      console.error("Erro aceitar:", err);
      const detail = err.message || "Erro de rede ou permissão.";
      toast.error(`Erro de conexão: ${detail}`);
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  // Ação: Rejeitar/Fechar Chamada
  const rejectCall = (callId: string) => {
    removeCall(callId);
    setState(prev => ({ ...prev, showModal: false, activeCall: null }));
  };

  const closeModal = useCallback(() => {
    setState((prev) => ({ ...prev, showModal: false }));
  }, []);

  return (
    <GlobalCallContext.Provider
      value={{
        activeCall: state.activeCall,
        showModal: state.showModal,
        hasActiveCall: Boolean(state.activeCall),
        isProcessing: state.isProcessing,
        isConnected: true,
        isSoundBlocked,
        lastAcceptedRideId: state.lastAcceptedRideId,
        missedCalls,
        clearMissedCalls: () => setMissedCalls([]),
        removeMissedCall: (id) => setMissedCalls((prev) => prev.filter((c) => c.id !== id)),
        acceptCall,
        rejectCall,
        closeModal,
        enableSound: async () => {},
        clearLastAcceptedRideId: () => setState((prev) => ({ ...prev, lastAcceptedRideId: null })),
        stopBeepLoop,
        deliveryOffer: currentOffer,
        deliveryPhase: deliveryPhase,
        acceptDeliveryOffer,
        dismissDeliveryOffer,
        proceedToAwait,
      }}
    >
      {children}

      {/* 2. Modal de Chamada (Mototaxi / Rides) */}
      <div style={{ zIndex: 9999, position: 'relative' }}>
        <IncomingCallModal
          isOpen={state.showModal && !!state.activeCall}
          call={state.activeCall}
          isAccepting={state.isProcessing}
          onAccept={() => state.activeCall && acceptCall(state.activeCall.id)}
          onReject={() => state.activeCall && rejectCall(state.activeCall.id)}
          onExpire={() => setState(prev => ({ ...prev, showModal: false }))}
        />
        {state.showModal && !!state.activeCall && (
          <button 
            onClick={() => {
              stopBeepLoop();
              toast.info("Áudio interrompido manualmente");
            }}
            className="fixed bottom-4 left-4 text-white/50 text-xs hover:text-white underline underline-offset-4 z-[10001]"
          >
            Silenciar Alarme
          </button>
        )}
      </div>

      {/* 🚚 Overlay de Entrega (Motoboy) */}
      {currentOffer && deliveryPhase === 'ringing' && (
        <div 
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-300">
            <DeliveryOfferCard
              offer={currentOffer}
              onAccept={() => acceptDeliveryOffer(currentOffer.id)}
              onDismiss={() => dismissDeliveryOffer(currentOffer.id)}
            />
            {/* Botão de Emergência para Parar Áudio */}
            <button 
              onClick={() => {
                stopMotobyAudio();
                toast.info("Áudio interrompido manualmente");
              }}
              className="mt-4 mx-auto block text-white/50 text-xs hover:text-white underline underline-offset-4"
            >
              Silenciar Alarme
            </button>
          </div>
        </div>
      )}

      {/* 🕐 Modo Fila / Espera */}
      {currentOffer && deliveryPhase === 'queue' && (
        <DeliveryQueueCard offer={currentOffer} />
      )}

      {/* ✅ Corrida Aceita — Tela intermediária com dados da loja */}
      {currentOffer && deliveryPhase === 'accepted' && (
        <DeliveryAcceptedCard
          offer={currentOffer}
          onProceed={() => proceedToAwait(currentOffer.id)}
        />
      )}
    </GlobalCallContext.Provider>
  );
}

export function useGlobalCall() {
  const ctx = useContext(GlobalCallContext);
  if (!ctx) throw new Error("useGlobalCall must be used within GlobalCallProvider");
  return ctx;
}
