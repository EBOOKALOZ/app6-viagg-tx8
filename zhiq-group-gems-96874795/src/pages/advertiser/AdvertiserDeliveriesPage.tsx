import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Loader2, Plus, Package, Navigation, Clock,
  ChevronRight, Bike, CheckCircle2, X, RefreshCw,
  ArrowLeft, Truck, AlertCircle, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ProductImageUpload } from '@/components/advertiser/ProductImageUpload';
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { parseCoordinates } from "@/lib/coordinateParser";
import { calculateDeliveryValue } from "@/lib/deliveryPricing";
import { calculateRoute as fetchMapboxRoute } from "@/skills/maps/routeService";
import { reverseGeocodeDetails } from "@/skills/maps/geocodeService";
import { loadMerchantStore } from "@/lib/merchantStoreSave";

import { DestinationSection } from "@/components/delivery/create/DestinationSection";
import { CustomerFields } from "@/components/delivery/create/CustomerFields";
import { RouteDetailsCard } from "@/components/delivery/create/RouteDetailsCard";
import { ServiceSelectionCard } from "@/components/delivery/create/ServiceSelectionCard";
import { FinancialSummaryCard } from "@/components/delivery/create/FinancialSummaryCard";
import { DeliveryMapSection } from "@/components/delivery/create/DeliveryMapSection";

/* ═══════════════════════════════════════
   TYPES
═══════════════════════════════════════ */

interface DeliveryOrder {
  id: string;
  status: string;
  customer_name: string | null;
  destination: string | null;
  total_price: number | null;
  distance_km: number | null;
  created_at: string;
  product_id: string | null;
  metadata: Record<string, any> | null;
}

interface StoreData {
  id: string;
  nome_loja: string;
  latitude: number;
  longitude: number;
  logo_url: string | null;
  endereco_formatado: string | null;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
}

interface RouteInfo {
  distanceKm: number;
  durationMin: number;
  polyline: [number, number][];
  valorTotal: number;
}

/* ═══════════════════════════════════════
   STATUS CONFIG (LIST)
═══════════════════════════════════════ */

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string; icon: React.ElementType }> = {
  searching:             { label: "Procurando motoboy",  badgeClass: "bg-orange-100 text-orange-700 border-orange-200", icon: Bike },
  awaiting_professional: { label: "Procurando motoboy",  badgeClass: "bg-orange-100 text-orange-700 border-orange-200", icon: Bike },
  pending:               { label: "Procurando motoboy",  badgeClass: "bg-orange-100 text-orange-700 border-orange-200", icon: Bike },
  created:               { label: "Entrega criada",  badgeClass: "bg-orange-100 text-orange-700 border-orange-200", icon: Bike },
  calculating:           { label: "Calculando rota",     badgeClass: "bg-blue-100 text-blue-700 border-blue-200",       icon: Clock },
  accepted:              { label: "Motoboy a caminho",   badgeClass: "bg-blue-100 text-blue-700 border-blue-200",       icon: Bike },
  a_caminho:             { label: "A caminho",           badgeClass: "bg-blue-100 text-blue-700 border-blue-200",       icon: Bike },
  in_progress:           { label: "Em andamento",        badgeClass: "bg-primary/10 text-primary border-primary/20",   icon: Package },
  entregando:            { label: "Entregando",          badgeClass: "bg-primary/10 text-primary border-primary/20",   icon: Package },
  buscando:              { label: "Buscando",            badgeClass: "bg-primary/10 text-primary border-primary/20",   icon: Package },
  completed:             { label: "Entregue",            badgeClass: "bg-green-100 text-green-700 border-green-200",   icon: CheckCircle2 },
  finalizada:            { label: "Entregue",            badgeClass: "bg-green-100 text-green-700 border-green-200",   icon: CheckCircle2 },
  cancelled:             { label: "Cancelada",           badgeClass: "bg-red-100 text-red-700 border-red-200",         icon: X },
  cancelada:             { label: "Cancelada",           badgeClass: "bg-red-100 text-red-700 border-red-200",         icon: X },
};

const ACTIVE_STATUSES = [
  "searching", "awaiting_professional", "pending", "created",
  "calculating", "accepted", "a_caminho", "in_progress", "entregando", "buscando",
];

/* ═══════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════ */

export default function AdvertiserDeliveriesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<"list" | "create">("list");

  /* ── List state ── */
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [productImages, setProductImages] = useState<Record<string, string>>({});
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [searchDate, setSearchDate] = useState("");

  /* ── Create form state ── */
  const [store, setStore] = useState<StoreData | null>(null);
  const [isLoadingStore, setIsLoadingStore] = useState(false);

  const [destinationAddress, setDestinationAddress] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [productImage, setProductImage] = useState<string | null>(null);
  const [productName, setProductName] = useState<string | null>(null);

  const [manualDestCoords, setManualDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isMapSelectMode, setIsMapSelectMode] = useState(false);
  const [tempDestCoords, setTempDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [reverseGeocodedAddress, setReverseGeocodedAddress] = useState<string | null>(null);
  const [destDetails, setDestDetails] = useState<{ bairro: string; cidade: string; estado: string } | null>(null);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);

  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [serviceLevel, setServiceLevel] = useState<"standard" | "express">("standard");

  const [saldoAtual, setSaldoAtual] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  /* ══════════════════════════════════════
     LIST DATA
  ══════════════════════════════════════ */

  const fetchOrders = useCallback(async (showLoader = false) => {
    if (!user?.id) return;
    if (showLoader) setIsRefreshing(true);

    const { data, error } = await supabase
      .from("service_orders")
      .select("id, status, customer_name, destination, total_price, distance_km, created_at, product_id, metadata")
      .eq("merchant_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      const castOrders = data as DeliveryOrder[];
      setOrders(castOrders);

      // Buscar imagens dos produtos associados
      const productIds = castOrders
        .map(o => o.product_id)
        .filter((pid): pid is string => !!pid);
      const uniqueIds = [...new Set(productIds)];
      const map: Record<string, string> = {};

      if (uniqueIds.length > 0) {
        const { data: products } = await supabase
          .from("products")
          .select("id, image_url")
          .in("id", uniqueIds);
        if (products) {
          products.forEach((p: any) => { if (p.image_url) map[p.id] = p.image_url; });
        }
      }

      // Fallback: usar metadata.product_image_url para orders sem imagem na tabela products
      castOrders.forEach(o => {
        if (o.product_id && !map[o.product_id] && o.metadata?.product_image_url) {
          map[o.product_id] = o.metadata.product_image_url;
        }
        // Sem product_id mas com metadata
        if (!o.product_id && o.metadata?.product_image_url) {
          map[o.id] = o.metadata.product_image_url;
        }
      });

      setProductImages(map);
    }
    setIsLoadingList(false);
    setIsRefreshing(false);
  }, [user?.id]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("advertiser-deliveries-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_orders" }, () => fetchOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchOrders]);

  /* ══════════════════════════════════════
     CREATE FORM LOGIC
  ══════════════════════════════════════ */

  const openCreate = async () => {
    setView("create");
    setIsLoadingStore(true);

    // Reset form
    setDestinationAddress("");
    setCustomerName("");
    setCustomerPhone("");
    setDeliveryNotes("");
    setManualDestCoords(null);
    setReverseGeocodedAddress(null);
    setRouteInfo(null);

    try {
      const { exists, data: storeData } = await loadMerchantStore();
      if (!exists || !storeData?.latitude || !storeData?.longitude) {
        toast.error("Configure o endereço da sua conta primeiro");
        navigate("/anunciante/conta");
        return;
      }
      setStore({
        id: storeData.id,
        nome_loja: storeData.nome_loja || "Minha Loja",
        latitude: Number(storeData.latitude),
        longitude: Number(storeData.longitude),
        logo_url: storeData.logo_url || null,
        endereco_formatado: storeData.endereco_formatado || storeData.street || null,
        rua: storeData.street || null,
        numero: storeData.number || null,
        bairro: storeData.neighborhood || null,
        cidade: storeData.cidade || null,
        estado: storeData.estado || null,
      });

      // Fetch balance — fonte da verdade = carteira pay_* do merchant
      // (mesma conta debitada ao pagar o motoboy). RPC SECURITY DEFINER
      // contorna o mismatch de RLS (owner = store_id, não auth.uid()).
      setIsLoadingBalance(true);
      const { data: payWallet } = await supabase.rpc("get_my_merchant_pay_wallet");
      const availableCents = Number((payWallet as any)?.available_cents ?? 0);
      setSaldoAtual(availableCents / 100);
    } catch (e) {
      console.error("[openCreate]", e);
      toast.error("Erro ao carregar dados da loja");
    } finally {
      setIsLoadingStore(false);
      setIsLoadingBalance(false);
    }
  };

  /* ── Derived coords ── */
  const parsedCoordinates = useMemo(() => {
    if (!destinationAddress.trim()) return null;
    return parseCoordinates(destinationAddress);
  }, [destinationAddress]);

  const activeDestCoords = useMemo(() => {
    if (manualDestCoords) return manualDestCoords;
    if (parsedCoordinates?.success && parsedCoordinates.coordinates) {
      return { lat: parsedCoordinates.coordinates.latitude, lng: parsedCoordinates.coordinates.longitude };
    }
    return null;
  }, [manualDestCoords, parsedCoordinates]);

  const hasValidCoordinates = !!activeDestCoords;

  /* ── Route calculation ── */
  const calculateRoute = useCallback(async () => {
    if (!store || !activeDestCoords) return;
    setIsCalculatingRoute(true);
    try {
      const route = await fetchMapboxRoute(
        { lat: store.latitude, lng: store.longitude },
        { lat: activeDestCoords.lat, lng: activeDestCoords.lng }
      );
      if (!route) {
        toast.error("Não foi possível calcular a rota. Verifique o endereço.");
        setRouteInfo(null);
        return;
      }
      const km = Number((route.distance / 1000).toFixed(1));
      const min = Math.round(route.duration / 60);
      const valor = calculateDeliveryValue(km, serviceLevel);
      const coords = Array.isArray(route.geometry?.coordinates) ? route.geometry.coordinates : [];
      const polyline: [number, number][] = coords
        .filter((c: any) => Array.isArray(c) && c.length >= 2)
        .map((c: number[]) => [c[1], c[0]]);
      setRouteInfo({ distanceKm: km, durationMin: min, valorTotal: Number(valor), polyline });
    } catch (err) {
      console.error("[calculateRoute]", err);
      setRouteInfo(null);
    } finally {
      setIsCalculatingRoute(false);
    }
  }, [store, activeDestCoords, serviceLevel]);

  useEffect(() => {
    if (!activeDestCoords) { setRouteInfo(null); return; }
    const t = setTimeout(calculateRoute, 400);
    return () => clearTimeout(t);
  }, [activeDestCoords, calculateRoute, serviceLevel]);

  /* ── Reverse geocode ── */
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    setIsReverseGeocoding(true);
    try {
      const { data, error } = await supabase.functions.invoke("reverse-geocode", { body: { lat, lng } });
      if (!error && data?.address) {
        setReverseGeocodedAddress(data.address);
        setDestinationAddress(data.address);
      }
      const details = await reverseGeocodeDetails(lat, lng);
      setDestDetails(details);
    } catch (e) {
      console.error("[reverseGeocode]", e);
    } finally {
      setIsReverseGeocoding(false);
      setIsMapSelectMode(false);
    }
  }, []);

  const handleMarkerDrag = useCallback((_id: string, lat: number, lng: number) => {
    const ok = window.confirm(
      "⚠️ Modo de proteção ativo\n\nVocê está alterando a localização de entrega manualmente.\n\nDeseja confirmar a nova posição?"
    );
    if (!ok) {
      // Força re-render pra voltar o pino visualmente
      setManualDestCoords(prev => prev ? { ...prev } : prev);
      return;
    }
    setManualDestCoords({ lat, lng });
    setDestinationAddress(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    setReverseGeocodedAddress(null);
    reverseGeocode(lat, lng);
  }, [reverseGeocode]);

  const handleMapMouseMove = useCallback((lat: number, lng: number) => {
    if (isMapSelectMode) setTempDestCoords({ lat, lng });
  }, [isMapSelectMode]);

  /* ── Financial ── */
  const valorFinal = routeInfo?.valorTotal ?? null;
  const saldoApos = saldoAtual !== null && valorFinal !== null ? Number(saldoAtual) - Number(valorFinal) : null;

  /* ── Submit ── */
  const handleCreate = async () => {
    if (!store || !routeInfo || !activeDestCoords || !user?.id) return;
    setIsCreating(true);
    try {
      const payload = {
        p_store_id: store.id,
        pickup_lat: store.latitude,
        pickup_lng: store.longitude,
        drop_lat: activeDestCoords.lat,
        drop_lng: activeDestCoords.lng,
        p_customer_name: customerName.trim(),
        p_customer_phone: customerPhone.trim() || null,
        p_notes: deliveryNotes.trim() || null,
        p_estimated_value: routeInfo.valorTotal,
        p_distance_km: routeInfo.distanceKm,
        p_pickup_address: store.endereco_formatado || store.rua || "Loja",
        p_destination_address: (() => {
          const isRawCoord = (s: string) => /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(s.trim());
          if (reverseGeocodedAddress) return reverseGeocodedAddress;
          if (destinationAddress && !isRawCoord(destinationAddress)) return destinationAddress;
          return null;
        })(),
      };

      const { data, error } = await supabase.rpc("create_delivery_order", payload as any);
      if (error) throw error;

      const orderId = data as string;

      // Upload e salvar imagem do produto no metadata
      if (productImage) {
        (async () => {
          try {
            let imageUrl = productImage;

            // Se é data URI, converter para blob e fazer upload
            if (productImage.startsWith("data:")) {
              const res = await fetch(productImage);
              const blob = await res.blob();
              const fileName = `${Date.now()}-product.jpg`;
              const filePath = `${user.id}/delivery-products/${orderId}/${fileName}`;

              const { error: upErr } = await supabase.storage
                .from("marketing-materials")
                .upload(filePath, blob, { contentType: "image/jpeg", upsert: false });

              if (!upErr) {
                const { data: { publicUrl } } = supabase.storage
                  .from("marketing-materials")
                  .getPublicUrl(filePath);
                imageUrl = publicUrl;
              } else {
                console.warn("[handleCreate] upload failed, saving data URI:", upErr.message);
              }
            }

            await supabase
              .from("service_orders")
              .update({ metadata: { product_image_url: imageUrl } })
              .eq("id", orderId);
          } catch (e) {
            console.warn("[handleCreate] product image save failed:", e);
          }
        })();
      }

      // Geocoding em background
      supabase.functions.invoke("process-delivery-geocoding", {
        body: { delivery_id: orderId, pickup_address: store.endereco_formatado, destination_address: destinationAddress },
      }).catch(console.error);

      toast.success("Entrega criada!", { description: "Buscando motoboy para sua entrega." });
      navigate(`/anunciante/entregas/${orderId}`);
    } catch (e: any) {
      toast.error("Erro ao criar entrega", { description: e.message });
    } finally {
      setIsCreating(false);
    }
  };

  const isButtonDisabled =
    !routeInfo || !destinationAddress.trim() || !customerName.trim() ||
    isCalculatingRoute || isCreating || isLoadingStore ||
    saldoApos === null || saldoApos < 0;

  /* ══════════════════════════════════════
     HELPERS
  ══════════════════════════════════════ */

  const brl = (v: number | null) =>
    v !== null ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v) : "—";

  // Filtro da lista — DEVE ficar antes de qualquer return condicional
  // (Rules of Hooks): a CREATE VIEW abaixo faz early return.
  const filteredOrders = useMemo(() => {
    const nameQ = searchName.trim().toLowerCase();
    const dateQ = searchDate.trim();
    return orders.filter(o => {
      if (nameQ && !(o.customer_name ?? "").toLowerCase().includes(nameQ)) return false;
      if (dateQ) {
        const orderDate = format(new Date(o.created_at), "yyyy-MM-dd");
        if (orderDate !== dateQ) return false;
      }
      return true;
    });
  }, [orders, searchName, searchDate]);

  const hasFilters = searchName.trim() !== "" || searchDate.trim() !== "";

  /* ══════════════════════════════════════
     CREATE VIEW
  ══════════════════════════════════════ */

  if (view === "create") {
    if (isLoadingStore) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    return (
      <>
        {/* ── MOBILE ── */}
        <div className="xl:hidden w-full">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background sticky top-0 z-20">
            <Button variant="ghost" size="icon" onClick={() => setView("list")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <p className="font-bold text-slate-800">Nova Entrega</p>
              {store && <p className="text-xs text-slate-400">{store.nome_loja}</p>}
            </div>
          </div>

          <div className="p-4 space-y-4">
              {store && <RouteDetailsCard routeInfo={routeInfo} isCalculating={isCalculatingRoute} hasValidCoordinates={hasValidCoordinates} />}

              {/* Upload de imagem do produto */}
              <ProductImageUpload
                onImageSelect={setProductImage}
                onProductPick={(p) => { setProductImage(p.image); setProductName(p.title); }}
              />

              <DestinationSection
                destinationAddress={destinationAddress}
                onAddressChange={(v) => { setManualDestCoords(null); setReverseGeocodedAddress(null); setDestinationAddress(v); }}
                hasValidCoordinates={hasValidCoordinates}
                isMapSelectMode={isMapSelectMode}
                onToggleMapSelect={() => setIsMapSelectMode(p => !p)}
                reverseGeocodedAddress={reverseGeocodedAddress}
                isReverseGeocoding={isReverseGeocoding}
              />

              <CustomerFields
                customerName={customerName} customerPhone={customerPhone} deliveryNotes={deliveryNotes}
                onNameChange={setCustomerName} onPhoneChange={setCustomerPhone} onNotesChange={setDeliveryNotes}
              />

              <ServiceSelectionCard serviceLevel={serviceLevel} onSelectService={setServiceLevel} />

              {store?.latitude && store?.longitude && (
                <DeliveryMapSection
                  store={store} destCoords={activeDestCoords} routeInfo={routeInfo}
                  onMarkerDragEnd={handleMarkerDrag} isMapSelectMode={isMapSelectMode}
                  tempDestCoords={tempDestCoords} onMapMouseMove={handleMapMouseMove}
                  destDetails={destDetails} customerName={customerName} customerPhone={customerPhone}
                  productName={productName} productImage={productImage}
                  onPasteCoords={(lat, lng) => { setManualDestCoords({ lat, lng }); setDestinationAddress(`${lat.toFixed(6)}, ${lng.toFixed(6)}`); reverseGeocode(lat, lng); }}
                />
              )}

              {saldoApos !== null && saldoApos < 0 && (
                <div className="flex items-center gap-2 bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Saldo insuficiente para realizar a entrega.</span>
                </div>
              )}

              {store && (
                <div className="rounded-xl shadow-sm bg-card border">
                  <FinancialSummaryCard
                    saldoDisplay={saldoAtual} valorFinal={valorFinal}
                    saldoApos={saldoApos} isLoadingBalance={isLoadingBalance}
                    distanceKm={routeInfo?.distanceKm}
                  />
                </div>
              )}
          </div>

          <div className="sticky bottom-0 bg-background border-t border-border px-4 py-4 z-40">
            <Button className="w-full h-14 text-lg font-semibold" onClick={handleCreate} disabled={isButtonDisabled}>
              {isCreating
                ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Processando…</>
                : <><Truck className="h-5 w-5 mr-2" /> Solicitar motoboy agora</>}
            </Button>
          </div>
        </div>

        {/* ── DESKTOP ── */}
        <div className="hidden xl:flex w-full h-[calc(100vh-64px)]">
          {/* Left — Map */}
          <div className="relative flex-1 min-w-0">
            {store?.latitude && store?.longitude && (
              <DeliveryMapSection
                store={store} destCoords={activeDestCoords} routeInfo={routeInfo}
                onMarkerDragEnd={handleMarkerDrag} isDesktopFullHeight
                isMapSelectMode={isMapSelectMode} tempDestCoords={tempDestCoords}
                onMapMouseMove={handleMapMouseMove} destDetails={destDetails}
                customerName={customerName} customerPhone={customerPhone}
                productName={productName} productImage={productImage}
                onPasteCoords={(lat, lng) => { setManualDestCoords({ lat, lng }); setDestinationAddress(`${lat.toFixed(6)}, ${lng.toFixed(6)}`); reverseGeocode(lat, lng); }}
              />
            )}
          </div>

          {/* Right — Sidebar */}
          <div className="w-[380px] 2xl:w-[420px] border-l border-border bg-muted/30 flex flex-col overflow-y-auto">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <Button variant="ghost" size="icon" onClick={() => setView("list")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <p className="font-bold">Nova Entrega</p>
                {store && <p className="text-xs text-slate-400">{store.nome_loja}</p>}
              </div>
            </div>

            <div className="p-5 space-y-5 flex-1">
              {/* Upload de imagem do produto */}
              <ProductImageUpload
                onImageSelect={setProductImage}
                onProductPick={(p) => { setProductImage(p.image); setProductName(p.title); }}
              />

              <DestinationSection
                destinationAddress={destinationAddress}
                onAddressChange={(v) => { setManualDestCoords(null); setReverseGeocodedAddress(null); setDestinationAddress(v); }}
                hasValidCoordinates={hasValidCoordinates}
                isMapSelectMode={isMapSelectMode}
                onToggleMapSelect={() => setIsMapSelectMode(p => !p)}
                reverseGeocodedAddress={reverseGeocodedAddress}
                isReverseGeocoding={isReverseGeocoding}
              />

              <CustomerFields
                customerName={customerName} customerPhone={customerPhone} deliveryNotes={deliveryNotes}
                onNameChange={setCustomerName} onPhoneChange={setCustomerPhone} onNotesChange={setDeliveryNotes}
              />

              <ServiceSelectionCard serviceLevel={serviceLevel} onSelectService={setServiceLevel} />

              {saldoApos !== null && saldoApos < 0 && (
                <div className="flex items-center gap-2 bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Saldo insuficiente para realizar a entrega.</span>
                </div>
              )}

              {hasValidCoordinates && store && (
                <div className="rounded-xl shadow-sm bg-card border">
                  <FinancialSummaryCard
                    saldoDisplay={saldoAtual} valorFinal={valorFinal}
                    saldoApos={saldoApos} isLoadingBalance={isLoadingBalance}
                    distanceKm={routeInfo?.distanceKm}
                  />
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-background border-t border-border p-5">
              <Button className="w-full h-14 text-lg font-semibold" onClick={handleCreate} disabled={isButtonDisabled}>
                {isCreating
                  ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Processando…</>
                  : <><Truck className="h-5 w-5 mr-2" /> Solicitar motoboy agora</>}
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ══════════════════════════════════════
     LIST VIEW
  ══════════════════════════════════════ */

  const renderCard = (order: DeliveryOrder) => {
    const cfg = STATUS_CONFIG[order.status] ?? { label: order.status, badgeClass: "bg-slate-100 text-slate-600 border-slate-200", icon: Package };
    const StatusIcon = cfg.icon;

    const productImgUrl = (order.product_id ? productImages[order.product_id] : null)
      || productImages[order.id]
      || null;

    return (
      <button
        key={order.id}
        className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all p-4 flex items-start gap-3"
        onClick={() => navigate(`/anunciante/entregas/${order.id}`)}
      >
        {/* Foto do produto ou ícone de status */}
        {productImgUrl ? (
          <img
            src={productImgUrl}
            alt=""
            className="w-12 h-12 rounded-xl object-cover shrink-0 mt-0.5 border border-slate-200 shadow-sm"
          />
        ) : (
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${cfg.badgeClass}`}>
            <StatusIcon className="h-5 w-5" />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-slate-800 truncate">{order.customer_name ?? "Cliente"}</p>
            <Badge variant="outline" className={`shrink-0 text-[11px] font-semibold border ${cfg.badgeClass}`}>
              {cfg.label}
            </Badge>
          </div>
          {order.destination && (
            <div className="flex items-start gap-1.5">
              <Navigation className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 line-clamp-1">
                {/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(order.destination.trim())
                  ? "Endereço em processamento..."
                  : order.destination}
              </p>
            </div>
          )}
          <div className="flex items-center gap-3 pt-0.5">
            {order.distance_km && <span className="text-xs text-slate-400">{order.distance_km.toFixed(1)} km</span>}
            <span className="text-xs font-bold text-primary">{brl(order.total_price)}</span>
            <span className="text-xs text-slate-300 ml-auto">
              {format(new Date(order.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
            </span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-slate-300 shrink-0 mt-3" />
      </button>
    );
  };

  if (isLoadingList) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Minhas Entregas</h1>
          <p className="text-sm text-slate-400">{orders.length} entrega{orders.length !== 1 ? "s" : ""} no total</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => fetchOrders(true)} disabled={isRefreshing} className="text-slate-400">
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" className="gap-1.5 font-semibold" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nova
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-6">
        {/* Search */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-900" />
            <Input
              type="text"
              placeholder="Pesquisar por nome do cliente"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              className="pl-9 h-10 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-900 [&::-webkit-calendar-picker-indicator]:invert-0"
            />
          </div>
          <Input
            type="date"
            value={searchDate}
            onChange={(e) => setSearchDate(e.target.value)}
            className="h-10 bg-slate-50 border-slate-200 sm:w-44 text-slate-900 placeholder:text-slate-900 [color-scheme:light]"
          />
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearchName(""); setSearchDate(""); }}
              className="text-slate-500 h-10"
            >
              <X className="h-4 w-4 mr-1" /> Limpar
            </Button>
          )}
        </div>

      {/* Unified list of deliveries sorted by newest first */}
      {filteredOrders.length > 0 ? (
        <section>
          <div className="space-y-3">
            {filteredOrders.map(renderCard)}
          </div>
        </section>
      ) : (
        // Empty state already handled below
        null
      )}

        {/* Empty */}
        {orders.length === 0 && (
          <div className="py-20 flex flex-col items-center gap-5">
            <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center">
              <Package className="h-10 w-10 text-slate-300" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-slate-700 font-bold text-lg">Nenhuma entrega ainda</p>
              <p className="text-slate-400 text-sm">Crie sua primeira entrega agora</p>
            </div>
            <Button onClick={openCreate} className="gap-2 font-semibold">
              <Plus className="h-4 w-4" /> Criar entrega
            </Button>
          </div>
        )}

        {/* No results for filter */}
        {orders.length > 0 && filteredOrders.length === 0 && (
          <div className="py-16 flex flex-col items-center gap-3 text-center">
            <Search className="h-10 w-10 text-slate-300" />
            <p className="text-slate-700 font-semibold">Nenhum resultado encontrado</p>
            <p className="text-slate-400 text-sm">Tente outro nome ou data.</p>
          </div>
        )}
      </div>
    </div>
  );
}
