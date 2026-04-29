import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Truck, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { parseCoordinates } from "@/lib/coordinateParser";
import { calculateDeliveryValue } from "@/lib/deliveryPricing";
import { calculateRoute as fetchMapboxRoute } from "@/skills/maps/routeService";
import { reverseGeocodeDetails } from "@/skills/maps/geocodeService";


import { HeaderBar } from "@/components/delivery/create/HeaderBar";
import { DestinationSection } from "@/components/delivery/create/DestinationSection";
import { CustomerLocationCard } from "@/components/delivery/create/CustomerLocationCard";
import { CustomerFields } from "@/components/delivery/create/CustomerFields";
import { RouteDetailsCard } from "@/components/delivery/create/RouteDetailsCard";
import { ServiceSelectionCard } from "@/components/delivery/create/ServiceSelectionCard";
import { FinancialSummaryCard } from "@/components/delivery/create/FinancialSummaryCard";
import { DeliveryMapSection } from "@/components/delivery/create/DeliveryMapSection";
import { loadMerchantStore } from "@/lib/merchantStoreSave";

/* ───────────────────── Types ───────────────────── */

interface StoreData {
  nome_loja: string;
  logo_url: string | null;
  latitude: number;
  longitude: number;
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

/* ───────────────────── Component ───────────────────── */

export default function CreateDelivery() {
  const { user } = useAuth();
  const navigate = useNavigate();

  /* ── State ── */
  const [saldoAtual, setSaldoAtual] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [store, setStore] = useState<StoreData | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const [destinationAddress, setDestinationAddress] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");

  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [isCreatingDelivery, setIsCreatingDelivery] = useState(false);


  const [manualDestCoords, setManualDestCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [isMapSelectMode, setIsMapSelectMode] = useState(false);
  const [tempDestCoords, setTempDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [reverseGeocodedAddress, setReverseGeocodedAddress] = useState<string | null>(null);
  const [destDetails, setDestDetails] = useState<{ bairro: string; cidade: string; estado: string } | null>(null);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [serviceLevel, setServiceLevel] = useState<'standard' | 'express'>('standard');


  /* ── Derived ── */

  const parsedCoordinates = useMemo(() => {
    if (!destinationAddress.trim()) return null;
    return parseCoordinates(destinationAddress);
  }, [destinationAddress]);

  const activeDestCoords = useMemo(() => {
    if (manualDestCoords) return manualDestCoords;
    if (parsedCoordinates?.success && parsedCoordinates.coordinates) {
      return {
        lat: parsedCoordinates.coordinates.latitude,
        lng: parsedCoordinates.coordinates.longitude,
      };
    }
    return null;
  }, [manualDestCoords, parsedCoordinates]);

  const hasValidCoordinates = !!activeDestCoords;

  const valorFinal = routeInfo?.valorTotal ?? null;
  const saldoDisplay = saldoAtual;
  const saldoApos = saldoDisplay !== null && valorFinal !== null ? Number(saldoDisplay) - Number(valorFinal) : null;
  const canCreate = saldoApos !== null && saldoApos >= 0;

  /* ── Fetch store & URL Params ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get("customer_name");
    const phone = params.get("customer_phone");
    const intentionId = params.get("intention_id");
    const productId = params.get("product_id");

    if (name) setCustomerName(decodeURIComponent(name));
    if (phone) setCustomerPhone(decodeURIComponent(phone));

    // Priority Data Fetching logic
    const fetchRealData = async () => {
      try {
        let finalName = name ? decodeURIComponent(name) : "";
        let finalPhone = phone ? decodeURIComponent(phone) : "";

        // Source 1: If intentionId is provided directly
        if (intentionId) {
          const { data: intention } = await supabase
            .from("purchase_intentions")
            .select("customer_name, customer_whatsapp, visitor_id")
            .eq("id", intentionId)
            .maybeSingle();

          if (intention) {
            if (!finalName) finalName = intention.customer_name;
            if (!finalPhone) finalPhone = intention.customer_whatsapp;

            // Optional: enrich from visitor profile if still missing
            if ((!finalName || !finalPhone) && intention.visitor_id) {
              const { data: visitor } = await supabase
                .from("visitor_profiles")
                .select("full_name, whatsapp")
                .eq("id", intention.visitor_id)
                .maybeSingle();
              
              if (visitor) {
                if (!finalName) finalName = visitor.full_name;
                if (!finalPhone) finalPhone = visitor.whatsapp;
              }
            }
          }
        } 
        // Source 2: If only product_id is provided, look for the most recent intention
        else if (productId) {
          const { data: latestIntention } = await supabase
            .from("purchase_intentions")
            .select("customer_name, customer_whatsapp, visitor_id")
            .eq("store_id", (await supabase.from('products').select('store_id').eq('id', productId).single()).data?.store_id) // This is complex, better use a subquery or fixed logic
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          
          // Actually, merchant_products might be better
          // Let's refine this to be more precise: find intentions where this product is present in items
          const { data: intentionItem } = await supabase
            .from("purchase_intention_items")
            .select("intention_id")
            .eq("product_id", productId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (intentionItem?.intention_id) {
            const { data: intention } = await supabase
              .from("purchase_intentions")
              .select("customer_name, customer_whatsapp")
              .eq("id", intentionItem.intention_id)
              .maybeSingle();
            
            if (intention) {
              if (!finalName) finalName = intention.customer_name;
              if (!finalPhone) finalPhone = intention.customer_whatsapp;
            }
          }
        }

        if (finalName) setCustomerName(finalName);
        if (finalPhone) setCustomerPhone(finalPhone);
      } catch (err) {
        console.error("Error fetching prioritized customer data:", err);
      }
    };

    fetchRealData();
  }, []);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!user?.id) {
        if (alive) setLoadingData(false);
        navigate("/merchant");
        return;
      }

      try {
        const { exists, data: storeData, error } = await loadMerchantStore();

        if (error) {
          console.error("Erro ao buscar dados da loja:", error);
          if (alive) setLoadingData(false);
          navigate("/merchant/settings");
          return;
        }
        
        console.log("DEBUG_DELIVERY: session.user.id", user?.id);
        console.log("DEBUG_DELIVERY: store.id atual", storeData?.id);
        console.log("DEBUG_DELIVERY: dados brutos da loja", storeData);
        
        const hasLat = !!storeData?.latitude;
        const hasLng = !!storeData?.longitude;
        const isValid = exists && storeData && hasLat && hasLng;

        console.log("DEBUG_DELIVERY: hasLat", hasLat);
        console.log("DEBUG_DELIVERY: hasLng", hasLng);
        console.log("DEBUG_DELIVERY: isValid", isValid);

        if (!isValid) {
          console.warn("Loja não configurada ou sem coordenadas geográficas ativa", { exists, storeData });
          toast.error("Configure o endereço da sua loja primeiro");
          if (alive) setLoadingData(false);
          navigate("/merchant/settings");
          return;
        }

        if (!alive) return;
        const nomeLoja = storeData.nome_loja || "Minha Loja";

        setStore({
          nome_loja: nomeLoja,
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
      } finally {
        if (alive) setLoadingData(false);
      }
    }

    load();
    return () => { alive = false; };
  }, [user?.id, navigate]);

  /* ── Route calculation ── */

  const calculateRoute = useCallback(async () => {
    if (!store || !activeDestCoords) return;

    setIsCalculatingRoute(true);

    try {
      const pickupLat = store.latitude;
      const pickupLng = store.longitude;
      const dropLat = activeDestCoords.lat;
      const dropLng = activeDestCoords.lng;

      if (!pickupLat || !pickupLng || !dropLat || !dropLng) {
        console.warn("Coordenadas inválidas para cálculo de rota");
        setRouteInfo(null);
        return;
      }

      const route = await fetchMapboxRoute(
        { lat: pickupLat, lng: pickupLng },
        { lat: dropLat, lng: dropLng }
      );

      if (!route) {
        console.error("Rota não encontrada ou erro na API Directions");
        toast.error("Não foi possível calcular a rota. Verifique o endereço de destino.");
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
      console.error("[CreateDelivery] route exception:", err);
      toast.error("Não foi possível calcular a rota. Verifique o endereço de destino.");
      setRouteInfo(null);
    } finally {
      setIsCalculatingRoute(false);
    }
  }, [store, activeDestCoords, serviceLevel]);

  useEffect(() => {
    if (!activeDestCoords) {
      setRouteInfo(null);
      return;
    }
    const t = setTimeout(calculateRoute, 400);
    return () => clearTimeout(t);
  }, [activeDestCoords, calculateRoute, serviceLevel]);

  /* ── Fetch financial balance ── */
  useEffect(() => {
    let alive = true;
    async function fetchBalance() {
      setIsLoadingBalance(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: account } = await supabase
          .from('financial_accounts')
          .select('available_balance')
          .eq('owner_user_id', user.id)
          .maybeSingle();

        console.log("[CreateDelivery] Balance fetch result:", { account });

        if (alive) {
          const saldo = account?.available_balance || 0;
          setSaldoAtual(saldo);
        }
      } catch (err) {
        console.error("Erro ao buscar saldo:", err);
        if (alive) setSaldoAtual(0);
      } finally {
        if (alive) setIsLoadingBalance(false);
      }
    }
    fetchBalance();
    return () => { alive = false; };
  }, []);


  const handleCreateDelivery = async () => {
    if (!store || !routeInfo || !activeDestCoords || !user?.id) return;

    setIsCreatingDelivery(true);

    try {
      if (!user.id || !store.latitude || !store.longitude || !activeDestCoords.lat || !activeDestCoords.lng) {
        toast("Localização inválida para entrega");
        setIsCreatingDelivery(false);
        return;
      }

      // 1) Fetch the correct store ID for the logged in user
      const { data: storeData, error: storeError } = await supabase
        .from('merchant_stores')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (storeError || !storeData) {
        throw new Error("Loja não encontrada para este usuário");
      }

      const storeId = storeData.id;

      const params = new URLSearchParams(window.location.search);
      const productId = params.get("product_id");

      const payload = {
        p_store_id: storeId,
        pickup_lat: store.latitude,
        pickup_lng: store.longitude,
        drop_lat: activeDestCoords.lat,
        drop_lng: activeDestCoords.lng,
        p_customer_name: customerName.trim(),
        p_customer_phone: customerPhone.trim() || null,
        p_notes: deliveryNotes.trim() || null,
        p_product_id: productId || null,
        p_estimated_value: routeInfo?.valorTotal || 0,
        p_distance_km: routeInfo?.distanceKm || 0,
        p_pickup_address: store?.endereco_formatado || (store?.rua ? `${store.rua}, ${store.numero || ''}` : "Endereço da Loja"),
        // Prefer reverse geocoded human-readable address over raw coordinates
        p_destination_address: reverseGeocodedAddress || (parsedCoordinates?.success ? null : destinationAddress) || null
      };

      console.log('RPC payload', payload);

      const { data, error } = await supabase.rpc('create_delivery_order', payload as any);

      if (error) {
        console.error('create_delivery_order error', error);
        toast('Erro ao solicitar motoboy', {
          description: error.message,
          className: 'destructive'
        });
        return;
      }

      console.log('order created', data);
      const orderId = data as string;
      toast('Solicitação enviada', {
        description: 'Tudo certo. Já estamos buscando um motoboy para atender sua entrega.'
      });

      // 3) Trigger geocoding and dispatch Edge Function
      const storeDataForGeocoding = {
        delivery_id: orderId,
        pickup_address: store.endereco_formatado || [store.bairro, store.cidade].filter(Boolean).join(', '),
        destination_address: destinationAddress
      };

      console.log("[CreateDelivery] Calling geocoding function:", storeDataForGeocoding);

      // We don't await this to avoid blocking the UI, as the waiting screen will poll/realtime the result
      supabase.functions.invoke('process-delivery-geocoding', {
        body: storeDataForGeocoding
      }).then(({ data: funcData, error: funcError }) => {
        if (funcError) console.error("[CreateDelivery] Geocoding function error:", funcError);
        else console.log("[CreateDelivery] Geocoding function success:", funcData);
      });

      // Redirect to delivery view page for real-time tracking
      navigate(`/merchant/entrega/${orderId}`);
    } catch (e: any) {
      console.error("[CreateDelivery] insert catch:", e);
      toast.error('Erro ao solicitar motoboy', { description: e.message || 'Erro ao criar pedido' });
    } finally {
      setIsCreatingDelivery(false);
    }
  };


  /* ── Map drag handler ── */

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    setIsReverseGeocoding(true);
    try {
      const { data, error } = await supabase.functions.invoke("reverse-geocode", {
        body: { lat, lng },
      });
      if (!error && data?.address) {
        setReverseGeocodedAddress(data.address);
        setDestinationAddress(data.address);
      }

      const details = await reverseGeocodeDetails(lat, lng);
      setDestDetails(details);
    } catch (e) {
      console.error("[CreateDelivery] reverse geocode error:", e);
    } finally {
      setIsReverseGeocoding(false);
      setIsMapSelectMode(false);
    }
  }, []);

  const handleMarkerDrag = useCallback((_id: string, lat: number, lng: number) => {
    setManualDestCoords({ lat, lng });
    setDestinationAddress(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    setReverseGeocodedAddress(null);
    reverseGeocode(lat, lng);
  }, [reverseGeocode]);

  const handleToggleMapSelect = useCallback(() => {
    setIsMapSelectMode((prev) => {
      const next = !prev;
      if (!next) {
        setTempDestCoords(null);
      }
      return next;
    });
  }, []);

  const handleMapMouseMove = useCallback((lat: number, lng: number) => {
    if (isMapSelectMode) {
      setTempDestCoords({ lat, lng });
    }
  }, [isMapSelectMode]);

  /* ── Button state ── */

  const isButtonDisabled =
    !routeInfo ||
    !destinationAddress.trim() ||
    !customerName.trim() ||
    isCalculatingRoute ||
    isCreatingDelivery ||
    loadingData ||
    saldoApos === null ||
    saldoApos < 0;

  /* ── Render ── */

  if (loadingData) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <HeaderBar onBack={() => navigate("/merchant")} lat={store?.latitude} lng={store?.longitude} />

      {/* ── MOBILE: stacked layout ── */}
      <div className="xl:hidden w-full p-4 space-y-4">
        {store && (
          <RouteDetailsCard routeInfo={routeInfo} isCalculating={isCalculatingRoute} hasValidCoordinates={hasValidCoordinates} />
        )}

        <DestinationSection
          destinationAddress={destinationAddress}
          onAddressChange={(v) => { setManualDestCoords(null); setReverseGeocodedAddress(null); setDestinationAddress(v); }}
          hasValidCoordinates={hasValidCoordinates}
          isMapSelectMode={isMapSelectMode}
          onToggleMapSelect={handleToggleMapSelect}
          reverseGeocodedAddress={reverseGeocodedAddress}
          isReverseGeocoding={isReverseGeocoding}
        />

        {hasValidCoordinates && (
          <CustomerLocationCard destCoords={activeDestCoords} distanceKm={routeInfo?.distanceKm} />
        )}

        <CustomerFields
          customerName={customerName} customerPhone={customerPhone} deliveryNotes={deliveryNotes}
          onNameChange={setCustomerName} onPhoneChange={setCustomerPhone} onNotesChange={setDeliveryNotes}
        />

        <ServiceSelectionCard serviceLevel={serviceLevel} onSelectService={setServiceLevel} />

        {store?.latitude && store?.longitude ? (
          <DeliveryMapSection 
            store={store} 
            destCoords={activeDestCoords} 
            routeInfo={routeInfo} 
            onMarkerDragEnd={handleMarkerDrag} 
            isMapSelectMode={isMapSelectMode} 
            tempDestCoords={tempDestCoords} 
            onMapMouseMove={handleMapMouseMove} 
            destDetails={destDetails} 
            customerName={customerName}
            customerPhone={customerPhone}
          />
        ) : null}

        {saldoApos !== null && saldoApos < 0 && (
          <div className="flex items-center gap-2 bg-destructive/10 text-destructive rounded-lg p-3 text-sm mt-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Saldo insuficiente para realizar a entrega.</span>
          </div>
        )}

        {store && (
          <div className="mt-[12px] mb-[14px] rounded-xl shadow-[0_2px_6px_rgba(0,0,0,0.08)] bg-card border">
            <FinancialSummaryCard
              saldoDisplay={saldoDisplay}
              valorFinal={valorFinal}
              saldoApos={saldoApos}
              isLoadingBalance={isLoadingBalance}
              distanceKm={routeInfo?.distanceKm}
            />
          </div>
        )}

        <div className="sticky bottom-0 bg-background border-t border-border -mx-4 px-4 py-4 z-40">
          <Button className="w-full h-14 text-lg font-semibold" onClick={handleCreateDelivery} disabled={isButtonDisabled}>
            {isCreatingDelivery ? (
              <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Processando…</>
            ) : (
              <><Truck className="h-5 w-5 mr-2" /> Solicitar motoboy agora</>
            )}
          </Button>
        </div>
      </div>

      {/* ── DESKTOP: dispatch-style 2-column layout ── */}
      <div className="hidden xl:flex w-full h-[calc(100vh-64px)]">

        {/* LEFT — Map (dominant, ~68%) */}
        <div className="relative flex-1 min-w-0">
          {/* Overlay removido a pedido do usuário (somente marcadores) */}


          {store?.latitude && store?.longitude ? (
            <DeliveryMapSection 
              store={store} 
              destCoords={activeDestCoords} 
              routeInfo={routeInfo} 
              onMarkerDragEnd={handleMarkerDrag} 
              isDesktopFullHeight 
              isMapSelectMode={isMapSelectMode} 
              tempDestCoords={tempDestCoords} 
              onMapMouseMove={handleMapMouseMove} 
              destDetails={destDetails} 
              customerName={customerName}
              customerPhone={customerPhone}
            />
          ) : null}
        </div>

        {/* RIGHT — Sidebar (~32%, scrollable) */}
        <div className="w-[380px] 2xl:w-[420px] border-l border-border bg-muted/30 flex flex-col overflow-y-auto">
          <div className="p-5 2xl:p-6 space-y-5 flex-1">

            <DestinationSection
              destinationAddress={destinationAddress}
              onAddressChange={(v) => { setManualDestCoords(null); setReverseGeocodedAddress(null); setDestinationAddress(v); }}
              hasValidCoordinates={hasValidCoordinates}
              isMapSelectMode={isMapSelectMode}
              onToggleMapSelect={handleToggleMapSelect}
              reverseGeocodedAddress={reverseGeocodedAddress}
              isReverseGeocoding={isReverseGeocoding}
            />

            {hasValidCoordinates && (
              <CustomerLocationCard destCoords={activeDestCoords} distanceKm={routeInfo?.distanceKm} />
            )}

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

            {hasValidCoordinates && (
              <div className="mt-[12px] mb-[14px] rounded-xl shadow-[0_2px_6px_rgba(0,0,0,0.08)] bg-card border">
                <FinancialSummaryCard
                  saldoDisplay={saldoDisplay}
                  valorFinal={valorFinal}
                  saldoApos={saldoApos}
                  isLoadingBalance={isLoadingBalance}
                  distanceKm={routeInfo?.distanceKm}
                />
              </div>
            )}
          </div>

          {/* Fixed CTA at bottom of sidebar */}
          <div className="sticky bottom-0 bg-background border-t border-border p-5 2xl:p-6 z-40">
            <Button className="w-full h-14 text-lg font-semibold" onClick={handleCreateDelivery} disabled={isButtonDisabled}>
              {isCreatingDelivery ? (
                <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Processando…</>
              ) : (
                <><Truck className="h-5 w-5 mr-2" /> Solicitar motoboy agora</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
