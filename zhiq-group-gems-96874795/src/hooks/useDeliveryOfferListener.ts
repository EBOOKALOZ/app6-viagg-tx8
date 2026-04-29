import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { DeliveryOffer } from '@/components/motoboy/DeliveryOfferCard';
import { forceStopGlobalAudio } from '@/components/GlobalAudioPlayer';

const BIP_URL = 'https://broifhfqmnzqoongtokm.supabase.co/storage/v1/object/public/audio%20de%20chamada%20motoboy/bip_motoboy_call.mp3';

export type DeliveryListenerPhase = 'idle' | 'ringing' | 'queue' | 'accepted';

// ══ AUDIO MODULE-LEVEL ═════════════════════════════════════════════
// Sistema de geração: cada stop() avança o contador → invalida qualquer
// playNext() pendente no event loop, sem exceção (sem race condition).
let _audio: HTMLAudioElement | null = null;
let _playingOfferId: string | null = null;
let _timerId: any = null;
let _gen = 0; // ← contador de geração; muda a cada stop()
const MAX_PLAYS = 6;

/** Retorna true enquanto o BIP de oferta está tocando ativamente */
export function isDeliveryOfferRinging(): boolean {
  return _playingOfferId !== null;
}
const _notifiedIds = new Set<string>();

export function stopMotobyAudio() {
  _gen++;                          // invalida todas as closures pendentes
  _playingOfferId = null;

  if (_timerId !== null) {
    clearTimeout(_timerId);
    _timerId = null;
  }

  if (_audio) {
    const el = _audio;
    _audio = null;
    el.onended = null;
    try {
      el.pause();
      el.currentTime = 0;
      el.src = '';
    } catch (_) { /* ignore */ }
  }

  // ★ Para TODA música de fundo imediatamente (chamada direta, sem eventos)
  forceStopGlobalAudio();

  // Evento global para outros hooks com audio via ref (ex: painel-ambiente)
  window.dispatchEvent(new CustomEvent('stop-all-motoboy-audio'));

  console.log('[Audio] 🔇 Áudio parado. Geração agora:', _gen);
}

function playOfferAudio(offerId: string) {
  if (_playingOfferId === offerId) return; // já tocando essa oferta
  if (_notifiedIds.has(offerId)) return;   // já completou o ciclo

  stopMotobyAudio();               // avança _gen + limpa tudo
  _playingOfferId = offerId;

  // Capturar a geração atual na closure → any old closure vê gen diferente
  const myGen = _gen;

  const audio = new Audio(BIP_URL);
  audio.preload = 'auto';
  audio.volume = 0.9;
  _audio = audio;

  let playCount = 0;               // contador local da closure

  const playNext = () => {
    // ★ GUARD PRIMÁRIO: geração mudou? → stop() foi chamado → abortar
    if (_gen !== myGen) {
      console.log('[Audio] ⛔ Geração inválida, abortando play.', { myGen, _gen });
      return;
    }

    if (playCount >= MAX_PLAYS) {
      _notifiedIds.add(offerId);
      stopMotobyAudio();
      return;
    }

    playCount++;
    console.log(`[Audio] ▶️ BIP (${playCount}/${MAX_PLAYS}) oferta:`, offerId);

    audio.currentTime = 0;
    audio.onended = () => {
      // Verificar geração DENTRO do onended também
      if (_gen !== myGen) return;
      _timerId = setTimeout(playNext, 1200);
    };

    audio.play().catch(err =>
      console.warn('[Audio] Play bloqueado:', err.message)
    );
  };

  playNext();
}
// ══ FIM AUDIO MODULE-LEVEL ═══════════════════════════════════════



export function useDeliveryOfferListener() {
  const { user, activeProfile } = useAuth();
  const navigate = useNavigate();
  const [currentOffer, setCurrentOffer] = useState<DeliveryOffer | null>(null);
  const [phase, setPhase] = useState<DeliveryListenerPhase>('idle');
  const [acceptedOrderId, setAcceptedOrderId] = useState<string | null>(null);

  const dismissedIdsRef = useRef<Set<string>>(new Set());
  const seenIdsRef = useRef<Set<string>>(new Set()); 
  const isFreshCallRef = useRef(false);
  const currentOfferRef = useRef<DeliveryOffer | null>(null);

  const setCurrentOfferSynced = useCallback((updater: DeliveryOffer | null | ((prev: DeliveryOffer | null) => DeliveryOffer | null)) => {
    if (typeof updater === 'function') {
      setCurrentOffer(prev => {
        const next = updater(prev);
        currentOfferRef.current = next;
        return next;
      });
    } else {
      currentOfferRef.current = updater;
      setCurrentOffer(updater);
    }
  }, []);

  const isActive = !!user?.id;

  useEffect(() => {
    if (phase === 'ringing' && currentOffer && isFreshCallRef.current) {
      console.log('[AUDIT][DeliveryOfferListener] 🔉 Requisitando áudio para oferta:', currentOffer.id);
      playOfferAudio(currentOffer.id);
      // Marcar como não-fresco para evitar re-plays em re-renders
      isFreshCallRef.current = false;
    } else {
      // Sempre parar quando não estiver em 'ringing' (sem guard de _playingOfferId)
      if (phase !== 'ringing') {
        console.log('[AUDIT][DeliveryOfferListener] 🔇 Parando áudio - Fase:', phase);
        stopMotobyAudio();
      }
    }
  }, [phase, currentOffer?.id]);

  const mapRowToOffer = useCallback(async (row: any): Promise<DeliveryOffer | null> => {
    if (!row?.id) return null;

    const rawValue = Number(row.gross_value ?? row.total_price ?? row.estimated_price_snapshot ?? 0);
    const commRate = Number(row.commission_percent ?? 20);
    const netValue = Number(row.net_value ?? rawValue * (1 - commRate / 100));
    const distKm = Number(row.distance_km_snapshot ?? 0);
    const tempoMin = distKm > 0 ? Math.ceil(distKm * 3) : 15;

    const lojaEndereco = (row.pickup_address_snapshot as string | null) || 'Endereço de Coleta';

    // Textos genéricos de fallback do backend — preferir coords ou nome do cliente
    const GENERIC_DEST = ['Entrega no Cliente', 'Endereço de Entrega', 'Destino do Cliente', 'Destino'];
    const destRaw = (row.dropoff_address_snapshot as string | null)?.trim() ?? null;
    const destIsGeneric = !destRaw || GENERIC_DEST.some(t => destRaw.toLowerCase() === t.toLowerCase());

    let destEndereco: string;
    if (!destIsGeneric) {
      destEndereco = destRaw!;
    } else if (row.dropoff_lat_snapshot != null && row.dropoff_lng_snapshot != null) {
      // Mostrar coordenadas formatadas quando endereço não disponível
      const lat = Number(row.dropoff_lat_snapshot).toFixed(4);
      const lng = Number(row.dropoff_lng_snapshot).toFixed(4);
      destEndereco = `${lat}, ${lng}`;
    } else if (row.customer_name_snapshot) {
      destEndereco = `Entrega para ${row.customer_name_snapshot}`;
    } else {
      destEndereco = 'Ponto de Entrega';
    }

    let lojaNome: string = row.store_name_snapshot || '';
    let lojaLogo: string | null = null;

    if (row.delivery_order_id) {
      try {
        const { data: so } = await supabase
          .from('service_orders')
          .select('store_name, merchant_id')
          .eq('id', row.delivery_order_id)
          .maybeSingle();

        if (so?.store_name) {
          lojaNome = so.store_name;
        }

        if (so?.merchant_id) {
          const { data: ms } = await supabase
            .from('merchant_stores')
            .select('nome_loja, logo_url')
            .eq('user_id', so.merchant_id)
            .maybeSingle();
          
          if (!lojaNome && ms?.nome_loja) lojaNome = ms.nome_loja;
          if (ms?.logo_url) lojaLogo = ms.logo_url;
        }
      } catch {
        // fallback
      }
    }
    lojaNome = lojaNome || 'Loja Parceira';

    return {
      id: row.id,
      regiao: destEndereco,
      distancia_km: distKm,
      tempo_estimado_min: tempoMin,
      valor: rawValue,
      comissao_percent: commRate,
      valor_liquido: netValue,
      comissao_plataforma: rawValue - netValue,
      loja_nome: lojaNome,
      loja_logo: lojaLogo,
      loja_endereco: lojaEndereco,
      loja_bairro: '',
      loja_cidade: '',
      loja_estado: '',
      timer_seconds: 120,
      expires_at: row.expires_at || undefined,
      pickup_lat: row.pickup_lat_snapshot ?? null,
      pickup_lng: row.pickup_lng_snapshot ?? null,
      dropoff_lat: row.dropoff_lat_snapshot ?? null,
      dropoff_lng: row.dropoff_lng_snapshot ?? null,
      descricao_pedido: row.customer_name_snapshot ? `Cliente: ${row.customer_name_snapshot}` : undefined,
      loja_observacao: row.notes_snapshot || undefined,
    } satisfies DeliveryOffer;
  }, []);

  const fetchInitialOffer = useCallback(async () => {
    if (!user?.id) return;
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('delivery_offers')
      .select('*')
      .eq('motoboy_id', user.id)
      .in('status', ['pending', 'open'])
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return;

    const row = data[0];
    if (dismissedIdsRef.current.has(row.id)) return;

    const offer = await mapRowToOffer(row);
    if (offer) {
      const ageMs = row.created_at ? Date.now() - new Date(row.created_at).getTime() : 999999;
      const isVeryRecent = ageMs < 60000; 

      if (isVeryRecent && !seenIdsRef.current.has(offer.id)) {
        isFreshCallRef.current = true;
        seenIdsRef.current.add(offer.id);
      } else {
        isFreshCallRef.current = false;
        seenIdsRef.current.add(offer.id);
      }

      setCurrentOfferSynced(offer);
      setPhase('ringing');
    }
  }, [user?.id, mapRowToOffer, setCurrentOfferSynced]);

  useEffect(() => {
    if (!isActive || !user?.id) {
      setCurrentOfferSynced(null);
      setPhase('idle');
      return;
    }

    fetchInitialOffer();

    const pollInterval = setInterval(() => {
      if (!currentOfferRef.current) fetchInitialOffer();
    }, 25000);

    const channel = supabase
      .channel(`delivery_offers_motoboy_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_offers',
          filter: `motoboy_id=eq.${user.id}`,
        },
        async (payload) => {
          const record = payload.new as any;
          if (!record) return;

          if (!['pending', 'open'].includes(record.status)) {
            // Se já estamos na fase 'accepted', não limpar — o motoboy acabou de aceitar
            // e a tela de confirmação precisa permanecer até ele clicar em "IR PARA A LOJA"
            if (record.status === 'accepted' && currentOfferRef.current?.id === record.id) {
              console.log('[DeliveryOfferListener] Oferta aceita — mantendo tela de confirmação.');
              return;
            }
            const cancelledId = record.id;
            setTimeout(() => {
              if (currentOfferRef.current?.id === cancelledId) {
                stopMotobyAudio();
                setCurrentOfferSynced(null);
                setPhase('idle');
              }
            }, 500);
            return;
          }

          if (record.expires_at && new Date(record.expires_at) < new Date()) return;
          if (dismissedIdsRef.current.has(record.id)) return;

          // ★ GUARD ANTI-DUPLO: Se já há uma oferta ativa sendo mostrada,
          //   ignorar novos INSERTs de ofertas diferentes.
          //   (O BD garante 1 oferta por motoboy; isso é proteção extra no frontend)
          if (payload.eventType === 'INSERT' && currentOfferRef.current !== null) {
            console.log('[DeliveryOfferListener] ⚠️ Ignorando INSERT duplicado — já há oferta ativa:', currentOfferRef.current.id);
            return;
          }

          if (payload.eventType === 'UPDATE' && currentOfferRef.current?.id === record.id) return;

          const offer = await mapRowToOffer(record);
          if (offer) {
            if (!seenIdsRef.current.has(record.id)) {
              isFreshCallRef.current = true; 
              seenIdsRef.current.add(record.id);
            } else {
              isFreshCallRef.current = false;
            }
            setCurrentOfferSynced(offer);
            setPhase('ringing');
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
      // Garantir que o áudio pare ao desmontar
      stopMotobyAudio();
    };
  }, [isActive, user?.id, fetchInitialOffer, mapRowToOffer, setCurrentOfferSynced]);

  const dismiss = useCallback(async (offerId: string) => {
    dismissedIdsRef.current.add(offerId);
    // 🔇 Parar áudio imediatamente (3 camadas de segurança)
    stopMotobyAudio();
    isFreshCallRef.current = false;
    setCurrentOfferSynced(null);
    setPhase('idle');
    // Safety nets: garantir que o áudio pare mesmo em race conditions
    setTimeout(() => stopMotobyAudio(), 150);
    setTimeout(() => stopMotobyAudio(), 500);
    try {
      await supabase.rpc('reject_delivery_offer', { p_offer_id: offerId });
      toast.info('Chamada recusada');
    } catch (err) {
      console.error('Erro ao recusar:', err);
    }
  }, [setCurrentOfferSynced]);

  const accept = useCallback(async (offerId: string) => {
    if (dismissedIdsRef.current.has(offerId)) return;
    stopMotobyAudio();
    isFreshCallRef.current = false;

    try {
      const { data, error } = await supabase.rpc('accept_delivery_offer', {
        p_offer_id: offerId,
      });

      if (error) throw error;
      const response = data as any;

      if (!response?.ok) {
        toast.error(response?.reason || 'Erro ao aceitar oferta.');
        dismissedIdsRef.current.add(offerId);
        setCurrentOfferSynced(null);
        setPhase('idle');
        return;
      }

      // ✅ Fase intermediária: manter oferta visível com dados + armazenar order_id
      dismissedIdsRef.current.add(offerId);
      setAcceptedOrderId(response?.order_id || null);
      setPhase('accepted');
      toast.success('✅ Entrega assumida!');
    } catch (err: any) {
      console.error('Erro ao aceitar:', err);
      const detail = err.message || err.code || "Erro de rede ou permissão.";
      toast.error(`Erro de conexão: ${detail}`);
      
      // 🔥 IMPORTANTE: Resetar estado para parar o som mesmo em caso de erro
      stopMotobyAudio();
      isFreshCallRef.current = false;
      setCurrentOfferSynced(null);
      setPhase('idle');
    }
  }, [setCurrentOfferSynced]);

  /** Chamado pelo botão "IR PARA A LOJA" na tela de aceitação */
  const proceedToAwait = useCallback((offerId: string) => {
    setCurrentOfferSynced(null);
    setPhase('idle');
    setAcceptedOrderId(null);
    navigate(`/motoboy/awaiting?id=${offerId}`);
  }, [navigate, setCurrentOfferSynced]);

  return { currentOffer, phase, accept, dismiss, proceedToAwait, acceptedOrderId };
}
