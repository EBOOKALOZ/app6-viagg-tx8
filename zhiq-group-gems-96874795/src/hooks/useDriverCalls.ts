import { useState, useCallback, useRef, useEffect } from 'react';
import { IncomingCall, IncomingRideCall } from '@/hooks/useRealtimeCalls';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface DriverCallsState {
  active: IncomingCall | null;
  history: IncomingCall[];
  showModal: boolean;
  isProcessing: boolean;
  isReserva: boolean; // Modo espera - chamada em reserva (sem BIP)
}

interface UseDriverCallsOptions {
  onCallReceived?: () => void;
  onReservaMode?: () => void; // Callback quando entra em modo reserva (parar BIP)
}

/**
 * Hook para gerenciar estado local soberano de chamadas do motorista (CARRO).
 * 
 * ARQUITETURA:
 * - Estado local é a única fonte de verdade da UI
 * - Realtime é apenas gatilho de evento (via receiveCall)
 * - Modal e contador NÃO podem limpar chamada ativa
 * - Aceitar/Recusar fazem UPDATE ATÔMICO no banco (motorista_corridas)
 */
export function useDriverCalls({ onCallReceived, onReservaMode }: UseDriverCallsOptions = {}) {
  const { user } = useAuth();
  
  const [state, setState] = useState<DriverCallsState>({
    active: null,
    history: [],
    showModal: false,
    isProcessing: false,
    isReserva: false,
  });
  
  const onReservaModeRef = useRef(onReservaMode);
  
  const processedCallsRef = useRef<Set<string>>(new Set());
  const onCallReceivedRef = useRef(onCallReceived);

  // Keep callback refs updated
  useEffect(() => {
    onCallReceivedRef.current = onCallReceived;
    onReservaModeRef.current = onReservaMode;
  }, [onCallReceived, onReservaMode]);

  /**
   * Recebe uma chamada do realtime.
   * Só processa se não houver chamada ativa e se não foi processada antes.
   */
  const receiveCall = useCallback((call: IncomingCall) => {
    console.log('[useDriverCalls] receiveCall:', call.id);
    
    // Evitar processamento duplicado
    if (processedCallsRef.current.has(call.id)) {
      console.log('[useDriverCalls] Chamada já processada, ignorando:', call.id);
      return;
    }

    setState(prev => {
      // Só aceita nova chamada se não houver ativa
      if (prev.active) {
        console.log('[useDriverCalls] Já existe chamada ativa, ignorando:', call.id);
        return prev;
      }

      console.log('[useDriverCalls] Definindo chamada ativa:', call.id);
      processedCallsRef.current.add(call.id);
      
      return {
        ...prev,
        active: call,
        showModal: true,
        isReserva: false, // Nova chamada sempre começa em modo pendente
      };
    });

    // Callback de notificação
    onCallReceivedRef.current?.();
  }, []);

  /**
   * Fecha o modal e atualiza status para 'reserva' no banco (idêntico ao MotoTaxi).
   * Chamado quando o contador expira.
   */
  const closeModal = useCallback(async (callId?: string) => {
    console.log('[useDriverCalls] Fechando modal - atualizando status para reserva');
    
    // Se temos o callId, atualizar status no banco para 'reserva'
    const targetCallId = callId || state.active?.id;
    if (targetCallId) {
      console.log('[useDriverCalls] 🔄 Atualizando status para reserva:', targetCallId);
      try {
        const { error } = await supabase
          .from('motorista_corridas')
          .update({ status: 'reserva' })
          .eq('id', targetCallId)
          .eq('status', 'pendente') // Só atualiza se ainda estiver pendente
          .is('motorista_id', null); // Só atualiza se não foi aceita
        
        if (error) {
          console.error('[useDriverCalls] Erro ao atualizar para reserva:', error);
        } else {
          console.log('[useDriverCalls] ✅ Status atualizado para reserva');
        }
      } catch (err) {
        console.error('[useDriverCalls] Exceção ao atualizar para reserva:', err);
      }
    }
    
    setState(prev => ({
      ...prev,
      showModal: false,
      isReserva: true, // Entra em modo reserva (espera)
    }));
    
    // Notificar para parar o BIP
    onReservaModeRef.current?.();
  }, [state.active?.id]);

  /**
   * CORREÇÃO: Aceita a chamada com UPDATE ATÔMICO no banco motorista_corridas.
   * Preenche motorista_id com usuário logado e status 'aceita'.
   */
  const acceptCall = useCallback(async (callId: string): Promise<void> => {
    if (!user?.id) {
      toast.error('Usuário não autenticado');
      return;
    }
    
    // Evitar cliques duplos
    if (state.isProcessing) {
      console.log('[useDriverCalls] Já processando, ignorando clique');
      return;
    }
    
    console.log('[useDriverCalls] 🚗 Aceitando corrida CARRO:', callId);
    setState(prev => ({ ...prev, isProcessing: true }));
    
    try {
      // UPDATE ATÔMICO: (status='pendente' OR status='reserva') AND motorista_id IS NULL
      // CORREÇÃO: Aceitar corridas em 'pendente' OU 'reserva' (idêntico ao MotoTaxi)
      // UPDATE ATÔMICO sem .select() para evitar erro 42501
      const { error } = await supabase
        .from('motorista_corridas')
        .update({
          motorista_id: user.id,
          status: 'aceita',
          accepted_at: new Date().toISOString(),
        })
        .eq('id', callId)
        .in('status', ['pendente', 'reserva']) // Aceita ambos os status
        .is('motorista_id', null); // CRÍTICO: Só aceita se ninguém pegou
      
      if (error) {
        // Se erro de constraint ou conflito, outro motorista já aceitou
        if (error.code === '23505' || error.message?.includes('constraint')) {
          console.log('[useDriverCalls] ❌ Corrida já aceita por outro motorista');
          toast.info('Esta corrida foi aceita por outro motorista. Você continua disponível!', {
            duration: 4000,
            icon: '🚗',
          });
          
          // Limpar chamada local
          setState(prev => ({
            ...prev,
            active: null,
            showModal: false,
            isProcessing: false,
          }));
          return;
        }
        throw error;
      }
      
      console.log('[useDriverCalls] ✅ Corrida CARRO aceita com sucesso:', callId);
      toast.success('Corrida aceita! 🚗', {
        description: 'Vá até o passageiro',
        duration: 4000,
      });
      
      // Mover para histórico
      setState(prev => {
        const acceptedCall = prev.active ? { ...prev.active } : null;
        
        return {
          active: null,
          showModal: false,
          isProcessing: false,
          isReserva: false,
          history: acceptedCall 
            ? [{ ...acceptedCall, _status: 'accepted', _processedAt: new Date().toISOString() } as IncomingCall, ...prev.history]
            : prev.history,
        };
      });
      
    } catch (error) {
      console.error('[useDriverCalls] Erro ao aceitar corrida:', error);
      toast.error('Erro ao aceitar corrida. Tente novamente.');
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  }, [user?.id, state.isProcessing]);

  /**
   * Recusa a chamada e move para histórico.
   */
  const rejectCall = useCallback((callId: string) => {
    console.log('[useDriverCalls] Recusando chamada:', callId);
    
    setState(prev => {
      if (!prev.active || prev.active.id !== callId) {
        console.log('[useDriverCalls] Chamada não encontrada para recusar:', callId);
        return prev;
      }

      const rejectedCall = { ...prev.active };
      
      return {
        active: null,
        showModal: false,
        isProcessing: false,
        isReserva: false,
        history: [
          { ...rejectedCall, _status: 'rejected', _processedAt: new Date().toISOString() } as IncomingCall,
          ...prev.history,
        ],
      };
    });
  }, []);

  /**
   * CORREÇÃO CONCORRÊNCIA: Limpa chamada pelo ID (quando outro motorista aceita via realtime)
   */
  const clearCallById = useCallback((callId: string) => {
    console.log('[useDriverCalls] 🔴 clearCallById chamado para:', callId);
    setState(prev => {
      console.log('[useDriverCalls] Estado atual - active:', prev.active?.id, 'comparando com:', callId);
      if (prev.active?.id !== callId) {
        console.log('[useDriverCalls] IDs não correspondem, mantendo estado');
        return prev;
      }
      console.log('[useDriverCalls] ✅ Limpando chamada via realtime:', callId);
      return { ...prev, active: null, showModal: false, isProcessing: false };
    });
  }, []);

  /**
   * Limpa o histórico de chamadas.
   */
  const clearHistory = useCallback(() => {
    console.log('[useDriverCalls] Limpando histórico');
    setState(prev => ({
      ...prev,
      history: [],
    }));
  }, []);

  /**
   * Entra em modo reserva para a chamada ativa (atualização via realtime).
   * Para o BIP mas mantém a chamada visível.
   */
  const enterReservaMode = useCallback(() => {
    console.log('[useDriverCalls] 📦 Entrando em modo reserva via realtime');
    setState(prev => {
      if (!prev.active) return prev;
      return { ...prev, isReserva: true, showModal: false };
    });
    // Notificar para parar o BIP
    onReservaModeRef.current?.();
  }, []);

  return {
    // Estado
    activeCall: state.active,
    showModal: state.showModal,
    history: state.history,
    hasActiveCall: state.active !== null,
    isProcessing: state.isProcessing,
    isReserva: state.isReserva,
    
    // Ações
    receiveCall,
    closeModal,
    acceptCall,
    rejectCall,
    clearHistory,
    clearCallById, // CORREÇÃO CONCORRÊNCIA
    enterReservaMode, // NOVO: modo espera via realtime
  };
}

export default useDriverCalls;
