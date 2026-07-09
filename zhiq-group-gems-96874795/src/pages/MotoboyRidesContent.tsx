import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import RideRouteMiniMap from '@/components/motoboy/RideRouteMiniMap';
import PickupRouteCard from '@/components/motoboy/PickupRouteCard';
import polyline from '@mapbox/polyline';

interface ServiceOrder {
  id: string;
  pickup_location: string;
  destination: string;
  pickup_lat: number;
  pickup_lng: number;
  drop_lat: number;
  drop_lng: number;
  distance_km: number;
  estimated_minutes: number;
  total_price: number;
  merchant_id: string;
  pickup_distance_km: number | null;
  pickup_estimated_minutes: number | null;
  pickup_route_polyline: string | null;
  drop_route_polyline: string | null;
  pickup_address?: string;
  pickup_calculated_at?: string;
}

interface DeliveryOffer {
  id: string;
  status: string;
  created_at: string;
  commission_percent: number;
  gross_value: number;
  net_value: number;
  delivery_order_id: string;
  service_orders: ServiceOrder | null;
}

export default function MotoboyRidesContent() {
  const navigate = useNavigate();
  const [offers, setOffers] = useState<DeliveryOffer[]>([]);
  const [stores, setStores] = useState<Record<string, any>>({});
  const [commission, setCommission] = useState<{ percentual: number | null; grupos: number | null } | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [confirmExclude, setConfirmExclude] = useState<string | null>(null);
  const [hasActiveDelivery, setHasActiveDelivery] = useState(false);

  const [pickupTriggered, setPickupTriggered] = useState<Set<string>>(new Set());

  // Motoboy position from backend (motoboy_presence)
  const [backendPosition, setBackendPosition] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    async function loadMotoboyPosition() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('motoboy_presence')
        .select('lat, lng')
        .eq('motoboy_id', user.id)
        .maybeSingle();
      if (data) setBackendPosition({ lat: data.lat, lng: data.lng });
    }
    loadMotoboyPosition();
  }, []);

  // Trigger calculate-pickup-route for offers missing pickup data
  useEffect(() => {
    const calculateRoutes = async () => {
      if (offers.length === 0) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      for (const offer of offers) {
        const order = offer.service_orders;
        if (!order) continue;
        const orderId = order.id;

        // Pula se já calculado ou disparado nesta sessão
        if (order.pickup_calculated_at || pickupTriggered.has(orderId)) continue;

        setPickupTriggered(prev => new Set(prev).add(orderId));

        console.log(`[pickup-route] Triggering calculation for order ${orderId}`);
        try {
          const { data, error } = await supabase.functions.invoke('calculate-pickup-route', {
            body: { order_id: orderId, motoboy_id: user.id },
          });

          if (error) {
            console.error('[pickup-route] Error:', error);
            continue;
          }

          if (data?.calculated) {
            const { data: updated } = await supabase
              .from('service_orders')
              .select('pickup_distance_km, pickup_estimated_minutes')
              .eq('id', orderId)
              .maybeSingle();

            if (updated) {
              setOffers(prev => prev.map(o =>
                o.service_orders?.id === orderId
                  ? { ...o, service_orders: { ...o.service_orders, ...updated } }
                  : o
              ));
            }
          }
        } catch (err) {
          console.error('[pickup-route] Exception:', err);
        }
      }
    };

    calculateRoutes();
  }, [offers]); // Removed pickupTriggered from dependencies to stop the loop

  // ── Commission tiers ──
  const TIERS = [
    { max: 0, rate: 25 },
    { max: 1, rate: 18 },
    { max: 2, rate: 11 },
    { max: 3, rate: 6 },
  ];

  function getNextTier(grupos: number) {
    const next = TIERS.find(t => t.max > grupos);
    return next ? { faltam: next.max - grupos, rate: next.rate } : null;
  }

  // Check for active delivery on load
  useEffect(() => {
    async function checkActive() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('delivery_orders')
        .select('id')
        .eq('motoboy_id', user.id)
        .eq('status', 'in_progress')
        .limit(1);
      setHasActiveDelivery((data?.length ?? 0) > 0);
    }
    checkActive();
  }, []);

  async function aceitarCorrida(offerId: string) {
    if (accepting || hasActiveDelivery) return;
    setAccepting(offerId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get order_id from offer (via delivery_order_id direto)
      const offer = offers.find(o => o.id === offerId);
      const orderId = offer?.delivery_order_id || offer?.service_orders?.id;
      if (!orderId) throw new Error('Pedido não encontrado');

      // Call backend RPC with one-at-a-time guard
      const { error } = await supabase.rpc('accept_delivery_order', {
        p_order_id: orderId,
        p_motoboy_id: user.id,
      });

      if (error) throw error;

      setOffers(prev => prev.filter(o => o.id !== offerId));
      setHasActiveDelivery(true);
      navigate('/motoboy/awaiting');
    } catch (err: any) {
      const msg = err?.message || 'Erro ao aceitar';
      if (msg.includes('Finalize a entrega atual')) {
        setHasActiveDelivery(true);
      }
      alert(msg);
    } finally {
      setAccepting(null);
    }
  }

  async function excluirCorrida(offerId: string) {
    if (accepting) return;
    setAccepting(offerId);
    try {
      setOffers(prev => prev.filter(o => o.id !== offerId));
    } finally {
      setAccepting(null);
      setConfirmExclude(null);
    }
  }

  useEffect(() => {
    async function loadCommission() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('percentual_comissao_atual, quantidade_grupos_ativos')
        .eq('id', user.id)
        .maybeSingle();
      if (data) setCommission({ percentual: data.percentual_comissao_atual, grupos: data.quantidade_grupos_ativos });
    }
    loadCommission();
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabase
          .from('delivery_offers')
          .select(`
            id, status, created_at, commission_percent, gross_value, net_value,
            pickup_distance_km, pickup_duration_min,
            delivery_order_id,
            service_orders:delivery_order_id (
              id, pickup_location, destination,
              pickup_lat, pickup_lng, drop_lat, drop_lng,
              distance_km, estimated_minutes, total_price, merchant_id,
              pickup_distance_km, pickup_estimated_minutes,
              pickup_route_polyline, drop_route_polyline
            )
          `)
          .in('status', ['pending', 'open'])
          .order('created_at', { ascending: false });

        if (data) {
          setOffers(data);
          const merchantIds = [...new Set(data.map(o => o.service_orders?.merchant_id).filter(Boolean))] as string[];
          if (merchantIds.length > 0) {
            const { data: storeData } = await supabase
              .from('merchant_stores')
              .select('user_id, nome_loja, logo_url, categoria, cidade, estado')
              .in('user_id', merchantIds);
            if (storeData) {
              const map: Record<string, any> = {};
              storeData.forEach(s => { map[s.user_id] = s; });
              setStores(map);
            }
          }
        }
      } catch (err) {
        console.error('[MotoboyRides] Erro ao carregar ofertas:', err);
      }
    }
    load();
  }, []);

  const gruposAtivos = commission?.grupos ?? 0;
  const nextTier = getNextTier(gruposAtivos);

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      {/* ═══ CARD COMISSÃO & GRUPOS ═══ */}
      {commission && (
        <div style={{
          background: 'linear-gradient(135deg, #FFF7ED 0%, #FFF3E6 100%)',
          border: '1px solid #FFE2CC',
          borderRadius: 20,
          padding: 18,
          marginBottom: 20,
          boxShadow: '0 4px 16px rgba(255,106,0,0.08)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, color: '#888', fontWeight: 500 }}>Sua comissão atual</div>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#FF6A00', lineHeight: 1.1 }}>
                {commission.percentual ?? '—'}%
              </div>
            </div>
            <div style={{
              background: '#FF6A00', color: '#FFF', borderRadius: 14,
              padding: '8px 14px', fontSize: 13, fontWeight: 700,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <span style={{ fontSize: 22, fontWeight: 800 }}>{gruposAtivos}</span>
              <span style={{ fontSize: 10, opacity: 0.9 }}>grupos</span>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', marginBottom: 4 }}>
              <span>Progresso</span>
              <span>{gruposAtivos} / 3 grupos</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: '#FFE2CC', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #FF6A00, #FF8C33)',
                width: `${Math.min((gruposAtivos / 3) * 100, 100)}%`, transition: 'width 0.5s ease',
              }} />
            </div>
          </div>

          {nextTier && (
            <div style={{ fontSize: 12, color: '#666', marginTop: 10, lineHeight: 1.5 }}>
              Faltam <b style={{ color: '#FF6A00' }}>{nextTier.faltam} grupo{nextTier.faltam > 1 ? 's' : ''}</b> para reduzir para <b style={{ color: '#FF6A00' }}>{nextTier.rate}%</b>
            </div>
          )}

          <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
            Comissão baseada nos seus grupos ativos
          </div>

          <button
            style={{
              marginTop: 14, background: '#FF6A00', color: '#FFF', border: 'none',
              borderRadius: 14, padding: '10px 14px', fontWeight: 700, fontSize: 14, cursor: 'pointer', width: '100%',
            }}
            onClick={() => navigate('/motoboy/grupos')}
          >
            Cadastrar mais grupos
          </button>
        </div>
      )}

      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16, color: '#FF6A00' }}>
        Corridas Disponíveis
      </h1>

      {offers.length === 0 && (
        <div style={{ background: '#FFF3E6', padding: 18, borderRadius: 16, color: '#FF6A00', textAlign: 'center', fontSize: 14 }}>
          Nenhuma corrida aberta no momento.
        </div>
      )}

      {/* ACTIVE DELIVERY BLOCK */}
      {hasActiveDelivery && (
        <div style={{
          background: '#FFF3E6', border: '2px solid #FF6A00', borderRadius: 16,
          padding: 16, marginBottom: 18, textAlign: 'center',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#FF6A00', marginBottom: 6 }}>
            ⚠️ Você possui uma entrega em andamento
          </div>
          <div style={{ fontSize: 13, color: '#666' }}>
            Finalize a entrega atual para aceitar outra.
          </div>
          <button
            style={{
              marginTop: 12, background: '#FF6A00', color: '#FFF', border: 'none',
              borderRadius: 12, padding: '10px 20px', fontWeight: 700, cursor: 'pointer',
            }}
            onClick={() => navigate('/motoboy/awaiting')}
          >
            Ir para entrega ativa
          </button>
        </div>
      )}

      {offers.map((offer) => {
        const order = offer.service_orders;
        if (!order) return null;

        // ── ORANGE CARD data (distance_km / estimated_minutes) ──
        const deliveryKm = order.distance_km != null ? Number(order.distance_km) : null;
        const deliveryMin = order.estimated_minutes != null ? Number(order.estimated_minutes) : null;
        const preco = Number(order.total_price) || 0;
        // FONTE ÚNICA: o líquido vem da OFERTA (net_value, calculado no motor
        // pela tabela oficial). Nunca recalcular percentual no front.
        const comissao = offer.commission_percent != null ? Number(offer.commission_percent) : null;
        const ganhoLiquido = offer.net_value != null ? Number(offer.net_value) : preco;
        // DELIVERY METRICS — strictly from distance_km / estimated_minutes (NEVER pickup_*)
        const laranjaTexto = deliveryKm != null && deliveryMin != null
          ? `${deliveryKm.toFixed(1)} km • ${deliveryMin} min`
          : 'Calculando rota…';

        const store = stores[order.merchant_id] || null;
        const initials = (store?.nome_loja || 'L').substring(0, 2).toUpperCase();
        const logo = store?.logo_url && store.logo_url.startsWith('http')
          ? store.logo_url
          : store?.logo_url
            ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/lojas/${store.logo_url}`
            : null;

        const isExcluding = confirmExclude === offer.id;

        return (
          <div
            key={offer.id}
            style={{
              background: '#FFFFFF', padding: 18, marginBottom: 18,
              borderRadius: 22, border: '1px solid #FFE2CC',
              boxShadow: '0 6px 24px rgba(255,106,0,0.10)',
            }}
          >
            {/* ═══ STORE HEADER ═══ */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14, background: '#FFF',
                border: '1px solid #F1F1F1', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                padding: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginRight: 12, flexShrink: 0, overflow: 'hidden',
              }}>
                {logo ? (
                  <img
                    src={logo}
                    alt={store?.nome_loja || 'Loja'}
                    onError={(e) => { e.currentTarget.style.display = 'none'; const f = e.currentTarget.parentElement?.querySelector('[data-fallback]') as HTMLElement; if (f) f.style.display = 'flex'; }}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 8 }}
                  />
                ) : null}
                <div data-fallback style={{
                  width: '100%', height: '100%', borderRadius: 8,
                  background: '#FF6A00', color: '#FFF',
                  display: logo ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 18,
                }}>{initials}</div>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#FF6A00', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {store?.nome_loja || 'Loja'}
                </div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                  {store ? `${store.categoria || ''} · ${store.cidade || ''}` : ''}
                </div>
                <div style={{ fontSize: 11, color: '#bbb', marginTop: 1 }}>{order.pickup_address || ''}</div>
              </div>
              <div style={{
                background: '#FFF3E6', color: '#FF6A00', padding: '5px 10px',
                borderRadius: 10, fontSize: 11, fontWeight: 700, flexShrink: 0, marginLeft: 8,
              }}>
                {comissao != null ? `${comissao}%` : '—'}
              </div>
            </div>

            {/* ═══ ADDRESSES ═══ */}
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: '#999', fontWeight: 500 }}>📍 Coleta</div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#333' }}>{order.pickup_location || 'Endereço indisponível'}</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#999', fontWeight: 500 }}>📦 Destino</div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#333' }}>{order.destination || 'Endereço indisponível'}</div>
            </div>

            {/* ═══ BLUE CARD — pickup only ═══ */}
            <PickupRouteCard
              offerId={offer.id}
              pickupLat={order.pickup_lat ?? 0}
              pickupLng={order.pickup_lng ?? 0}
              motoboyLat={(() => {
                const pl = typeof order.pickup_route_polyline === 'string' ? order.pickup_route_polyline : null;
                if (pl) { try { const d = polyline.decode(pl); return d[0]?.[0] ?? null; } catch { return null; } }
                return backendPosition?.lat ?? null;
              })()}
              motoboyLng={(() => {
                const pl = typeof order.pickup_route_polyline === 'string' ? order.pickup_route_polyline : null;
                if (pl) { try { const d = polyline.decode(pl); return d[0]?.[1] ?? null; } catch { return null; } }
                return backendPosition?.lng ?? null;
              })()}
              pickupDistanceKm={order.pickup_distance_km ?? null}
              pickupDurationMin={order.pickup_estimated_minutes ?? null}
              pickupPolyline={typeof order.pickup_route_polyline === 'string' ? order.pickup_route_polyline : null}
            />

            {/* ═══ ORANGE CARD — delivery only ═══ */}
            <RideRouteMiniMap
              offerId={offer.id}
              pickupLat={order.pickup_lat}
              pickupLng={order.pickup_lng}
              dropLat={order.drop_lat}
              dropLng={order.drop_lng}
              distanceKm={deliveryKm ?? 0}
              estimatedMinutes={deliveryMin}
              dropPolyline={typeof order.drop_route_polyline === 'string' ? order.drop_route_polyline : null}
            />

            {/* ═══ EARNINGS CARD ═══ */}
            <div style={{
              background: 'linear-gradient(135deg, #E6F7EE 0%, #F0FFF4 100%)',
              padding: 16, borderRadius: 16, marginTop: 14,
              border: '1px solid #B7E4C7', textAlign: 'center',
            }}>
              <div style={{ fontSize: 12, color: '#2D6A4F', fontWeight: 500, marginBottom: 4 }}>Você recebe</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#2D6A4F' }}>
                R$ {ganhoLiquido.toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: '#52B788', marginTop: 4 }}>
                Comissão baseada nos seus grupos ativos
              </div>
            </div>

            {/* ═══ DELIVERY METRICS (large) ═══ */}
            <div style={{
              display: 'flex', justifyContent: 'space-around', marginTop: 12,
              padding: '10px 0', borderTop: '1px solid #F3F3F3',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#FF6A00' }}>{deliveryKm != null ? deliveryKm.toFixed(1) : '—'}</div>
                <div style={{ fontSize: 11, color: '#999' }}>km entrega</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#FF6A00' }}>{deliveryMin ?? '—'}</div>
                <div style={{ fontSize: 11, color: '#999' }}>min estimado</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#FF6A00' }}>R$ {preco.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: '#999' }}>valor bruto</div>
              </div>
            </div>

            {/* ═══ CTA — EXCLUSIVO ═══ */}
            <button
              disabled={accepting === offer.id || hasActiveDelivery}
              style={{
                marginTop: 16, width: '100%', background: '#FF6A00', color: '#FFF',
                padding: 16, borderRadius: 18, fontWeight: 800, fontSize: 16,
                border: 'none', cursor: 'pointer',
                boxShadow: '0 6px 20px rgba(255,106,0,0.35)',
                opacity: (accepting === offer.id || hasActiveDelivery) ? 0.6 : 1,
              }}
              onClick={() => aceitarCorrida(offer.id)}
            >
              {accepting === offer.id ? '⏳ ACEITANDO…' : '🔒 EXCLUSIVO'}
            </button>

            {/* ═══ CTA — ACEITAR ═══ */}
            <button
              disabled={accepting === offer.id || hasActiveDelivery}
              style={{
                marginTop: 10, width: '100%', background: '#FFF3E6', color: '#FF6A00',
                padding: 14, borderRadius: 16, fontWeight: 700, fontSize: 14,
                border: '1px solid #FFE2CC', cursor: 'pointer',
              }}
              onClick={() => aceitarCorrida(offer.id)}
            >
              ACEITAR CORRIDA
            </button>

            {/* ═══ CTA — EXCLUIR (with confirmation) ═══ */}
            {isExcluding ? (
              <div style={{
                marginTop: 10, background: '#FFF5F5', border: '1.5px solid #FF3B30',
                borderRadius: 16, padding: 14, textAlign: 'center',
              }}>
                <div style={{ fontSize: 13, color: '#FF3B30', fontWeight: 600, marginBottom: 10 }}>
                  Tem certeza? Essa ação é irreversível.
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    style={{
                      flex: 1, background: '#FF3B30', color: '#FFF', border: 'none',
                      borderRadius: 12, padding: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                    }}
                    disabled={accepting === offer.id}
                    onClick={() => excluirCorrida(offer.id)}
                  >
                    {accepting === offer.id ? '⏳' : 'Confirmar exclusão'}
                  </button>
                  <button
                    style={{
                      flex: 1, background: '#FFF', color: '#999', border: '1px solid #DDD',
                      borderRadius: 12, padding: 12, fontWeight: 600, fontSize: 14, cursor: 'pointer',
                    }}
                    onClick={() => setConfirmExclude(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                style={{
                  marginTop: 10, width: '100%', background: '#FFF', color: '#FF3B30',
                  padding: 14, borderRadius: 16, fontWeight: 700, fontSize: 14,
                  border: '1.5px solid #FF3B30', cursor: 'pointer',
                }}
                onClick={() => setConfirmExclude(offer.id)}
              >
                ❌ EXCLUIR
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
