import { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Navigation, Store, MapPin, Phone,
  MessageCircle, Loader2, CheckCircle2, ArrowRight,
  ExternalLink, Clock, Bike, Package, AlertCircle, Key
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { usePaymentsOrchestrator } from '@/hooks/usePaymentsOrchestrator';
import { useMotoboyCommission } from '@/hooks/useMotoboyCommission';

const RouteMapCanvas = lazy(() => import('@/components/motoboy/RouteMapCanvas'));

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Phase = 'heading_to_store' | 'at_store' | 'heading_to_customer' | 'delivered';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const openGMaps = (lat: number, lng: number) =>
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');

// Deriva um código de entrega determinístico (4 dígitos) a partir do id do pedido,
// diferente do pickup_code. Mesma fórmula usada em MerchantDeliveryView.tsx.
function deriveDeliveryCode(orderId: string, pickupCode?: string | null): string {
  let hash = 0;
  for (let i = 0; i < orderId.length; i++) {
    hash = ((hash << 5) - hash) + orderId.charCodeAt(i);
    hash |= 0;
  }
  let code = (Math.abs(hash) % 9000 + 1000).toString();
  if (pickupCode && code === pickupCode) {
    code = ((Math.abs(hash) + 1) % 9000 + 1000).toString();
  }
  return code;
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function MotoboyAwaitingRide() {
  const navigate    = useNavigate();
  const [sp]        = useSearchParams();
  const offerId     = sp.get('id');
  const { user }    = useAuth();
  const { completeDelivery } = usePaymentsOrchestrator();
  const { commissionRate } = useMotoboyCommission(user?.id);

  const [offerRow,   setOfferRow]   = useState<any>(null);
  const [orderRow,   setOrderRow]   = useState<any>(null);
  const [storeRow,   setStoreRow]   = useState<any>(null);
  const [phase,      setPhase]      = useState<Phase>('heading_to_store');
  const [mPos,       setMPos]       = useState<{ lat: number; lng: number } | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [loadErr,    setLoadErr]    = useState<string | null>(null);
  const [advancing,  setAdvancing]  = useState(false);
  const [panelOpen,  setPanelOpen]  = useState(true);

  // ── Código de retirada ─────────────────────────────────────────────────────
  const [pickupCode,    setPickupCode]    = useState('');
  const [pickupErr,     setPickupErr]     = useState('');
  const [validatingCode, setValidatingCode] = useState(false);

  // ── Código de entrega (mostrado pelo cliente) ──────────────────────────────
  const [deliveryCode, setDeliveryCode] = useState('');
  const [deliveryErr,  setDeliveryErr]  = useState('');
  const [deliveryValidated, setDeliveryValidated] = useState(false);

  // ── Watchref GPS ───────────────────────────────────────────────────────────
  const watchRef = useRef<number | null>(null);

  // ── GPS (não bloqueia loading) ─────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return;
    // enableHighAccuracy: true em AMBAS as chamadas — evita localização por IP/WiFi
    navigator.geolocation.getCurrentPosition(
      (p) => setMPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => console.warn('[GPS]', e.message),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }
    );
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => setMPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => console.warn('[GPS watch]', e.message),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
    );
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current); };
  }, []);

  // ── Carregar dados ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!offerId) { navigate('/motoboy'); return; }

    const load = async () => {
      console.log('[MotoboyAwaiting] offerId:', offerId);
      setLoading(true); setLoadErr(null);
      try {
        // Posição do banco como fallback
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: pres } = await supabase
            .from('motoboy_presence').select('lat,lng').eq('motoboy_id', user.id).maybeSingle();
          if (pres?.lat && !mPos) setMPos({ lat: Number(pres.lat), lng: Number(pres.lng) });
        }

        // Oferta
        const { data: offer, error: offerErr } = await supabase
          .from('delivery_offers').select('*').eq('id', offerId).maybeSingle();
        console.log('[MotoboyAwaiting] offer:', offer, offerErr);
        if (offerErr || !offer) { setLoadErr(offerErr?.message || 'Oferta não encontrada.'); setLoading(false); return; }
        setOfferRow(offer);

        // Pedido
        const orderId = offer.delivery_order_id || offer.service_order_id;
        if (!orderId) { setLoadErr('ID do pedido ausente na oferta.'); setLoading(false); return; }

        const { data: order, error: orderErr } = await supabase
          .from('service_orders').select('*').eq('id', orderId).maybeSingle();
        console.log('[MotoboyAwaiting] order:', order, orderErr);
        if (orderErr || !order) { setLoadErr(orderErr?.message || 'Pedido não encontrado.'); setLoading(false); return; }
        setOrderRow(order);

        // Loja (opcional)
        if (order.merchant_id) {
          const { data: store } = await supabase
            .from('merchant_stores').select('*').eq('user_id', order.merchant_id).maybeSingle();
          if (store) setStoreRow(store);
        }

        setLoading(false);
      } catch (e: any) {
        console.error('[MotoboyAwaiting] erro:', e);
        setLoadErr(e?.message || 'Erro inesperado.'); setLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerId]);

  // ── Validar código de retirada via RPC seguro ──────────────────────────────
  const handleValidatePickup = useCallback(async () => {
    if (pickupCode.length !== 4 || !orderRow?.id) return;
    setValidatingCode(true); setPickupErr('');
    try {
      // Valida via RPC — o código nunca é exposto ao frontend
      const { data, error } = await supabase.rpc('validate_pickup_code', {
        p_order_id: orderRow.id,
        p_code: pickupCode.trim(),
      });
      if (error) throw error;

      const result = data as { ok: boolean; reason?: string; message?: string };

      if (!result.ok) {
        setPickupErr(result.reason || 'Código inválido. Verifique com o lojista.');
        // Vibrar (feedback háptico em mobile)
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        return;
      }

      // ✅ Código válido — avançar para caminho do cliente
      setPhase('heading_to_customer');
      setPickupCode(''); setPickupErr('');
      toast.success('📦 Retirada confirmada! A caminho do cliente.');
    } catch (e: any) {
      console.error('[ValidatePickup]', e);
      setPickupErr(e.message || 'Erro ao validar código. Tente novamente.');
    } finally { setValidatingCode(false); }
  }, [pickupCode, orderRow]);

  /* Após a RPC complete_delivery_order marcar a entrega concluída, libera
     o dinheiro reservado: escrow → motoboy (líquido) + plataforma (fee).
     Comissão calculada a partir do tier atual do motoboy via useMotoboyCommission. */
  const settleEscrowToMotoboy = useCallback(async () => {
    if (!user?.id || !orderRow?.id || !orderRow?.total_price) {
      console.warn('[settleEscrowToMotoboy] dados ausentes — pulando liberação');
      return;
    }
    const grossCents = Math.round(Number(orderRow.total_price) * 100);
    const feeCents = Math.round((grossCents * (commissionRate ?? 25)) / 100);
    try {
      await completeDelivery({
        motoboy_owner_id: user.id,
        credits_cost_cents: grossCents,
        platform_fee_cents: feeCents,
        delivery_id: orderRow.id,
      });
    } catch (err: any) {
      // Não derruba o UX da finalização — a entrega já foi marcada como
      // concluída. Loga e avisa silencioso para o motoboy.
      console.error('[settleEscrowToMotoboy] falhou:', err);
      toast.warning('Entrega finalizada, mas a liberação do pagamento falhou', {
        description: 'O suporte vai regularizar. Não tente refinalizar.',
      });
    }
  }, [user?.id, orderRow, commissionRate, completeDelivery]);

  // ── Validar código de entrega + finalizar em um único passo ──────────────
  const handleValidateDelivery = useCallback(async () => {
    if (!orderRow?.id || advancing) return;
    const expected = deriveDeliveryCode(orderRow.id, orderRow.pickup_code);
    const provided = deliveryCode.trim();
    if (provided !== expected) {
      setDeliveryErr('Código incorreto. Peça ao cliente para conferir com o lojista.');
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      return;
    }
    setDeliveryErr('');
    setDeliveryValidated(true);
    setAdvancing(true);
    try {
      const { error } = await supabase.rpc('complete_delivery_order', { p_order_id: orderRow.id });
      if (error) throw error;
      // Libera o escrow do lojista pro motoboy ANTES de navegar (assim ele já vê o saldo subir)
      await settleEscrowToMotoboy();
      setPhase('delivered');
      toast.success('🎉 Entrega finalizada!');
      setTimeout(() => navigate('/motoboy'), 2500);
    } catch (e: any) {
      console.error('[Finalize]', e);
      toast.error(e.message || 'Erro ao finalizar.');
      setDeliveryErr(e.message || 'Erro ao finalizar. Tente novamente.');
      setDeliveryValidated(false);
    } finally {
      setAdvancing(false);
    }
  }, [orderRow, deliveryCode, advancing, navigate, settleEscrowToMotoboy]);

  // ── Finalizar entrega (fallback manual se necessário) ─────────────────────
  const handleFinalize = useCallback(async () => {
    if (!orderRow?.id || advancing) return;
    if (!deliveryValidated) {
      setDeliveryErr('Valide o código do cliente antes de finalizar.');
      return;
    }
    setAdvancing(true);
    try {
      const { error } = await supabase.rpc('complete_delivery_order', { p_order_id: orderRow.id });
      if (error) throw error;
      await settleEscrowToMotoboy();
      setPhase('delivered');
      toast.success('🎉 Entrega finalizada!');
      setTimeout(() => navigate('/motoboy'), 2500);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao finalizar.');
    } finally { setAdvancing(false); }
  }, [orderRow, advancing, navigate, deliveryValidated, settleEscrowToMotoboy]);

  // ── Chegar na loja ─────────────────────────────────────────────────────────
  const handleArrivedAtStore = useCallback(() => {
    setPhase('at_store');
    toast.success('✅ Chegou na loja! Digite o código de retirada.');
  }, []);

  // ── Valores calculados ─────────────────────────────────────────────────────
  const bruto     = Number(orderRow?.total_price ?? 0);
  const commRate  = Number(orderRow?.commission_percent ?? 25);
  const earnings  = orderRow?.motoboy_earnings_cents != null
    ? Number(orderRow.motoboy_earnings_cents) / 100
    : bruto * (1 - commRate / 100);
  const distKm    = orderRow?.distance_km != null ? Number(orderRow.distance_km) : null;
  const tempoMin  = distKm ? Math.ceil(distKm * 3.5) : null;
  const pickupLat = orderRow?.pickup_lat != null ? Number(orderRow.pickup_lat) : null;
  const pickupLng = orderRow?.pickup_lng != null ? Number(orderRow.pickup_lng) : null;
  const dropLat   = orderRow?.destination_lat != null ? Number(orderRow.destination_lat) : null;
  const dropLng   = orderRow?.destination_lng != null ? Number(orderRow.destination_lng) : null;

  // Nome e endereço da loja (dinâmico por oferta)
  const storeName = storeRow?.nome_loja || offerRow?.store_name_snapshot || 'Loja Parceira';
  const storePhone= storeRow?.whatsapp || storeRow?.phone || null;
  const storeAddrParts = storeRow
    ? [storeRow.rua, storeRow.numero, storeRow.bairro, storeRow.cidade].filter(Boolean)
    : [];
  const storeAddr = storeAddrParts.length > 0
    ? storeAddrParts.join(', ')
    : (orderRow?.pickup_location || offerRow?.pickup_address_snapshot || 'Endereço da loja');
  const customerAddr = orderRow?.destination || offerRow?.dropoff_address_snapshot || 'Endereço do cliente';

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="w-20 h-20 rounded-full border-4 border-[#FF6B00]/20 border-t-[#FF6B00] animate-spin" />
        <Bike className="absolute inset-0 m-auto h-8 w-8 text-[#FF6B00]" />
      </div>
      <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Carregando corrida...</p>
    </div>
  );

  // ── Erro ───────────────────────────────────────────────────────────────────
  if (loadErr) return (
    <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertCircle className="h-12 w-12 text-red-500/60" />
      <h2 className="text-white font-black text-lg">Erro ao carregar</h2>
      <p className="text-white/40 text-sm leading-relaxed">{loadErr}</p>
      <button onClick={() => navigate('/motoboy')}
        className="mt-4 px-6 py-3 rounded-2xl bg-[#FF6B00] text-black font-black text-sm">
        Voltar ao Painel
      </button>
    </div>
  );

  // ── Entregue ───────────────────────────────────────────────────────────────
  if (phase === 'delivered') return (
    <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center gap-6 p-8">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', duration: 0.6 }}
        className="w-32 h-32 rounded-full bg-[#34C759]/10 border-4 border-[#34C759]/30 flex items-center justify-center">
        <CheckCircle2 className="h-16 w-16 text-[#34C759]" />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="text-center">
        <h1 className="text-3xl font-black text-white italic uppercase">Entrega Concluída!</h1>
        <p className="text-white/50 mt-2">Você ganhou <span className="text-[#34C759] font-black text-xl">{fmt(earnings)}</span></p>
      </motion.div>
    </div>
  );

  // ── Tela principal ─────────────────────────────────────────────────────────
  const isToStore  = phase === 'heading_to_store';
  const isAtStore  = phase === 'at_store';
  const isToClient = phase === 'heading_to_customer';
  const accent     = isToStore ? '#FF6B00' : isAtStore ? '#FFAD00' : '#34C759';

  // Configuração do mapa por fase
  const mapOriginLat = isToStore ? mPos?.lat ?? null : pickupLat;
  const mapOriginLng = isToStore ? mPos?.lng ?? null : pickupLng;
  const mapDestLat   = isToStore ? pickupLat : dropLat;
  const mapDestLng   = isToStore ? pickupLng : dropLng;
  const mapPolyline  = isToStore ? (offerRow?.pickup_polyline ?? null) : null;
  const gmpDest      = mapDestLat != null ? { lat: mapDestLat, lng: mapDestLng! } : null;
  const hasMap       = mapOriginLat != null && mapDestLat != null;

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] overflow-hidden">

      {/* ── MAPA TELA CHEIA ── */}
      <div className="absolute inset-0">
        {hasMap ? (
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center bg-[#111]"><Loader2 className="h-8 w-8 text-[#FF6B00] animate-spin" /></div>}>
            <RouteMapCanvas
              instanceId={`await-${offerId}-${phase}`}
              originLat={mapOriginLat!} originLng={mapOriginLng!}
              destinationLat={mapDestLat!} destinationLng={mapDestLng!}
              encodedPolyline={mapPolyline}
              routeColor={accent} outlineColor={accent}
              originMarkerColor={accent} destinationMarkerColor="#fff"
              interactive
            />
          </Suspense>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[#111] gap-3">
            <Navigation className="h-16 w-16 text-[#FF6B00]/20" />
            <p className="text-white/20 text-sm">Aguardando localização...</p>
          </div>
        )}
      </div>

      {/* Gradiente */}
      <div className="absolute bottom-0 left-0 right-0 h-3/4 bg-gradient-to-t from-black via-black/90 to-transparent pointer-events-none" />

      {/* ── HEADER ── */}
      <div className="relative z-10 px-5 pt-4 flex items-center justify-between">
        <motion.div key={phase} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center backdrop-blur-md border"
            style={{ background: `${accent}22`, borderColor: `${accent}44` }}>
            {isToStore && <Store className="h-5 w-5" style={{ color: accent }} />}
            {isAtStore && <Key className="h-5 w-5" style={{ color: accent }} />}
            {isToClient && <MapPin className="h-5 w-5" style={{ color: accent }} />}
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: accent }}>
              {isToStore ? 'A caminho da loja' : isAtStore ? 'Na loja — Código de retirada' : 'A caminho do cliente'}
            </p>
            <p className="text-[11px] text-white/40">
              {isToStore ? 'Siga a rota para retirar o pedido' : isAtStore ? 'Informe o código ao lojista' : 'Entregue e confirme'}
            </p>
          </div>
        </motion.div>
        {gmpDest && (
          <button onClick={() => openGMaps(gmpDest.lat, gmpDest.lng)}
            className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center active:scale-90 transition-transform">
            <ExternalLink className="h-4 w-4 text-white/70" />
          </button>
        )}
      </div>

      {/* ── PAINEL INFERIOR ── */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <button onClick={() => setPanelOpen(p => !p)} className="w-full flex justify-center py-2">
          <div className="w-12 h-1.5 rounded-full bg-white/20" />
        </button>

        <AnimatePresence>
          {panelOpen && (
            <motion.div key="panel"
              initial={{ y: 320, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 320, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="bg-[#111]/96 backdrop-blur-xl rounded-t-[2rem] px-5 pt-5 pb-10 border-t border-white/5 space-y-4">

              {/* ── Info da loja (sempre visível) ── */}
              <div className="flex items-start gap-3 bg-white/5 rounded-2xl p-4">
                {storeRow?.logo_url ? (
                  <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-white/10">
                    <img src={storeRow.logo_url} alt={storeName} className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.classList.add('flex','items-center','justify-center'); (e.target as HTMLImageElement).parentElement!.style.background = `${accent}18`; (e.target as HTMLImageElement).insertAdjacentHTML('afterend', `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/></svg>`); }}
                    />
                  </div>
                ) : (
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${accent}18` }}>
                    <Store className="h-5 w-5" style={{ color: accent }} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-0.5">
                    {isToClient ? 'Origem da retirada' : 'Retirada em'}
                  </p>
                  <h2 className="text-base font-black text-white leading-tight">{storeName}</h2>
                  <p className="text-xs text-white/50 mt-0.5 leading-snug">{storeAddr}</p>
                </div>
                {pickupLat != null && (
                  <button onClick={() => openGMaps(pickupLat, pickupLng!)}
                    className="w-9 h-9 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center shrink-0 active:scale-90 transition-transform">
                    <Navigation className="h-4 w-4 text-white/50" />
                  </button>
                )}
              </div>

              {/* ── Destino do cliente (apenas heading_to_customer) ── */}
              {isToClient && (
                <div className="flex items-start gap-3 bg-white/5 rounded-2xl p-4">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-[#34C759]/10">
                    <MapPin className="h-5 w-5 text-[#34C759]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-0.5">Entrega em</p>
                    <p className="text-sm font-bold text-white leading-tight">{customerAddr}</p>
                  </div>
                  {dropLat != null && (
                    <button onClick={() => openGMaps(dropLat, dropLng!)}
                      className="w-9 h-9 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center shrink-0 active:scale-90 transition-transform">
                      <Navigation className="h-4 w-4 text-white/50" />
                    </button>
                  )}
                </div>
              )}

              {/* ── Stats ── */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/5 rounded-2xl p-3 text-center">
                  <Clock className="h-4 w-4 mx-auto mb-1" style={{ color: accent }} />
                  <p className="text-sm font-black text-white">{tempoMin ?? '—'}</p>
                  <p className="text-[10px] text-white/40">min</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-3 text-center">
                  <Navigation className="h-4 w-4 mx-auto mb-1" style={{ color: accent }} />
                  <p className="text-sm font-black text-white">{distKm?.toFixed(1) ?? '—'}</p>
                  <p className="text-[10px] text-white/40">km</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-3 text-center">
                  <p className="text-[11px] font-black text-[#34C759]">{fmt(earnings)}</p>
                  <p className="text-[10px] text-white/40 mt-0.5">ganhos</p>
                </div>
              </div>

              {/* ── Contato loja ── */}
              {storePhone && (
                <div className="flex gap-2">
                  <button onClick={() => window.open(`https://wa.me/55${storePhone.replace(/\D/g, '')}`)}
                    className="flex-1 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center gap-2 text-sm font-bold text-white active:scale-95 transition-transform">
                    <MessageCircle className="h-4 w-4 text-[#25D366]" /> WhatsApp Loja
                  </button>
                  <button onClick={() => window.open(`tel:${storePhone.replace(/\D/g, '')}`)}
                    className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-95 transition-transform">
                    <Phone className="h-4 w-4 text-white/50" />
                  </button>
                </div>
              )}

              {/* ════ CTA por fase ════ */}

              {/* FASE 1 — botão "Cheguei na Loja" */}
              {isToStore && (
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleArrivedAtStore}
                  className="w-full h-16 rounded-2xl font-black text-base uppercase italic flex items-center justify-center gap-3 shadow-2xl text-black"
                  style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, boxShadow: `0 16px 40px ${accent}40` }}>
                  Cheguei na Loja <ArrowRight className="h-5 w-5 ml-1" />
                </motion.button>
              )}

              {/* FASE 2 — campo de código de retirada */}
              {isAtStore && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#FFAD00]">
                    <Key className="h-4 w-4" />
                    <span>Código de Retirada (fornecido pelo lojista)</span>
                  </div>

                  {/* Campo único alfanumérico — aceita letras e números */}
                  <div className="relative">
                    <input
                      id="pickup-code-input"
                      type="text"
                      inputMode="text"
                      autoCapitalize="characters"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={12}
                      placeholder="Ex: A3B7 ou 1234"
                      value={pickupCode}
                      onChange={(e) => {
                        // Aceita letras e números — remove apenas caracteres especiais
                        const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                        setPickupCode(val);
                        setPickupErr('');
                      }}
                      className="w-full h-16 rounded-2xl bg-white/10 border-2 text-white text-3xl font-black text-center outline-none tracking-[0.3em] transition-all placeholder:text-white/20 placeholder:text-base placeholder:tracking-normal"
                      style={{ borderColor: pickupCode.length > 0 ? '#FFAD00' : 'rgba(255,255,255,0.1)' }}
                    />
                    {pickupCode.length > 0 && (
                      <button
                        onClick={() => { setPickupCode(''); setPickupErr(''); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors text-xl font-bold"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-white/30 text-center">
                    O código pode conter letras e números (maiúsculos)
                  </p>

                  {pickupErr && (
                    <div className="flex items-center gap-2 text-sm text-red-400 justify-center">
                      <AlertCircle className="h-4 w-4" /> {pickupErr}
                    </div>
                  )}

                  <motion.button whileTap={{ scale: 0.97 }}
                    onClick={handleValidatePickup}
                    disabled={pickupCode.length < 1 || validatingCode}
                    className="w-full h-16 rounded-2xl font-black text-base uppercase italic flex items-center justify-center gap-3 shadow-2xl transition-all"
                    style={{
                      background: pickupCode.length >= 1 ? `linear-gradient(135deg, #FFAD00, #FF8A00)` : 'rgba(255,255,255,0.1)',
                      boxShadow: pickupCode.length >= 1 ? '0 16px 40px rgba(255,173,0,0.35)' : 'none',
                      color: pickupCode.length >= 1 ? '#000' : 'rgba(255,255,255,0.3)',
                    }}>
                    {validatingCode
                      ? <Loader2 className="h-5 w-5 animate-spin" />
                      : <><Package className="h-5 w-5" /> Confirmar Retirada</>
                    }
                  </motion.button>
                </div>
              )}

              {/* FASE 3 — código do cliente + finalizar entrega */}
              {isToClient && (
                <div className="space-y-3">
                  {!deliveryValidated && (
                    <>
                      <div className="flex items-center gap-2 text-sm font-bold text-[#34C759]">
                        <Key className="h-4 w-4" />
                        <span>Código do Cliente (ele vai te mostrar)</span>
                      </div>
                      <p className="text-[11px] text-white/50 leading-snug">
                        Peça o código que o lojista enviou ao cliente. Confira antes de entregar o produto.
                      </p>

                      <div className="relative">
                        <input
                          id="delivery-code-input"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          maxLength={4}
                          placeholder="0000"
                          value={deliveryCode}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                            setDeliveryCode(val);
                            setDeliveryErr('');
                          }}
                          className="w-full h-16 rounded-2xl bg-white/10 border-2 text-white text-3xl font-black text-center outline-none tracking-[0.3em] transition-all placeholder:text-white/20"
                          style={{ borderColor: deliveryCode.length > 0 ? '#34C759' : 'rgba(255,255,255,0.1)' }}
                        />
                        {deliveryCode.length > 0 && (
                          <button
                            onClick={() => { setDeliveryCode(''); setDeliveryErr(''); }}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors text-xl font-bold"
                          >
                            ×
                          </button>
                        )}
                      </div>

                      {deliveryErr && (
                        <div className="flex items-center gap-2 text-sm text-red-400 justify-center">
                          <AlertCircle className="h-4 w-4" /> {deliveryErr}
                        </div>
                      )}

                      <motion.button whileTap={{ scale: 0.97 }}
                        onClick={handleValidateDelivery}
                        disabled={deliveryCode.length !== 4 || advancing}
                        className="w-full h-16 rounded-2xl font-black text-base uppercase italic flex items-center justify-center gap-3 shadow-2xl transition-all"
                        style={{
                          background: deliveryCode.length === 4 ? 'linear-gradient(135deg, #34C759, #22a748)' : 'rgba(255,255,255,0.1)',
                          boxShadow: deliveryCode.length === 4 ? '0 16px 40px rgba(52,199,89,0.35)' : 'none',
                          color: deliveryCode.length === 4 ? '#fff' : 'rgba(255,255,255,0.3)',
                        }}>
                        {advancing
                          ? <Loader2 className="h-5 w-5 animate-spin" />
                          : <><Key className="h-5 w-5" /> Confirmar e Finalizar Entrega</>}
                      </motion.button>
                    </>
                  )}

                  {deliveryValidated && (
                    <motion.button whileTap={{ scale: 0.97 }} onClick={handleFinalize} disabled={advancing}
                      className="w-full h-16 rounded-2xl font-black text-base uppercase italic flex items-center justify-center gap-3 shadow-2xl"
                      style={{ background: 'linear-gradient(135deg, #34C759, #22a748)', boxShadow: '0 16px 40px rgba(52,199,89,0.35)', color: '#fff' }}>
                      {advancing ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Finalizar Entrega <ArrowRight className="h-5 w-5" /></>}
                    </motion.button>
                  )}
                </div>
              )}

            </motion.div>
          )}
        </AnimatePresence>

        {/* CTA mínimo quando painel fechado */}
        {!panelOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 pb-8">
            <button onClick={() => setPanelOpen(true)}
              className="w-full h-14 rounded-2xl font-black text-sm uppercase italic flex items-center justify-center gap-2"
              style={{ background: accent, color: '#000' }}>
              {isToStore ? 'Cheguei na Loja' : isAtStore ? 'Código de Retirada' : 'Finalizar Entrega'}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
