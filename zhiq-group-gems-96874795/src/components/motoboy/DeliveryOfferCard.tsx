import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import {
  MapPin, Store, ArrowRight, Loader2,
  Navigation, X, CheckCircle, ChevronDown, Bike, Package
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { getCityCoordinates } from '@/lib/cityCoordinates';
import { geocodeAddress } from '@/skills/maps/geocodeService';
import { brazilCoordsOrNull } from '@/lib/map/brazilBounds';
import { calculateRoute } from '@/skills/maps/routeService';

const OfferMiniMap = lazy(() => import('./OfferMiniMap'));

export interface DeliveryOffer {
  id: string;
  regiao: string;
  distancia_km: number;
  tempo_estimado_min: number;
  valor: number;
  comissao_percent?: number;
  grupos_ativos?: number;
  valor_liquido?: number;
  comissao_plataforma?: number;
  loja_nome?: string;
  loja_logo?: string | null;
  loja_endereco?: string;
  loja_categoria?: string;
  loja_bairro?: string;
  loja_cidade?: string;
  loja_estado?: string;
  loja_telefone?: string;
  loja_whatsapp?: string;
  loja_observacao?: string;
  descricao_pedido?: string;
  distancia_ate_loja_km?: number;
  distancia_loja_cliente_km?: number;
  timer_seconds?: number;
  expires_at?: string;
  route_polyline?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
}

interface DeliveryOfferCardProps {
  offer: DeliveryOffer;
  onAccept: (offerId: string) => void;
  onDismiss: (offerId: string) => void;
}

/** Haversine distance in km */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtKm(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function fmtCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

type Stage = 'notify' | 'evaluate';

export default function DeliveryOfferCard({ offer, onAccept, onDismiss }: DeliveryOfferCardProps) {
  const [stage, setStage] = useState<Stage>('notify');
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isCardCollapsed, setIsCardCollapsed] = useState(false);
  const [remaining, setRemaining] = useState(offer.timer_seconds ?? 120);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { user } = useAuth();
  const [motoboyCity, setMotoboyCity] = useState('');
  const [motoboyName, setMotoboyName] = useState('');
  const [motoboyAvatar, setMotoboyAvatar] = useState<string | null>(null);
  const [cityCoords, setCityCoords] = useState<{ lat: number; lng: number } | null>(null);

  // POSIÇÃO = ONDE O MOTOBOY ESTÁ AGORA (GPS), com 2 proteções:
  //  • leitura por IP (ex.: "São Paulo" com o motoboy no MT) chega com
  //    accuracy de dezenas de km → é DESCARTADA;
  //  • sem GPS preciso → cai no endereço do CADASTRO (formulário).
  const { position: gpsPos, requestLocation } = useGeolocation();
  useEffect(() => { requestLocation(); }, [requestLocation]);

  // Cadastro (fallback): select('*') defensivo — colunas variam entre cópias
  // do banco e um 400 aqui derrubava tudo pro fallback fixo de Blumenau.
  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      (supabase.from('motoboy_profiles') as any)
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('avatar_url, name, cidade, estado')
        .eq('id', user.id)
        .maybeSingle(),
    ])
      .then(async ([motoboyRes, profileRes]) => {
        const data: any = motoboyRes.data;
        const profile: any = profileRes.data;
        setMotoboyName(
          [data?.nome, data?.sobrenome].filter(Boolean).join(' ') || profile?.name || '',
        );
        setMotoboyAvatar(profile?.avatar_url || data?.avatar_url || null);

        const cityLabel = [data?.bairro, data?.cidade, data?.estado].filter(Boolean).join(', ')
          || [profile?.cidade, profile?.estado].filter(Boolean).join(', ');
        setMotoboyCity(cityLabel || 'Localização não cadastrada');

        // Coordenadas do cadastro: residência → cidade (lista/geocode) →
        // cidade do perfil geral. SEM fallback fixo, e TODA coordenada passa
        // pelo filtro do Brasil (sinal trocado jogava o pino na Venezuela).
        const residencia = brazilCoordsOrNull(data?.latitude_residencia, data?.longitude_residencia);
        if (residencia) { setCityCoords(residencia); return; }
        const cidade = data?.cidade || profile?.cidade;
        if (!cidade) return;
        const hardRaw = getCityCoordinates(cidade);
        const hard = brazilCoordsOrNull(hardRaw?.lat, hardRaw?.lng);
        if (hard) { setCityCoords(hard); return; }
        const addressQuery = [data?.bairro, cidade, data?.estado || profile?.estado]
          .filter(Boolean).join(', ');
        const geo = await geocodeAddress(addressQuery);
        const geoOk = brazilCoordsOrNull(geo?.lat, geo?.lng);
        if (geoOk) setCityCoords(geoOk);
      })
      .catch((err) => {
        console.error('Error fetching motoboy profile:', err);
      });
  }, [user?.id]);

  // GPS só vale se for PRECISO (≤ 5 km) E dentro do Brasil. Localização por
  // IP (ex.: gateway da Starlink) pode cair em outro país e até reportar
  // accuracy "boa" — o filtro geográfico corta esses casos.
  // Plausibilidade: mesmo "preciso" e no Brasil, a +150km da coleta não é
  // onde o motoboy está (Starlink já entregou São Paulo assim) → cadastro.
  const gpsIsPrecise =
    !!gpsPos &&
    gpsPos.accuracy != null && gpsPos.accuracy <= 5000 &&
    brazilCoordsOrNull(gpsPos.lat, gpsPos.lng) != null &&
    !(offer.pickup_lat != null && offer.pickup_lng != null &&
      haversine(gpsPos.lat, gpsPos.lng, offer.pickup_lat, offer.pickup_lng) > 150);

  // Posição efetiva: GPS preciso (onde está AGORA) > cadastro do formulário.
  // Sem nada → null (mapa esconde o pino e centraliza na coleta — nunca
  // inventa um lugar tipo Blumenau).
  const effectivePos = gpsIsPrecise ? gpsPos : cityCoords;

  // Bloquear rolagem do body enquanto o modal estiver montado
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  useEffect(() => {
    let initialRemaining = offer.timer_seconds ?? 120;
    if (offer.expires_at) {
      const exp = new Date(offer.expires_at).getTime();
      const now = Date.now();
      initialRemaining = Math.max(0, Math.floor((exp - now) / 1000));
    }
    setRemaining(initialRemaining);

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) { if (intervalRef.current) clearInterval(intervalRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [offer.expires_at, offer.timer_seconds]);

  const isExpired = remaining <= 0;
  const isUrgent = remaining <= 15 && !isExpired;
  const progress = Math.max(0, (remaining / (offer.timer_seconds ?? 120)) * 100);

  const distToPickup = cityCoords && offer.pickup_lat && offer.pickup_lng
    ? haversine(cityCoords.lat, cityCoords.lng, offer.pickup_lat, offer.pickup_lng)
    : null;

  const distValid = distToPickup !== null && distToPickup < 100;
  const distPickupToDropoff = offer.distancia_km || offer.distancia_loja_cliente_km || 0;
  const valorLiquido = offer.valor_liquido ?? offer.valor;

  // ── DISTÂNCIAS REAIS POR VIAS (Mapbox Directions — não linha reta) ────────
  // Perna A (Você → Loja): recalculada a CADA oferta com a posição atual do
  // motoboy. Perna B (Loja → Cliente): rota real; fallback = distance_km
  // gravado na criação do pedido (que já veio de rota no mapa do cliente).
  const [legToStore, setLegToStore] =
    useState<{ km: number; min: number } | null>(null);
  const [legStoreToClient, setLegStoreToClient] =
    useState<{ km: number; min: number } | null>(null);

  useEffect(() => {
    let alive = true;
    if (!effectivePos || offer.pickup_lat == null || offer.pickup_lng == null) {
      setLegToStore(null);
      return;
    }
    calculateRoute(effectivePos, { lat: offer.pickup_lat, lng: offer.pickup_lng })
      .then((r) => {
        if (!alive) return;
        if (r) {
          setLegToStore({ km: r.distance / 1000, min: Math.max(1, Math.round(r.duration / 60)) });
        } else {
          // Sem rota (API indisponível): estimativa por reta + fator urbano.
          const km = haversine(effectivePos.lat, effectivePos.lng, offer.pickup_lat!, offer.pickup_lng!) * 1.3;
          setLegToStore({ km, min: Math.max(1, Math.round(km * 3)) });
        }
      });
    return () => { alive = false; };
  }, [effectivePos?.lat, effectivePos?.lng, offer.pickup_lat, offer.pickup_lng]);

  useEffect(() => {
    let alive = true;
    const fallback = () => {
      if (distPickupToDropoff > 0) {
        setLegStoreToClient({
          km: distPickupToDropoff,
          min: Math.max(1, Math.round(distPickupToDropoff * 3)),
        });
      }
    };
    if (offer.pickup_lat == null || offer.pickup_lng == null ||
        offer.dropoff_lat == null || offer.dropoff_lng == null) {
      fallback();
      return;
    }
    calculateRoute(
      { lat: offer.pickup_lat, lng: offer.pickup_lng },
      { lat: offer.dropoff_lat, lng: offer.dropoff_lng },
    ).then((r) => {
      if (!alive) return;
      if (r) {
        setLegStoreToClient({ km: r.distance / 1000, min: Math.max(1, Math.round(r.duration / 60)) });
      } else {
        fallback();
      }
    });
    return () => { alive = false; };
  }, [offer.pickup_lat, offer.pickup_lng, offer.dropoff_lat, offer.dropoff_lng, distPickupToDropoff]);

  // Total soma as pernas DISPONÍVEIS: sem posição do motoboy (ex.: cadastro
  // sem coordenadas), o total vale a perna Loja→Cliente — nunca fica preso
  // em "calculando…".
  const totalKm = legStoreToClient ? (legToStore?.km ?? 0) + legStoreToClient.km : null;
  const totalMin = legStoreToClient ? (legToStore?.min ?? 0) + legStoreToClient.min : null;
  // Rótulo da perna A: '—' quando não há posição conhecida do motoboy.
  const legAText = legToStore
    ? `${fmtKm(legToStore.km)} • ${legToStore.min} min`
    : (effectivePos ? 'calculando…' : '—');

  const handleEvaluate = useCallback(() => {
    if (isExpired || isAccepting) return;
    setStage('evaluate');
  }, [isExpired, isAccepting]);

  const handleAccept = useCallback(() => {
    if (isExpired || isAccepting) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsAccepting(true);
    onAccept(offer.id);
  }, [offer.id, onAccept, isExpired, isAccepting]);

  const handleDismiss = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRejecting(true);
    onDismiss(offer.id);
  }, [offer.id, onDismiss]);

  const TimerBar = (
    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
      <motion.div
        className={cn('h-full rounded-full transition-colors duration-500', isUrgent ? 'bg-red-500' : 'bg-[#ffb800]')}
        initial={{ width: '100%' }}
        animate={{ width: `${progress}%` }}
        transition={{ ease: 'linear' }}
      />
    </div>
  );

  // ── ETAPA 1: Notificação Compacta ─────────────────────────────────────────
  if (stage === 'notify') {
    return (
      <AnimatePresence>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center py-6 px-4 bg-[#FF6A00]/70 backdrop-blur-sm">

          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="flex flex-col w-full max-w-[1080px]"
          >
            <div className={cn(
              'w-full rounded-[28px] border-2 bg-[#0C3B24] text-white shadow-[0_-8px_60px_rgba(255,184,0,0.3)] overflow-hidden',
              isExpired ? 'border-slate-600 grayscale' : isUrgent ? 'border-red-500' : 'border-[#ffb800]'
            )}>
            {/* Logo da Plataforma (dentro do card) */}
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 18, stiffness: 280, delay: 0.12 }}
              className="w-full flex justify-center pt-6 pb-3"
            >
              <img
                src="/assets/brand/viagg-tx8-logo-premium.png"
                alt="Viagg-TX8"
                className="h-[67px] object-contain drop-shadow-2xl"
                draggable={false}
              />
            </motion.div>

            {/* Barra de tempo */}
            <div className="px-6 pt-2">{TimerBar}</div>

            {/* Header */}
            <div className="flex items-center gap-3 px-6 pt-4 pb-3">
              {/* Foto: logo da loja OU avatar do cliente (chamada de usuário).
                  Sem imagem (cliente sem foto/loja) → NÃO mostra o logo padrão
                  de loja — some com o quadro. */}
              {(offer.loja_logo || (offer as any).merchant?.logo_url) && (
                <motion.div
                  animate={!isExpired ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 1.8 }}
                  className="w-20 h-20 rounded-xl bg-[#0C3B24] flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(255,184,0,0.5)] overflow-hidden border-2 border-[#ffb800]"
                >
                  <img
                    src={offer.loja_logo || (offer as any).merchant?.logo_url}
                    alt={offer.loja_nome || 'Solicitante'}
                    className="w-full h-full object-cover"
                  />
                </motion.div>
              )}
              <div className="flex-1 min-w-0 flex flex-col items-center text-center">
                <p className={cn('text-[11px] font-black uppercase tracking-widest flex items-center gap-1', isUrgent ? 'text-red-400' : 'text-[#ffb800]')}>
                  {!isExpired && <span className="w-2 h-2 rounded-full animate-pulse bg-current" />}
                  {isExpired ? 'Oferta Expirada' : isUrgent ? `Urgente — ${remaining}s` : `Nova Entrega — ${remaining}s`}
                </p>
                <p className="text-base font-black text-white truncate leading-tight mt-1">
                  {offer.loja_nome || 'Loja Parceira'}
                </p>
              </div>
              <div className="text-center shrink-0">
                <p className="text-xs text-white/40">Você recebe</p>
                <p className="text-xl font-black text-[#00ff00]">{fmtCurrency(valorLiquido)}</p>
              </div>
            </div>

            {/* Logística completa ANTES do aceite: Você→Loja, Loja→Cliente,
                Total — distâncias/tempos REAIS por vias (Mapbox Directions) */}
            <div className="px-6 pb-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-white/70">
                  <Navigation className="h-3.5 w-3.5 text-[#ffb800]" /> Você → Loja
                </span>
                <span className="font-black text-white">
                  {legAText}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-white/70">
                  <Store className="h-3.5 w-3.5 text-[#34C759]" /> Loja → Cliente
                </span>
                <span className="font-black text-white">
                  {legStoreToClient ? `${fmtKm(legStoreToClient.km)} • ${legStoreToClient.min} min` : 'calculando…'}
                </span>
              </div>
              <div className="border-t border-white/10 pt-1.5 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-bold text-[#ffb800]">
                  <MapPin className="h-3.5 w-3.5" /> Total
                </span>
                <span className="font-black text-[#ffb800]">
                  {totalKm != null ? `${fmtKm(totalKm)} • ${totalMin} min` : '—'}
                </span>
              </div>
            </div>

            {/* Botões */}
            <div className="px-6 pb-6 space-y-2">
              {!isExpired ? (
                <Button
                  onClick={handleEvaluate}
                  disabled={isAccepting || isRejecting}
                  className="w-full h-14 bg-[#ffb800] hover:bg-[#ff9500] text-black font-black text-base rounded-2xl shadow-[0_8px_30px_rgba(255,184,0,0.3)] active:scale-95 transition-all uppercase italic"
                >
                  <span className="flex items-center gap-2">
                    Avaliar Corrida <ArrowRight className="h-4 w-4" />
                  </span>
                </Button>
              ) : (
                <Button disabled className="w-full h-14 bg-white/5 text-white/20 font-black text-base rounded-2xl uppercase italic">
                  Expirada
                </Button>
              )}
              <button
                onClick={handleDismiss}
                disabled={isAccepting || isRejecting}
                className="w-full py-1.5 text-xs font-bold text-white/30 hover:text-red-400 transition-colors uppercase tracking-widest"
              >
                {isRejecting ? 'Recusando...' : 'Recusar'}
              </button>
            </div>
            </div>{/* fim card */}
          </motion.div>
        </div>
      </AnimatePresence>
    );
  }

  // ── ETAPA 2: Tela de Avaliação Completa ───────────────────────────────────
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: '100%' }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="fixed inset-0 z-[9999] bg-[#0C3B24] flex flex-col overflow-hidden"
      >
        {/* Mapa tela cheia (fundo) — 3 pontos: motoboy real, loja, cliente */}
        <div className="absolute inset-0">
          <Suspense fallback={<div className="w-full h-full bg-[#111] flex items-center justify-center"><Loader2 className="h-8 w-8 text-[#ffb800] animate-spin" /></div>}>
            <OfferMiniMap
              motoboyLat={effectivePos?.lat}
              motoboyLng={effectivePos?.lng}
              storeLat={offer.pickup_lat}
              storeLng={offer.pickup_lng}
              clientLat={offer.dropoff_lat}
              clientLng={offer.dropoff_lng}
              storeName={offer.loja_nome}
              storeLogo={offer.loja_logo}
              routePolylineJson={offer.route_polyline ?? null}
              distanciaKm={offer.distancia_km}
              tempoEstimadoMin={offer.tempo_estimado_min}
              motoboyCity={motoboyCity}
              motoboyName={motoboyName}
              motoboyAvatar={motoboyAvatar}
              fullscreen
            />
          </Suspense>
          {/* Gradiente limitado à metade inferior — não encobre as rotas do mapa */}
          <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black to-transparent pointer-events-none" />
        </div>

        {/* Header overlay */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-12 pb-4">
          <button
            onClick={() => setStage('notify')}
            className="w-10 h-10 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center active:scale-90 transition-transform"
          >
            <ChevronDown className="h-5 w-5 text-white" />
          </button>

          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-2">
            <span className={cn('w-2 h-2 rounded-full animate-pulse', isUrgent ? 'bg-red-500' : 'bg-[#ffb800]')} />
            <span className={cn('text-sm font-black font-mono', isUrgent ? 'text-red-400' : 'text-[#ffb800]')}>
              {isExpired ? 'EXPIRADA' : `${remaining}s`}
            </span>
          </div>

          <button
            onClick={handleDismiss}
            disabled={isRejecting}
            className="w-10 h-10 rounded-2xl bg-black/60 backdrop-blur-md border border-red-500/30 flex items-center justify-center active:scale-90 transition-transform"
          >
            <X className="h-5 w-5 text-red-400" />
          </button>
        </div>

        {/* Painel inferior — com modo colapsado */}
        <div className="relative z-10 mt-auto">
          {/* Barra de tempo */}
          <div className="px-4 mb-1.5">{TimerBar}</div>

          <div className="bg-[#0C3B24]/95 backdrop-blur-xl rounded-t-[1.5rem] border-t border-white/5 px-4 pt-2.5 pb-4 space-y-2">

            {/* Handle de colapso — toque para expandir/encolher */}
            <button
              onClick={() => setIsCardCollapsed(c => !c)}
              className="w-full flex items-center justify-between active:opacity-70 transition-opacity"
            >
              <div className="flex-1 text-left">
                <p className="text-[9px] font-bold text-[#ffb800] uppercase tracking-widest leading-none">Você recebe</p>
                <p className="text-2xl font-black text-white leading-tight">{fmtCurrency(valorLiquido)}</p>
              </div>
              <div className="flex items-center gap-2">
                {!isCardCollapsed && (
                  <div className="text-right text-[11px] text-white/50 leading-tight">
                    <p>{offer.tempo_estimado_min} min est.</p>
                    <p>{fmtKm(distPickupToDropoff)} loja → cliente</p>
                    {distValid && distToPickup != null && <p className="text-[#ffb800]/70 font-bold">{fmtKm(distToPickup)} você → loja</p>}
                  </div>
                )}
                <motion.div
                  animate={{ rotate: isCardCollapsed ? 180 : 0 }}
                  transition={{ duration: 0.25 }}
                  className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0 ml-1"
                >
                  <ChevronDown className="h-3.5 w-3.5 text-white/60" />
                </motion.div>
              </div>
            </button>

            {/* Detalhes colapsáveis */}
            <AnimatePresence initial={false}>
              {!isCardCollapsed && (
                <motion.div
                  key="details"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2 pt-1">
                    {/* Rota: Você → Loja → Cliente */}
                    <div className="space-y-0 relative">
                      <div className="absolute left-[13px] top-5 bottom-5 w-[2px] bg-gradient-to-b from-[#ffb800] via-[#00ff00] to-[#00ff00]" />

                      <div className="flex gap-3 items-center pb-1.5">
                        <div className="w-7 h-7 rounded-full bg-[#ffb800] flex items-center justify-center shrink-0 z-10 shadow-[0_0_8px_rgba(255,184,0,0.5)]">
                          <Navigation className="h-3.5 w-3.5 text-black" />
                        </div>
                        <div className="flex-1 min-w-0 leading-tight">
                          <p className="text-[9px] font-bold text-[#ffb800] uppercase tracking-widest">Sua posição</p>
                          <p className="text-xs font-black text-white truncate">
                            {gpsIsPrecise
                              ? 'Localização atual (GPS)'
                              : (motoboyCity || 'Obtendo localização…')}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3 items-center pb-1.5">
                        <div className="w-7 h-7 rounded-full bg-[#1F6F4A] flex items-center justify-center shrink-0 z-10 shadow-[0_0_8px_rgba(31,111,74,0.5)]">
                          <Store className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0 leading-tight">
                          <p className="text-[9px] font-bold text-[#34C759] uppercase tracking-widest">Retirada na loja</p>
                          <p className="text-xs font-black text-white truncate">{offer.loja_nome || 'Loja Parceira'}</p>
                          {(offer.loja_endereco || offer.loja_bairro) && (
                            <p className="text-[10px] text-white/40 truncate">{offer.loja_endereco || offer.loja_bairro}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-3 items-center">
                        <div className="w-7 h-7 rounded-full bg-[#00ff00] flex items-center justify-center shrink-0 z-10 shadow-[0_0_8px_rgba(0,255,0,0.5)]">
                          <MapPin className="h-3.5 w-3.5 text-black" />
                        </div>
                        <div className="flex-1 min-w-0 leading-tight">
                          <p className="text-[9px] font-bold text-[#00ff00] uppercase tracking-widest">Entrega ao cliente</p>
                          <p className="text-xs font-black text-white truncate">
                            {offer.descricao_pedido
                              ? offer.descricao_pedido.replace('Cliente: ', '')
                              : (offer.regiao || 'Ponto de Entrega')}
                          </p>
                          <p className="text-[10px] text-[#00ff00]/70 truncate">{fmtKm(distPickupToDropoff)} da loja</p>
                        </div>
                      </div>
                    </div>

                    {/* ── Logística da entrega (rotas reais por vias) ── */}
                    <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/70">📍 Você → Loja</span>
                        <span className="font-black text-white">
                          {legAText}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/70">🏪 Loja → Cliente</span>
                        <span className="font-black text-white">
                          {legStoreToClient ? `${fmtKm(legStoreToClient.km)} • ${legStoreToClient.min} min` : 'calculando…'}
                        </span>
                      </div>
                      <div className="border-t border-white/10 pt-1.5 flex items-center justify-between text-xs">
                        <span className="font-bold text-[#ffb800]">📏 Distância Total</span>
                        <span className="font-black text-[#ffb800]">{totalKm != null ? fmtKm(totalKm) : '—'}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[#ffb800]">⏱ Tempo Estimado Total</span>
                        <span className="font-black text-[#ffb800]">{totalMin != null ? `${totalMin} min` : '—'}</span>
                      </div>
                      <div className="border-t border-white/10 pt-1.5 flex items-center justify-between text-xs">
                        <span className="text-white/70">💰 Valor da entrega</span>
                        <span className="font-black text-white">{fmtCurrency(offer.valor)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/70">💵 Seu ganho líquido</span>
                        <span className="font-black text-[#00ff00]">{fmtCurrency(valorLiquido)}</span>
                      </div>
                    </div>

                    {offer.loja_observacao && (
                      <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                        <p className="text-[11px] text-white/70 leading-snug line-clamp-2">
                          <span className="text-white/40 font-bold uppercase text-[9px] tracking-widest">Obs: </span>
                          {offer.loja_observacao}
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Botões de ação — sempre visíveis */}
            <div className="pt-1 space-y-1">
              {!isExpired ? (
                <Button
                  onClick={handleAccept}
                  disabled={isAccepting || isRejecting}
                  className="w-full h-12 bg-[#34C759] hover:bg-[#2db34e] text-white font-black text-base rounded-xl shadow-[0_6px_24px_rgba(52,199,89,0.35)] active:scale-95 transition-all uppercase italic"
                >
                  {isAccepting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <CheckCircle className="h-5 w-5" />
                      Assumir Corrida
                    </span>
                  )}
                </Button>
              ) : (
                <Button disabled className="w-full h-12 bg-white/5 text-white/20 font-black text-base rounded-xl uppercase italic">
                  Oferta Expirada
                </Button>
              )}
              <button
                onClick={handleDismiss}
                disabled={isAccepting || isRejecting}
                className="w-full py-1 text-[11px] font-bold text-white/30 hover:text-red-400 transition-colors uppercase tracking-widest flex items-center justify-center gap-1.5"
              >
                <X className="h-3 w-3" />
                {isRejecting ? 'Recusando...' : 'Recusar esta corrida'}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
