/**
 * DeliveryAcceptedCard — Tela intermediária de confirmação de corrida aceita.
 *
 * Exibida após o RPC `accept_delivery_offer` retornar sucesso, antes de
 * navegar para MotoboyAwaitingRide. Mostra: confirmação animada, dados da
 * loja (nome, endereço), distância/tempo estimado, valor líquido e CTA
 * "IR PARA A LOJA".
 */
import { useMemo, useEffect, useState, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2, Store, MapPin, Navigation, Clock,
  DollarSign, ArrowRight, Package, ExternalLink, Loader2
} from 'lucide-react';
import type { DeliveryOffer } from '@/components/motoboy/DeliveryOfferCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { geocodeAddress } from '@/skills/maps/geocodeService';
import { getCityCoordinates } from '@/lib/cityCoordinates';

const OfferMiniMap = lazy(() => import('./OfferMiniMap'));

interface DeliveryAcceptedCardProps {
  offer: DeliveryOffer;
  onProceed: () => void;
}

// Haversine distance in km
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const openGMaps = (lat: number, lng: number) =>
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');

export default function DeliveryAcceptedCard({ offer, onProceed }: DeliveryAcceptedCardProps) {
  const { user } = useAuth();
  const [motoboyPos, setMotoboyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [motoboyAvatar, setMotoboyAvatar] = useState<string | null>(null);
  const [motoboyName, setMotoboyName] = useState<string>('');
  const [motoboyAddress, setMotoboyAddress] = useState<string>('');

  // Buscar avatar (profiles) + endereço (motoboy_profiles) e geocodar o endereço
  // para usar como posição do motoboy no mapa (em vez de GPS).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    Promise.all([
      supabase.from('profiles').select('avatar_url, name').eq('id', user.id).maybeSingle(),
      supabase.from('motoboy_profiles').select('cidade, bairro, estado, nome, sobrenome').eq('user_id', user.id).maybeSingle(),
    ]).then(async ([profileRes, motoboyRes]) => {
      if (cancelled) return;
      const profile = profileRes.data as any;
      const mb = motoboyRes.data as any;
      if (profile?.avatar_url) setMotoboyAvatar(profile.avatar_url);
      const fullName = profile?.name || [mb?.nome, mb?.sobrenome].filter(Boolean).join(' ');
      if (fullName) setMotoboyName(fullName);
      const addr = [mb?.bairro, mb?.cidade, mb?.estado].filter(Boolean).join(', ');
      if (addr) setMotoboyAddress(addr);

      // Obter lat/lng: 1) cidade hardcoded BR  2) Mapbox geocoding como fallback
      if (mb?.cidade) {
        const cityCoords = getCityCoordinates(mb.cidade);
        if (cityCoords) {
          if (!cancelled) setMotoboyPos(cityCoords);
        } else {
          const addressQuery = [mb?.bairro, mb?.cidade, mb?.estado].filter(Boolean).join(', ');
          const geo = await geocodeAddress(addressQuery);
          if (!cancelled && geo) setMotoboyPos({ lat: geo.lat, lng: geo.lng });
          else if (!cancelled) setMotoboyPos(getCityCoordinates('blumenau') || null);
        }
      }
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  // Calcular distância Motoboy → Loja
  const distToStore = useMemo(() => {
    if (!motoboyPos || offer.pickup_lat == null || offer.pickup_lng == null) return null;
    return haversineKm(motoboyPos.lat, motoboyPos.lng, offer.pickup_lat, offer.pickup_lng);
  }, [motoboyPos, offer.pickup_lat, offer.pickup_lng]);

  const tempoEstimado = distToStore ? Math.max(3, Math.ceil(distToStore * 3.5)) : null;

  const hasStoreCoords = offer.pickup_lat != null && offer.pickup_lng != null;

  return (
    <div className="fixed inset-0 z-[10001] bg-[#0a0a0a] overflow-y-auto">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#34C759]/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-[#FF6B00]/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center px-5 py-8 min-h-screen">
        {/* ── Animação de Sucesso ── */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', duration: 0.6, delay: 0.1 }}
          className="w-24 h-24 rounded-full bg-[#34C759]/15 border-4 border-[#34C759]/40 flex items-center justify-center shadow-[0_0_60px_rgba(52,199,89,0.3)]"
        >
          <CheckCircle2 className="h-12 w-12 text-[#34C759]" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center mt-4 space-y-1"
        >
          <h1 className="text-2xl font-black text-white uppercase italic tracking-tight">
            Corrida Aceita!
          </h1>
          <p className="text-white/40 text-sm">Vá até a loja para retirar o pedido</p>
        </motion.div>

        {/* ── MAPA: Localização do Motoboy → Loja ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full max-w-md mt-6"
        >
          <div className="relative rounded-2xl overflow-hidden border border-white/10">
            {/* Header do mapa */}
            <div className="absolute top-3 left-3 z-10 bg-black/70 backdrop-blur-sm rounded-xl px-3 py-1.5 flex items-center gap-2 border border-white/10">
              <Navigation className="h-3.5 w-3.5 text-[#FF6B00]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">Sua rota</span>
            </div>

            {/* Botão Google Maps */}
            {hasStoreCoords && (
              <button
                onClick={() => openGMaps(offer.pickup_lat!, offer.pickup_lng!)}
                className="absolute top-3 right-3 z-10 bg-black/70 backdrop-blur-sm rounded-xl px-3 py-1.5 flex items-center gap-2 border border-white/10 active:scale-90 transition-transform"
              >
                <ExternalLink className="h-3.5 w-3.5 text-white/70" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">Navegar</span>
              </button>
            )}

            <Suspense fallback={
              <div className="h-[229px] bg-[#111] flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-[#FF6B00] animate-spin" />
              </div>
            }>
              <OfferMiniMap
                motoboyLat={motoboyPos?.lat ?? null}
                motoboyLng={motoboyPos?.lng ?? null}
                storeLat={offer.pickup_lat ?? null}
                storeLng={offer.pickup_lng ?? null}
                storeName={offer.loja_nome}
                storeLogo={offer.loja_logo || (offer as any).merchant?.logo_url}
                distanciaKm={distToStore ?? offer.distancia_km}
                tempoEstimadoMin={tempoEstimado ?? offer.tempo_estimado_min}
                motoboyAvatar={motoboyAvatar}
                motoboyName={motoboyName}
                motoboyCity={motoboyAddress}
                mapHeightClass="h-[229px]"
              />
            </Suspense>
          </div>
        </motion.div>

        {/* ── Cards de informação ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="w-full max-w-md mt-4 space-y-3"
        >
          {/* Loja */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              {(offer as any).loja_logo ? (
                <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-white/10">
                  <img
                    src={(offer as any).loja_logo}
                    alt={offer.loja_nome || 'Loja'}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                  />
                  <div className="hidden w-full h-full bg-[#FF6B00]/15 flex items-center justify-center">
                    <Store className="h-5 w-5 text-[#FF6B00]" />
                  </div>
                </div>
              ) : (
                <div className="w-11 h-11 rounded-xl bg-[#FF6B00]/15 flex items-center justify-center shrink-0">
                  <Store className="h-5 w-5 text-[#FF6B00]" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">RETIRADA EM</p>
                <h2 className="text-base font-black text-white leading-tight">{offer.loja_nome}</h2>
                <p className="text-sm text-white/50 mt-0.5 leading-snug">{offer.loja_endereco}</p>
              </div>
              {hasStoreCoords && (
                <button onClick={() => openGMaps(offer.pickup_lat!, offer.pickup_lng!)}
                  className="w-9 h-9 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center shrink-0 active:scale-90 transition-transform">
                  <Navigation className="h-4 w-4 text-white/50" />
                </button>
              )}
            </div>
          </div>

          {/* Destino */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#34C759]/15 flex items-center justify-center shrink-0">
                <MapPin className="h-6 w-6 text-[#34C759]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">ENTREGAR EM</p>
                <p className="text-sm font-bold text-white leading-tight">{offer.regiao}</p>
              </div>
            </div>
          </div>

          {/* Stats: Distância, Tempo, Ganhos */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <Navigation className="h-5 w-5 mx-auto mb-1.5 text-[#FF6B00]" />
              <p className="text-lg font-black text-white">
                {distToStore != null ? distToStore.toFixed(1) : offer.distancia_km?.toFixed(1) ?? '—'}
              </p>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">
                {distToStore != null ? 'km até loja' : 'km total'}
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <Clock className="h-5 w-5 mx-auto mb-1.5 text-[#FFAD00]" />
              <p className="text-lg font-black text-white">{tempoEstimado ?? offer.tempo_estimado_min ?? '—'}</p>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">min</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <DollarSign className="h-5 w-5 mx-auto mb-1.5 text-[#34C759]" />
              <p className="text-lg font-black text-[#34C759]">{fmt(offer.valor_liquido)}</p>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">ganho</p>
            </div>
          </div>

          {/* Lembrete — Código de Retirada */}
          <div className="bg-[#FFAD00]/10 border border-[#FFAD00]/25 rounded-2xl p-4 flex items-start gap-3">
            <Package className="h-5 w-5 text-[#FFAD00] mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-[#FFAD00]">Código de Retirada</p>
              <p className="text-xs text-white/50 mt-1 leading-relaxed">
                Ao chegar na loja, solicite o <strong className="text-white/70">código de retirada</strong> ao lojista e 
                digite na tela de corrida para confirmar a retirada do pedido.
              </p>
            </div>
          </div>

          {/* Descrição do pedido (se disponível) */}
          {offer.descricao_pedido && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Detalhes do Pedido</p>
              <p className="text-sm text-white/70">{offer.descricao_pedido}</p>
            </div>
          )}

          {/* Observação da loja */}
          {offer.loja_observacao && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Observação da Loja</p>
              <p className="text-sm text-white/70">{offer.loja_observacao}</p>
            </div>
          )}
        </motion.div>

        {/* ── CTA: IR PARA A LOJA ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="w-full max-w-md mt-8 px-1"
        >
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onProceed}
            className="w-full h-16 rounded-2xl font-black text-base uppercase italic flex items-center justify-center gap-3 text-black shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, #FF6B00, #FF8A00)',
              boxShadow: '0 16px 50px rgba(255,107,0,0.45)',
            }}
          >
            Ir Para a Loja <ArrowRight className="h-5 w-5" />
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
