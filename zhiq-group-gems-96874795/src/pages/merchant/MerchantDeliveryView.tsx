import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Loader2, ArrowLeft, MapPin, Navigation, User, Phone,
  Clock, Bike, Package, Hash, CheckCircle2, Circle,
  DollarSign, Ruler, AlertCircle, Copy, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { SimpleMap, MapMarker } from "@/components/map/SimpleMap";
import { calculateRoute as fetchMapboxRoute } from "@/skills/maps/routeService";
import { loadMerchantStore } from "@/lib/merchantStoreSave";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/* ─────────────────────── Types ─────────────────────── */

interface Order {
  id: string;
  status: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
  pickup_location: string | null;
  destination: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  total_price: number | null;
  distance_km: number | null;
  pickup_estimated_minutes: number | null;
  created_at: string;
  pickup_code: string | null;
  notes: string | null;
  motoboy_id: string | null;
  merchant_id: string;
  product_id: string | null;
  metadata: Record<string, any> | null;
  store_name: string | null;
  store_logo_url: string | null;
  store_address: string | null;
}

interface ProductInfo {
  id: string;
  name: string | null;
  image_url: string | null;
}

interface DeliveryOfferSnapshot {
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
}

interface MotoboyProfile {
  nome_completo: string | null;
  phone: string | null;
  foto_url: string | null;
  veiculo_marca: string | null;
  veiculo_modelo: string | null;
  veiculo_cor: string | null;
  veiculo_placa: string | null;
}

/* ─────────────────────── Status Config ─────────────────────── */

const STATUS_STEPS = [
  { key: "searching", label: "Procurando motoboy", icon: Bike },
  { key: "accepted", label: "Motoboy a caminho da loja", icon: Navigation },
  { key: "in_progress", label: "Motoboy a caminho do cliente", icon: Package },
  { key: "completed", label: "Entregue", icon: CheckCircle2 },
];

const STATUS_MAP: Record<string, { stepIndex: number; badge: string; badgeClass: string }> = {
  searching: { stepIndex: 0, badge: "Procurando Motoboy", badgeClass: "bg-orange-500 text-white animate-pulse" },
  awaiting_professional: { stepIndex: 0, badge: "Procurando Motoboy", badgeClass: "bg-orange-500 text-white animate-pulse" },
  pending: { stepIndex: 0, badge: "Procurando Motoboy", badgeClass: "bg-orange-500 text-white animate-pulse" },
  created: { stepIndex: 0, badge: "Procurando Motoboy", badgeClass: "bg-orange-500 text-white animate-pulse" },
  calculating: { stepIndex: 0, badge: "Calculando Rota", badgeClass: "bg-blue-500 text-white" },
  accepted: { stepIndex: 1, badge: "Motoboy Aceito", badgeClass: "bg-blue-600 text-white" },
  a_caminho: { stepIndex: 1, badge: "A Caminho", badgeClass: "bg-blue-600 text-white" },
  in_progress: { stepIndex: 2, badge: "Em Andamento", badgeClass: "bg-primary text-white" },
  entregando: { stepIndex: 2, badge: "Entregando", badgeClass: "bg-primary text-white" },
  buscando: { stepIndex: 2, badge: "Buscando", badgeClass: "bg-primary text-white" },
  completed: { stepIndex: 3, badge: "Entregue", badgeClass: "bg-green-600 text-white" },
  finalizada: { stepIndex: 3, badge: "Entregue", badgeClass: "bg-green-600 text-white" },
  finalizado: { stepIndex: 3, badge: "Entregue", badgeClass: "bg-green-600 text-white" },
  delivered: { stepIndex: 3, badge: "Entregue", badgeClass: "bg-green-600 text-white" },
  cancelled: { stepIndex: -1, badge: "Cancelada", badgeClass: "bg-destructive text-white" },
  cancelada: { stepIndex: -1, badge: "Cancelada", badgeClass: "bg-destructive text-white" },
};

/* ─────────────────────── Helpers ─────────────────────── */

/**
 * Gera um código de 4 dígitos determinístico a partir do order.id.
 * Usado para entregar ao cliente (diferente do pickup_code da loja).
 * Estável entre carregamentos e único por pedido.
 */
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

/* ─────────────────────── Component ─────────────────────── */

export default function MerchantDeliveryView() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [motoboy, setMotoboy] = useState<MotoboyProfile | null>(null);
  const [motoboyLocation, setMotoboyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [offerSnapshot, setOfferSnapshot] = useState<DeliveryOfferSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [routePolyline, setRoutePolyline] = useState<[number, number][] | null>(null);
  const [storeInfo, setStoreInfo] = useState<{ nome_loja: string; logo_url: string | null; endereco: string | null } | null>(null);

  /* ── Status flags (declarados cedo para uso em qualquer hook/effect abaixo) ── */
  const isCancelled = order?.status === "cancelled" || order?.status === "cancelada";
  const isCompleted = order?.status === "completed"
    || order?.status === "finalizada"
    || order?.status === "finalizado"
    || order?.status === "delivered";
  const isActive = !isCancelled && !isCompleted;

  /* ── Fetch order ── */
  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    const { data, error } = await supabase
      .from("service_orders")
      .select(
        "id, status, pickup_lat, pickup_lng, destination_lat, destination_lng, pickup_location, destination, customer_name, customer_phone, total_price, distance_km, pickup_estimated_minutes, created_at, pickup_code, notes, motoboy_id, merchant_id, product_id, metadata, store_name, store_logo_url, store_address"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (error) {
      console.error("[MerchantDeliveryView] fetch order error:", error);
      toast.error(`Erro ao carregar: ${error.message}`);
      return;
    }
    if (!data) {
      console.warn("[MerchantDeliveryView] order not found or blocked by RLS. orderId:", orderId);
    }
    if (data) setOrder(data as Order);
  }, [orderId]);

  /* ── Fetch accepted delivery offer (for timeline timestamps) ── */
  const fetchOfferSnapshot = useCallback(async () => {
    if (!orderId) return;
    const { data } = await supabase
      .from("delivery_offers")
      .select("sent_at, viewed_at, accepted_at")
      .eq("delivery_order_id", orderId)
      .eq("status", "accepted")
      .maybeSingle();
    if (data) setOfferSnapshot(data as DeliveryOfferSnapshot);
  }, [orderId]);

  /* ── Fetch product (for timeline image) ── */
  const fetchProduct = useCallback(async (productId: string, metadataFallback?: Record<string, any> | null) => {
    const { data } = await supabase
      .from("products")
      .select("id, name, image_url")
      .eq("id", productId)
      .maybeSingle();
    if (data?.image_url) {
      setProduct(data as ProductInfo);
    } else if (metadataFallback?.product_image_url) {
      setProduct({ id: "metadata", name: null, image_url: metadataFallback.product_image_url });
    }
  }, []);

  /* ── Fetch motoboy profile ── */
  const fetchMotoboy = useCallback(async (professionalUid: string) => {
    const [{ data: mp, error: mpErr }, { data: prof, error: profErr }] = await Promise.all([
      supabase
        .from("motoboy_profiles")
        .select("nome, sobrenome, nome_completo, phone, avatar_url, veiculo_marca, veiculo_modelo, veiculo_cor, veiculo_placa")
        .eq("user_id", professionalUid)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("name, avatar_url")
        .eq("id", professionalUid)
        .maybeSingle(),
    ]);
    console.log("[MerchantDeliveryView] motoboy_profiles:", mp, "error:", mpErr);
    console.log("[MerchantDeliveryView] profiles:", prof, "error:", profErr);
    if (mp || prof) {
      const fullName = [(mp as any)?.nome, (mp as any)?.sobrenome].filter(Boolean).join(" ");
      setMotoboy({
        nome_completo:
          (mp as any)?.nome_completo ??
          (fullName || null) ??
          (prof as any)?.name ??
          null,
        phone: (mp as any)?.phone ?? null,
        foto_url: (mp as any)?.avatar_url ?? (prof as any)?.avatar_url ?? null,
        veiculo_marca: (mp as any)?.veiculo_marca ?? null,
        veiculo_modelo: (mp as any)?.veiculo_modelo ?? null,
        veiculo_cor: (mp as any)?.veiculo_cor ?? null,
        veiculo_placa: (mp as any)?.veiculo_placa ?? null,
      });
    }
  }, []);

  /* ── Initial load ── */
  useEffect(() => {
    let alive = true;
    (async () => {
      setIsLoading(true);
      await Promise.all([fetchOrder(), fetchOfferSnapshot()]);
      if (alive) setIsLoading(false);
    })();
    return () => { alive = false; };
  }, [fetchOrder, fetchOfferSnapshot]);

  /* ── Watch motoboy assignment ── */
  useEffect(() => {
    if (order?.motoboy_id) fetchMotoboy(order.motoboy_id);
  }, [order?.motoboy_id, fetchMotoboy]);

  /* ── Watch product association ── */
  useEffect(() => {
    if (order?.product_id) {
      fetchProduct(order.product_id, order.metadata);
    } else if (order?.metadata?.product_image_url) {
      setProduct({ id: "metadata", name: null, image_url: order.metadata.product_image_url });
    } else {
      setProduct(null);
    }
  }, [order?.product_id, order?.metadata, fetchProduct]);

  /* ── Fetch store info for mega card ── */
  useEffect(() => {
    if (!order) return;
    // Se já temos store_name + logo direto da order, usar sem fetch extra
    if (order.store_name && order.store_logo_url) {
      const addr = [order.store_address, order.pickup_location].filter(Boolean).join(", ");
      setStoreInfo({ nome_loja: order.store_name, logo_url: order.store_logo_url, endereco: addr || null });
      return;
    }
    // Buscar via loadMerchantStore (usa auth.uid, respeita RLS)
    (async () => {
      console.log("[MerchantDeliveryView] Buscando store info via loadMerchantStore...");
      const { exists, data } = await loadMerchantStore();
      if (exists && data) {
        console.log("[MerchantDeliveryView] ✅ Store:", data.nome_loja, "logo:", data.logo_url);
        const parts = [
          data.street,
          data.number ? `nº ${data.number}` : null,
          data.neighborhood,
          data.cidade,
          data.estado,
        ].filter(Boolean);
        setStoreInfo({
          nome_loja: data.nome_loja || "Loja",
          logo_url: data.logo_url || null,
          endereco: parts.length > 0 ? parts.join(", ") : (order.pickup_location || null),
        });
      } else {
        console.warn("[MerchantDeliveryView] ⚠️ Store não encontrada, fallback");
        setStoreInfo({ nome_loja: order.store_name || "Loja", logo_url: null, endereco: order.pickup_location || null });
      }
    })();
  }, [order?.merchant_id]);

  /* ── Watch motoboy live location (realtime + polling a cada 8s) ── */
  useEffect(() => {
    const TERMINAL = ['completed', 'finalizada', 'finalizado', 'delivered', 'cancelled', 'cancelada'];
    const isTerminal = TERMINAL.includes(order?.status ?? '');
    if (!order?.motoboy_id || isTerminal) {
      setMotoboyLocation(null);
      return;
    }
    const motoboyId = order.motoboy_id;
    let alive = true;

    const fetchLocation = async () => {
      const { data } = await supabase
        .from("motoboy_locations")
        .select("lat, lng, updated_at")
        .eq("motoboy_id", motoboyId)
        .maybeSingle();
      if (!alive) return;
      if (data?.lat && data?.lng) {
        setMotoboyLocation({ lat: Number(data.lat), lng: Number(data.lng) });
      } else {
        // Fallback: posição de residência quando GPS ainda não foi enviado
        const { data: profile } = await supabase
          .from("motoboy_profiles")
          .select("latitude_residencia, longitude_residencia")
          .eq("user_id", motoboyId)
          .maybeSingle();
        if (!alive) return;
        if (profile?.latitude_residencia && profile?.longitude_residencia) {
          setMotoboyLocation({ lat: Number(profile.latitude_residencia), lng: Number(profile.longitude_residencia) });
        }
      }
    };

    fetchLocation();
    // Polling a cada 8s — garante atualização mesmo se realtime falhar
    const poll = setInterval(fetchLocation, 8000);

    // Realtime como complemento (atualização imediata quando chega)
    const channel = supabase
      .channel(`motoboy-loc-${motoboyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "motoboy_locations", filter: `motoboy_id=eq.${motoboyId}` },
        (payload) => {
          const row = payload.new as { lat?: number; lng?: number };
          if (row?.lat && row?.lng) setMotoboyLocation({ lat: Number(row.lat), lng: Number(row.lng) });
        }
      )
      .subscribe();

    return () => {
      alive = false;
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [order?.motoboy_id, order?.status]);

  /* ── Realtime subscription ── */
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`delivery-view-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "service_orders", filter: `id=eq.${orderId}` },
        (payload) => {
          const updated = payload.new as Order;
          if (updated) setOrder(updated);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  /* ── Polling fallback: refetch enquanto status não é terminal ──
     Protege contra o caso de service_orders não estar no supabase_realtime
     publication. Para de rodar assim que o pedido atinge um estado final. */
  useEffect(() => {
    if (!orderId) return;
    const terminal = ['completed', 'finalizada', 'finalizado', 'delivered', 'cancelled', 'cancelada'];
    if (order && terminal.includes(order.status)) return;
    const interval = setInterval(() => { fetchOrder(); }, 6000);
    return () => clearInterval(interval);
  }, [orderId, order?.status, fetchOrder]);

  /* ── Calculate route polyline (dinâmica: motoboy → loja → cliente) ── */
  useEffect(() => {
    if (!order?.pickup_lat || !order?.pickup_lng || !order?.destination_lat || !order?.destination_lng) return;
    const step = order ? (STATUS_MAP[order.status]?.stepIndex ?? 0) : 0;
    let alive = true;

    const calcRoute = async () => {
      try {
        let from: { lat: number; lng: number };
        let to: { lat: number; lng: number };

        if (motoboyLocation && step === 1) {
          // Motoboy indo à loja: motoboy → loja (coleta)
          from = motoboyLocation;
          to = { lat: order.pickup_lat!, lng: order.pickup_lng! };
        } else if (motoboyLocation && step >= 2) {
          // Motoboy entregando: motoboy → cliente (destino)
          from = motoboyLocation;
          to = { lat: order.destination_lat!, lng: order.destination_lng! };
        } else {
          // Ainda procurando / sem posição: rota fixa loja → cliente
          from = { lat: order.pickup_lat!, lng: order.pickup_lng! };
          to = { lat: order.destination_lat!, lng: order.destination_lng! };
        }

        const route = await fetchMapboxRoute(from, to);
        if (!alive) return;
        if (route?.geometry?.coordinates) {
          const coords: [number, number][] = route.geometry.coordinates
            .filter((c: any) => Array.isArray(c) && c.length >= 2)
            .map((c: number[]) => [c[1], c[0]]);
          setRoutePolyline(coords);
        }
      } catch (e) {
        console.warn("[MerchantDeliveryView] route fetch failed:", e);
      }
    };

    calcRoute();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    order?.pickup_lat, order?.pickup_lng,
    order?.destination_lat, order?.destination_lng,
    order?.status,
    motoboyLocation?.lat, motoboyLocation?.lng,
  ]);

  /* ── Copy pickup code ── */
  const copyCode = async () => {
    if (!order?.pickup_code) return;
    const text = order.pickup_code;
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch { /* ignore */ }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, text.length);
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { /* ignore */ }
    }
    if (ok) {
      setCopied(true);
      toast.success("Código copiado!");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Não foi possível copiar.");
    }
  };

  /* ── Cancel order ── */
  const handleCancel = async () => {
    if (!orderId) return;
    if (!window.confirm("Cancelar a chamada? Esta ação não pode ser desfeita.")) return;
    setIsCancelling(true);
    try {
      const { error } = await supabase
        .from("service_orders")
        .update({ status: "cancelled" })
        .eq("id", orderId);
      if (error) throw error;
      toast.success("Chamada cancelada.");
      setOrder((prev) => prev ? { ...prev, status: "cancelled" } : prev);
    } catch (err: any) {
      toast.error(`Erro ao cancelar: ${err?.message ?? "tente novamente"}`);
    } finally {
      setIsCancelling(false);
    }
  };

  /* ── Map markers ── */
  const mapMarkers: MapMarker[] = [];
  if (order?.pickup_lat && order?.pickup_lng) {
    const storeName = storeInfo?.nome_loja || order.store_name || "Loja";
    const storeAddress = storeInfo?.endereco || order.pickup_location || order.store_address || null;
    const storeLogo = storeInfo?.logo_url || order.store_logo_url || undefined;
    mapMarkers.push({
      id: "origin",
      lat: order.pickup_lat,
      lng: order.pickup_lng,
      type: "origin",
      label: storeName,
      avatar_url: storeLogo,
      popup: {
        title: storeName,
        address: storeAddress && !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(storeAddress.trim())
          ? storeAddress
          : undefined,
      },
    });
  }
  if (order?.destination_lat && order?.destination_lng) {
    mapMarkers.push({ id: "destination", lat: order.destination_lat, lng: order.destination_lng, type: "destination", label: "Cliente" });
  }
  if (motoboyLocation) {
    const motoboyName = motoboy?.nome_completo ?? "Motoboy";
    const motoboyAvatar = motoboy?.foto_url
      || `https://ui-avatars.com/api/?name=${encodeURIComponent(motoboyName)}&background=f97316&color=fff&size=128&bold=true&format=png`;
    mapMarkers.push({
      id: "motoboy",
      lat: motoboyLocation.lat,
      lng: motoboyLocation.lng,
      type: "motoboy",
      label: motoboyName,
      avatar_url: motoboyAvatar,
    });
  }

  /* ── Status helpers ── */
  const statusInfo = order ? (STATUS_MAP[order.status] ?? { stepIndex: 0, badge: order.status, badgeClass: "bg-slate-500 text-white" }) : null;

  /* ── Currency formatter ── */
  const brl = (v: number | null) =>
    v !== null ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v) : "—";

  /* ── Render ── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground font-medium">Entrega não encontrada</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Top Bar ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 font-mono font-bold uppercase tracking-widest">Acompanhar Entrega</p>
          <p className="text-sm font-bold text-slate-800 font-mono">#{order.id.slice(0, 8).toUpperCase()}</p>
        </div>
        {statusInfo && (
          <Badge className={`shrink-0 text-xs font-semibold px-3 py-1 rounded-full border-0 ${statusInfo.badgeClass}`}>
            {statusInfo.badge}
          </Badge>
        )}
      </div>

      <div className="xl:flex xl:h-[calc(100vh-57px)]">

        {/* ── MAP ── */}
        <div className="h-64 xl:h-full xl:flex-1 relative bg-slate-200">
          {mapMarkers.length >= 1 ? (
            <SimpleMap
              markers={mapMarkers}
              showRoute={mapMarkers.length >= 2}
              useRealRoute={false}
              preCalculatedPolyline={routePolyline ?? (mapMarkers.length >= 2 ? [[mapMarkers[0].lat, mapMarkers[0].lng], [mapMarkers[mapMarkers.length - 1].lat, mapMarkers[mapMarkers.length - 1].lng]] : undefined)}
              routeColor="green"
              className="w-full h-full"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-500">Carregando mapa…</p>
              </div>
            </div>
          )}

          {/* Map Overlay Badge */}
          {isActive && (
            <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg border border-slate-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-bold text-slate-700">Rota de Envio</span>
            </div>
          )}
        </div>

        {/* ── SIDEBAR / DETAILS ── */}
        <div className="xl:w-[400px] xl:overflow-y-auto bg-white xl:border-l xl:border-slate-100">
          <div className="p-4 space-y-4">

            {/* ── Foto do Produto (destaque) ── */}
            {product?.image_url && product.image_url !== "/placeholder.svg" && (
              <Card className="border-slate-100 shadow-sm overflow-hidden">
                <div className="relative">
                  <img
                    src={product.image_url}
                    alt={product.name ?? "Produto"}
                    className="w-full h-48 object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-white/80 shrink-0" />
                      <p className="text-xs font-bold text-white/70 uppercase tracking-widest">Produto da Entrega</p>
                    </div>
                    {product.name && (
                      <p className="text-white font-bold text-lg mt-1 truncate">{product.name}</p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* ── Linha do Tempo de Eventos ── */}
            {(() => {
              const fmtTs = (ts: string | null | undefined) =>
                ts ? format(new Date(ts), "HH:mm", { locale: ptBR }) : null;

              const currentStep = statusInfo?.stepIndex ?? 0;

              const productImg = product?.image_url && product.image_url !== "/placeholder.svg"
                ? product.image_url
                : null;

              const events: {
                icon: React.ElementType;
                image?: string | null;
                label: string;
                sublabel?: string;
                ts: string | null;
                done: boolean;
                current: boolean;
                colour: string;
              }[] = [
                  {
                    icon: Package,
                    image: productImg,
                    label: "Entrega criada",
                    sublabel: order?.customer_name ? `Para ${order.customer_name}` : undefined,
                    ts: fmtTs(order?.created_at),
                    done: true,
                    current: false,
                    colour: "bg-slate-500",
                  },
                  {
                    icon: Bike,
                    label: "Buscando Motoboy",
                    sublabel: motoboy?.nome_completo ?? undefined,
                    ts: fmtTs(offerSnapshot?.accepted_at),
                    done: currentStep >= 1 || isCompleted,
                    current: currentStep === 0 && !isCompleted && !isCancelled,
                    colour: "bg-green-500",
                  },
                  {
                    icon: Navigation,
                    label: "A caminho da loja",
                    sublabel: order?.pickup_location
                      ? order.pickup_location.replace(/^-?\d+\.\d+,\s*-?\d+\.\d+$/, "Loja")
                      : undefined,
                    ts: fmtTs(offerSnapshot?.accepted_at),
                    done: currentStep >= 2 || isCompleted,
                    current: currentStep === 1 && !isCompleted,
                    colour: "bg-green-500",
                  },
                  {
                    icon: Check,
                    label: "Retirada confirmada",
                    sublabel: order?.pickup_code ? `Código: ${order.pickup_code}` : undefined,
                    ts: null,
                    done: currentStep >= 2 || isCompleted,
                    current: false,
                    colour: "bg-green-500",
                  },
                  {
                    icon: Package,
                    label: "Em entrega ao cliente",
                    sublabel: order?.destination && !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(order.destination.trim())
                      ? order.destination
                      : undefined,
                    ts: null,
                    done: currentStep >= 3 || isCompleted,
                    current: currentStep === 2 && !isCompleted,
                    colour: "bg-green-500",
                  },
                  {
                    icon: CheckCircle2,
                    label: "Entrega concluída",
                    sublabel: undefined,
                    ts: null,
                    done: isCompleted,
                    current: false,
                    colour: "bg-green-500",
                  },
                ];

              return (
                <Card className="border-slate-100 shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                      Linha do Tempo
                    </p>

                    <div className="relative">
                      {/* Linha vertical */}
                      <div className="absolute left-3 top-3 bottom-3 w-px bg-slate-100" />

                      <div className="space-y-0">
                        {events.map((ev, i) => {
                          const EvIcon = ev.icon;
                          const isLast = i === events.length - 1;
                          return (
                            <div key={i} className="flex items-start gap-3 relative">
                              {/* Bolinha (ou thumbnail do produto) */}
                              {ev.image ? (
                                <img
                                  src={ev.image}
                                  alt={ev.label}
                                  className="relative z-10 mt-0.5 w-9 h-9 rounded-xl object-cover shrink-0 ring-2 ring-white shadow-md border border-slate-200"
                                />
                              ) : (
                                <div className={`relative z-10 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${ev.done
                                    ? ev.colour
                                    : ev.current
                                      ? `${ev.colour} animate-pulse opacity-80`
                                      : "bg-slate-100"
                                  }`}>
                                  <EvIcon className={`h-3.5 w-3.5 ${ev.done || ev.current ? "text-white" : "text-slate-300"}`} />
                                </div>
                              )}

                              {/* Conteúdo */}
                              <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-4"}`}>
                                <div className="flex items-center justify-between gap-2">
                                  <p className={`text-sm font-semibold leading-tight ${ev.done ? "text-slate-700" : ev.current ? "text-primary" : "text-slate-300"
                                    }`}>
                                    {ev.label}
                                  </p>
                                  {ev.ts && (
                                    <span className="text-[11px] font-mono text-slate-400 shrink-0">{ev.ts}</span>
                                  )}
                                  {!ev.ts && ev.current && (
                                    <span className="text-[10px] text-primary font-bold animate-pulse shrink-0">agora</span>
                                  )}
                                </div>
                                {ev.sublabel && (
                                  <p className="text-xs text-slate-400 mt-0.5 truncate">{ev.sublabel}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {isCancelled && (
                      <div className="mt-3 flex items-center gap-2 bg-destructive/10 text-destructive rounded-lg p-2.5 text-sm">
                        <X className="h-4 w-4 shrink-0" />
                        <span className="font-semibold">Entrega cancelada</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {/* ── Cancelar chamada (só quando ainda buscando motoboy) ── */}
            {isActive && !order.motoboy_id && (
              <Button
                className="w-full bg-red-600 hover:bg-red-700 text-yellow-300 font-semibold border-0"
                onClick={handleCancel}
                disabled={isCancelling}
              >
                <X className="h-4 w-4 mr-2" />
                {isCancelling ? "Cancelando..." : "Cancelar chamada"}
              </Button>
            )}

            {/* ── Motoboy Card (when assigned) ── */}
            {motoboy && (
              <Card className="border-blue-100 bg-blue-50/50 shadow-sm">
                <CardContent className="p-4 space-y-3">
                  {/* Cabeçalho: foto + nome + telefone */}
                  <div className="flex items-center gap-4">
                    {motoboy.foto_url ? (
                      <img src={motoboy.foto_url} alt={motoboy.nome_completo ?? ""} className="w-12 h-12 rounded-full object-cover border-2 border-blue-200 shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <Bike className="h-6 w-6 text-blue-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-0.5">Motoboy Atribuído</p>
                      <p className="font-bold text-slate-800 truncate">{motoboy.nome_completo ?? "Entregador"}</p>
                      {motoboy.phone && (
                        <p className="text-sm text-slate-500 flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {motoboy.phone}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Dados do veículo */}
                  {(motoboy.veiculo_marca || motoboy.veiculo_modelo || motoboy.veiculo_placa) && (
                    <div className="bg-blue-100/60 rounded-xl px-3 py-2.5 flex items-center gap-3">
                      <Bike className="h-4 w-4 text-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        {(motoboy.veiculo_marca || motoboy.veiculo_modelo) && (
                          <p className="text-sm font-bold text-slate-700 truncate">
                            {[motoboy.veiculo_marca, motoboy.veiculo_modelo].filter(Boolean).join(" ")}
                            {motoboy.veiculo_cor ? <span className="font-normal text-slate-500"> · {motoboy.veiculo_cor}</span> : null}
                          </p>
                        )}
                        {motoboy.veiculo_placa && (
                          <p className="text-xs font-mono font-bold text-blue-600 uppercase tracking-widest mt-0.5">
                            🪪 {motoboy.veiculo_placa}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── Pickup Code ── */}
            {order.pickup_code && (
              <Card className="border-amber-100 bg-amber-50/50 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-2">Código de Retirada</p>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-3xl font-black font-mono tracking-[0.4em] text-amber-700">{order.pickup_code}</p>
                    <Button size="sm" variant="outline" className="border-amber-200 text-amber-700 hover:bg-amber-100" onClick={copyCode}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-amber-600 mt-2">Forneça este código ao motoboy ao retirar o produto</p>
                </CardContent>
              </Card>
            )}

            {/* ── Route Info ── */}
            <Card className="border-slate-100 shadow-sm">
              <CardContent className="p-4 space-y-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Rota de Envio</p>

                {/* Origin */}
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Coleta na Loja</p>
                    <p className="text-sm font-semibold text-slate-700 line-clamp-2">{order.pickup_location ?? "Endereço da loja"}</p>
                  </div>
                </div>

                {/* Dashed separator */}
                <div className="ml-4 border-l-2 border-dashed border-slate-200 h-4" />

                {/* Destination */}
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Navigation className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Entrega ao Cliente</p>
                    <p className="text-sm font-semibold text-slate-700 line-clamp-2">
                      {order.destination && /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(order.destination.trim())
                        ? "Processando endereço..."
                        : order.destination ?? "Endereço do cliente"}
                    </p>
                  </div>
                </div>

                {/* Distance & ETA */}
                {(order.distance_km || order.pickup_estimated_minutes) && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {order.distance_km && (
                      <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                        <Ruler className="h-4 w-4 text-slate-400 mx-auto mb-1" />
                        <p className="text-xs text-slate-400 font-medium">Distância</p>
                        <p className="font-bold text-slate-700">{order.distance_km.toFixed(1)} km</p>
                      </div>
                    )}
                    {order.pickup_estimated_minutes && (
                      <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                        <Clock className="h-4 w-4 text-slate-400 mx-auto mb-1" />
                        <p className="text-xs text-slate-400 font-medium">Tempo est.</p>
                        <p className="font-bold text-slate-700">{order.pickup_estimated_minutes} min</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Customer Info ── */}
            <Card className="border-slate-100 shadow-sm">
              <CardContent className="p-4 space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cliente</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800">{order.customer_name ?? "Não informado"}</p>
                    {order.customer_phone && (
                      <p className="text-sm text-slate-500 flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {order.customer_phone}
                      </p>
                    )}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2">
                  <p className="text-xs text-slate-400 font-medium">Observações</p>
                  {order.notes && (
                    <p className="text-sm text-slate-700">{order.notes}</p>
                  )}
                  {(() => {
                    const deliveryCode = deriveDeliveryCode(order.id, order.pickup_code);
                    return (
                      <div className="flex items-start gap-2 text-sm text-slate-700 bg-amber-50 border border-amber-200 rounded-md p-2.5">
                        <Package className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="flex-1 space-y-2">
                          <p className="leading-snug">
                            Envie o código <span className="font-black text-amber-700">{deliveryCode}</span> ao cliente <span className="font-semibold">{order.customer_name ?? ''}</span>. O cliente deve apresentá-lo ao motoboy <span className="font-semibold">antes de receber o produto</span>.
                          </p>
                          <button
                            type="button"
                            onClick={async () => {
                              const text = String(deliveryCode);
                              let ok = false;
                              try {
                                if (navigator.clipboard && window.isSecureContext) {
                                  await navigator.clipboard.writeText(text);
                                  ok = true;
                                }
                              } catch { /* ignore — usa fallback */ }
                              if (!ok) {
                                try {
                                  const ta = document.createElement('textarea');
                                  ta.value = text;
                                  ta.setAttribute('readonly', '');
                                  ta.style.position = 'fixed';
                                  ta.style.top = '0';
                                  ta.style.left = '0';
                                  ta.style.opacity = '0';
                                  document.body.appendChild(ta);
                                  ta.focus();
                                  ta.select();
                                  ta.setSelectionRange(0, text.length);
                                  ok = document.execCommand('copy');
                                  document.body.removeChild(ta);
                                } catch { /* ignore */ }
                              }
                              if (ok) toast.success(`Código ${text} copiado!`);
                              else toast.error('Não foi possível copiar. Selecione manualmente.');
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors active:scale-95"
                          >
                            <Copy className="h-3.5 w-3.5" /> Copiar código
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>

            {/* ── Financial ── */}
            <Card className="border-slate-100 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Resumo Financeiro</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    <p className="text-sm font-semibold text-slate-700">Valor da entrega</p>
                  </div>
                  <p className="text-xl font-black text-primary">{brl(order.total_price)}</p>
                </div>
              </CardContent>
            </Card>

            {/* ── Order Meta ── */}
            <div className="flex items-center gap-2 px-1 pb-4">
              <Hash className="h-3.5 w-3.5 text-slate-400" />
              <p className="text-xs text-slate-400 font-mono">{order.id.slice(0, 16).toUpperCase()}</p>
              <Circle className="h-1 w-1 fill-slate-300 text-slate-300 mx-1" />
              <p className="text-xs text-slate-400">
                {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
