import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useMerchantDispatch } from "@/hooks/useMerchantDispatch";
import { useCompressedImageUpload } from "@/hooks/useCompressedImageUpload";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AlertCircle, Camera, CheckCircle2, DollarSign, Loader2, Package, Plus, Scale, Search, Truck, X, MapPin } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { formatCurrencyBRL } from "@/lib/utils";

import { HeaderBar } from "@/components/delivery/create/HeaderBar";
import { DestinationSection } from "@/components/delivery/create/DestinationSection";
import { CustomerLocationCard } from "@/components/delivery/create/CustomerLocationCard";
import { CustomerFields } from "@/components/delivery/create/CustomerFields";
import { RouteDetailsCard } from "@/components/delivery/create/RouteDetailsCard";
import { ServiceSelectionCard } from "@/components/delivery/create/ServiceSelectionCard";
import { FinancialSummaryCard } from "@/components/delivery/create/FinancialSummaryCard";
import { DeliveryMapSection } from "@/components/delivery/create/DeliveryMapSection";
import MerchantSettingsContent from "@/pages/MerchantSettingsContent";

import { calculateDeliveryValue } from "@/lib/deliveryPricing";
import { calculateRoute as fetchMapboxRoute } from "@/skills/maps/routeService";
import { reverseGeocodeDetails } from "@/skills/maps/geocodeService";
import { parseCoordinates } from "@/lib/coordinateParser";

export default function AdvertiserNewDelivery() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Route & Destination State (matches CreateDelivery)
  const [destinationAddress, setDestinationAddress] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [manualDestCoords, setManualDestCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [isMapSelectMode, setIsMapSelectMode] = useState(false);
  const [tempDestCoords, setTempDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [reverseGeocodedAddress, setReverseGeocodedAddress] = useState<string | null>(null);
  const [destDetails, setDestDetails] = useState<any>(null);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);

  const [routeInfo, setRouteInfo] = useState<any>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [serviceLevel, setServiceLevel] = useState<'standard' | 'express'>('standard');
  
  // Financial State
  const [saldoAtual, setSaldoAtual] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);

  // Advert Product State
  const [searchOpenMobile, setSearchOpenMobile] = useState(false);
  const [searchOpenDesktop, setSearchOpenDesktop] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isManualItem, setIsManualItem] = useState(false);
  const [productData, setProductData] = useState({
    title: "", description: "", internal_notes: "",
    value: 0, weight: "", category: "", quantity: 1, image_url: ""
  });

  const { selectFile, upload, status: uploadStatus, clear: clearUpload, previewUrl: uploadPreviewUrl } = useCompressedImageUpload();
  const isUploading = uploadStatus === "uploading";

  // Order Lifecycle State
  const [loading, setLoading] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [pickupCode, setPickupCode] = useState<string | null>(null);

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
  const valorFinal = routeInfo?.valorTotal ?? null;
  const saldoDisplay = saldoAtual;
  const saldoApos = saldoDisplay !== null && valorFinal !== null ? Number(saldoDisplay) - Number(valorFinal) : null;

  // Modifiers

  const { data: advertiserAccount } = useQuery({
    queryKey: ["advertiser-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("advertiser_accounts").select("id").eq("user_id", user?.id).maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const advertiserAccountId = advertiserAccount?.id;

  const { data: catalog = [] } = useQuery({
    queryKey: ["advertiser-catalog", user?.id, advertiserAccountId],
    queryFn: async () => {
      if (!user) return [];
      
      const results: any[] = [];
      const getImg = (path: string | null, bucket: string) => {
        if (!path) return null;
        if (path.startsWith("http")) return path;
        return supabase.storage.from(bucket).getPublicUrl(path.replace(/^\/+/, '')).data.publicUrl;
      };
      
      // 1. Fetch standard merchant products
      const { data: products } = await supabase
        .from("merchant_products")
        .select("id, nome, descricao, preco, imagem_url")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
        
      if (products) {
        products.forEach((p: any) => {
          results.push({
            id: p.id, title: p.nome, description: p.descricao,
            price: p.preco || 0, image_url: p.imagem_url, type: 'product'
          });
        });
      }

      // 2. Fetch classified listings
      if (advertiserAccountId) {
        const { data: listings } = await supabase
          .from("advertiser_listings" as any)
          .select("id, title, price, cover_image_url, advertiser_listing_media(media_url)")
          .eq("advertiser_account_id", advertiserAccountId)
          .order("created_at", { ascending: false });
        
        if (listings) {
          listings.forEach((r: any) => {
            const mediaFallback = r.advertiser_listing_media?.[0]?.media_url ?? null;
            let imgUrl = r.cover_image_url || mediaFallback;
            // marketing-materials is the bucket used in AdvertiserPromotionPage for these
            if (imgUrl && !imgUrl.startsWith("http")) {
              imgUrl = getImg(imgUrl, "marketing-materials");
            }
            results.push({
              id: r.id, title: r.title ?? "Sem título", description: "",
              price: r.price || 0, image_url: imgUrl, type: 'listing'
            });
          });
        }
      }

      return results;
    },
    enabled: !!user
  });

  const { data: store } = useQuery({
    queryKey: ["merchant-store", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("merchant_stores").select("*").eq("user_id", user?.id).maybeSingle();
      return data || null;
    },
    enabled: !!user
  });

  /* ── Fetch URL Params (CRM Integration) ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get("customer_name");
    const phone = params.get("customer_phone");
    const intentionId = params.get("intention_id");
    const productId = params.get("product_id");

    if (name) setCustomerName(decodeURIComponent(name));
    if (phone) setCustomerPhone(decodeURIComponent(phone));
    if (productId) setSelectedProductId(productId);

    // Priority Data Fetching logic for CRM
    const fetchRealData = async () => {
      try {
        let finalName = name ? decodeURIComponent(name) : "";
        let finalPhone = phone ? decodeURIComponent(phone) : "";

        if (intentionId) {
          const { data: intention } = await supabase
            .from("purchase_intentions")
            .select("customer_name, customer_whatsapp, visitor_id")
            .eq("id", intentionId)
            .maybeSingle();

          if (intention) {
            if (!finalName) finalName = intention.customer_name;
            if (!finalPhone) finalPhone = intention.customer_whatsapp;

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
        } else if (productId) {
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
    async function fetchBalance() {
      setIsLoadingBalance(true);
      try {
        if (!user) return;
        const { data: account } = await supabase.from('financial_accounts').select('available_balance').eq('owner_user_id', user.id).maybeSingle();
        if (alive) setSaldoAtual(account?.available_balance || 0);
      } catch (err) {
        if (alive) setSaldoAtual(0);
      } finally {
        if (alive) setIsLoadingBalance(false);
      }
    }
    fetchBalance();
    return () => { alive = false; };
  }, [user]);

  // If store is loaded but lacks coordinates, redirect to Minha Conta
  useEffect(() => {
    if (store !== undefined) {
      if (!store || !store.latitude || !store.longitude) {
        toast.error("Ative seu Perfil Operacional primeiro. Preencha seus dados de coleta.");
        navigate("/anunciante/conta");
      }
    }
  }, [store, navigate]);

  const calculateRoute = useCallback(async () => {
    if (!store || !activeDestCoords) return;
    setIsCalculatingRoute(true);
    try {
      const route = await fetchMapboxRoute(
        { lat: Number(store.latitude), lng: Number(store.longitude) },
        { lat: activeDestCoords.lat, lng: activeDestCoords.lng }
      );
      if (!route) {
        setRouteInfo(null);
        return;
      }
      const km = Number((route.distance / 1000).toFixed(1));
      const min = Math.round(route.duration / 60);
      const valor = calculateDeliveryValue(km, serviceLevel);
      
      // Montar a polyline correta (invertendo lng/lat para [lat, lng] pro componente)
      const coords = Array.isArray(route.geometry?.coordinates) ? route.geometry.coordinates : [];
      const polyline: [number, number][] = coords
        .filter((c: any) => Array.isArray(c) && c.length >= 2)
        .map((c: number[]) => [c[1], c[0]]);
        
      setRouteInfo({ distanceKm: km, durationMin: min, valorTotal: Number(valor), polyline });
    } catch (err) {
      console.error("[AdvertiserNewDelivery] route exception:", err);
      toast.error("Não foi possível calcular a rota. Verifique o endereço de destino.");
      setRouteInfo(null);
    } finally {
      setIsCalculatingRoute(false);
    }
  }, [store, activeDestCoords, serviceLevel]);

  useEffect(() => {
    if (!activeDestCoords) {
      setRouteInfo(null);
      setDestDetails(null);
      return;
    }
    const t = setTimeout(() => {
      calculateRoute();
      reverseGeocodeDetails(activeDestCoords.lat, activeDestCoords.lng).then(details => {
        setDestDetails(details);
      }).catch(err => console.error("Error fetching details", err));
    }, 400);
    return () => clearTimeout(t);
  }, [activeDestCoords, calculateRoute, serviceLevel]);

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
      if (prev) setTempDestCoords(null);
      return !prev;
    });
  }, []);

  const handleMapMouseMove = useCallback((lat: number, lng: number) => {
    if (isMapSelectMode) setTempDestCoords({ lat, lng });
  }, [isMapSelectMode]);

  const handleProductSelect = (product: any) => {
    setSelectedProductId(product.id);
    setIsManualItem(true); // Abre o formulário automaticamente com os dados preenchidos
    setProductData({
      title: product.title, description: product.description || "",
      internal_notes: "", value: parseFloat(product.price) || 0,
      weight: "", category: product.type === "listing" ? "Classificado" : "Produto da Loja",
      quantity: 1, image_url: product.image_url || ""
    });
    setSearchOpenMobile(false);
    setSearchOpenDesktop(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && user) {
      if (!store?.id) { toast.error("Loja não encontrada"); return; }
      try {
        await selectFile(file);
        const metadata = await upload(store.id);
        if (metadata?.publicUrl) {
          setProductData(prev => ({...prev, image_url: metadata.publicUrl}));
          toast.success("Imagem anexada");
        }
      } catch (err) {
        toast.error("Erro no upload");
      }
    }
  };

  const { activeOrderId, activeOrder } = useMerchantDispatch();
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (activeOrderId && activeOrderId !== lastOrderId) {
      setLastOrderId(activeOrderId);
      setSuccessModalOpen(true);
      setPickupCode(activeOrder?.pickup_code || null);
    }
  }, [activeOrderId, activeOrder, lastOrderId]);

  const handleRequestMotoboy = async () => {
    if (!store?.id || !activeDestCoords || !user?.id) return;
    setLoading(true);
    try {
      if (saldoApos !== null && saldoApos < 0) {
        toast.error("Saldo insuficiente para esta corrida");
        return;
      }
      if (!selectedProductId && !productData.title && !isManualItem) {
        toast.error("Selecione um produto ou informe os dados manuais");
        return;
      }

      const payload = {
        p_store_id: store.id,
        pickup_lat: Number(store.latitude),
        pickup_lng: Number(store.longitude),
        drop_lat: activeDestCoords.lat,
        drop_lng: activeDestCoords.lng,
        p_customer_name: customerName.trim(),
        p_customer_phone: customerPhone.trim() || null,
        p_notes: (deliveryNotes + " | " + productData.internal_notes).trim() || null,
        p_product_id: selectedProductId,
        p_estimated_value: routeInfo?.valorTotal || 0,
        p_distance_km: routeInfo?.distanceKm || 0,
        p_pickup_address: store?.endereco_formatado || store?.street || "Loja",
        p_destination_address: reverseGeocodedAddress || destinationAddress
      };

      const { data, error } = await supabase.rpc('create_delivery_order', payload);
      if (error) throw error;

      const orderId = data as string;
      toast("Solicitação enviada!", {
        description: "Já estamos buscando um motoboy para atender sua entrega."
      });
      navigate(`/anunciante/entregas/${orderId}`);
      
    } catch (e: any) {
      toast.error('Erro ao solicitar motoboy', { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const isButtonDisabled = !routeInfo || !destinationAddress.trim() || !customerName.trim() || loading || (!selectedProductId && !isManualItem) || (saldoApos !== null && saldoApos < 0);

  // RENDER ALIGNED WITH CREATEDELIVERY
  return (
    <div className="-m-4 lg:-m-8 pb-10 flex flex-col bg-background text-foreground h-[calc(100vh)]">
      <HeaderBar onBack={() => navigate(-1)} lat={Number(store?.latitude)} lng={Number(store?.longitude)} />

      {/* MOBILE STACKED */}
      <div className="xl:hidden w-full p-4 space-y-4 pt-[72px]">
        {(!store?.latitude || !store?.longitude) ? (
           <div className="w-full flex-1 flex flex-col items-center justify-center p-8 mt-20">
             <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
             <p className="text-muted-foreground text-center">Redirecionando para as configurações da loja...</p>
           </div>
        ) : (
          <>
            {store && (
              <RouteDetailsCard routeInfo={routeInfo} isCalculating={isCalculatingRoute} hasValidCoordinates={hasValidCoordinates} />
            )}

            {/* Product Selection Block */}
            <Card>
          <CardContent className="p-4 space-y-4 pt-4">
            <Label className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Package className="h-4 w-4 text-primary" /> O que vamos entregar?
            </Label>
            
            <Popover open={searchOpenMobile} onOpenChange={setSearchOpenMobile}>
               <PopoverTrigger asChild>
                 <Button variant="outline" role="combobox" className="w-full justify-between h-12 border-primary/20 bg-muted/30 hover:border-primary/50 transition-colors">
                   {selectedProductId ? catalog.find((p:any) => p.id === selectedProductId)?.title : "Buscar no catálogo..."}
                   <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                 </Button>
               </PopoverTrigger>
               <PopoverContent className="w-[300px] p-0 shadow-xl border-primary/20">
                 <Command>
                   <CommandInput placeholder="Buscar produto..." />
                   <CommandList>
                     <CommandEmpty>Nenhum produto cadastrado nesta loja</CommandEmpty>
                     <CommandGroup>
                       {catalog.map((product:any) => (
                         <CommandItem 
                            key={product.id} 
                            value={`${product.title} ${product.description || ""} ${product.id}`}
                            onSelect={() => handleProductSelect(product)} 
                            className="hover:bg-primary/10 flex items-center gap-3 py-3"
                         >
                           <CheckCircle2 className={cn("h-4 w-4 text-primary shrink-0", selectedProductId === product.id ? "opacity-100" : "opacity-0")} />
                           
                           {/* Miniatura */}
                           {product.image_url ? (
                             <div className="w-10 h-10 rounded-md border overflow-hidden shrink-0 bg-muted/50">
                               <img src={product.image_url} alt={product.title} className="w-full h-full object-cover" />
                             </div>
                           ) : (
                             <div className="w-10 h-10 rounded-md border flex items-center justify-center shrink-0 bg-muted/50 text-muted-foreground">
                               <Package className="w-5 h-5" />
                             </div>
                           )}

                           <div className="flex flex-col flex-1 min-w-0">
                             <span className="font-bold truncate">{product.title}</span>
                             <span className="text-xs text-muted-foreground truncate">R$ {product.price?.toFixed(2)}</span>
                           </div>
                         </CommandItem>
                       ))}
                     </CommandGroup>
                   </CommandList>
                 </Command>
               </PopoverContent>
            </Popover>

            <div className="flex items-center gap-2">
              <Separator className="flex-1"/>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">OU</span>
              <Separator className="flex-1"/>
            </div>

            <Button 
               variant={isManualItem ? "default" : "outline"}
               className="w-full h-11 border-dashed"
               onClick={() => { setIsManualItem(true); setSelectedProductId(null); }}
            >
               <Plus className="w-4 h-4 mr-2" /> Item Manual
            </Button>

            {isManualItem && (
               <div className="space-y-4 pt-2">
                 <div className="space-y-2">
                   <Label className="text-xs">Título do Item</Label>
                   <Input className="bg-white/5" value={productData.title} onChange={e => setProductData({...productData, title:e.target.value})} placeholder="Ex: Pacote Documentos" />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                     <Label className="text-xs">Valor Estimado</Label>
                     <div className="relative">
                       <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                       <Input type="number" className="pl-9" value={productData.value} onChange={e=>setProductData({...productData, value: parseFloat(e.target.value)})} />
                     </div>
                   </div>
                   <div className="space-y-2">
                     <Label className="text-xs">Peso Aprox.</Label>
                     <div className="relative">
                       <Scale className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                       <Input className="pl-9 bg-white/5" placeholder="Ex: 500g" value={productData.weight} onChange={e=>setProductData({...productData, weight: e.target.value})} />
                     </div>
                   </div>
                 </div>
               </div>
            )}
          </CardContent>
        </Card>

        <DestinationSection
          destinationAddress={destinationAddress}
          onAddressChange={(v) => { setManualDestCoords(null); setReverseGeocodedAddress(null); setDestinationAddress(v); }}
          hasValidCoordinates={hasValidCoordinates}
          isMapSelectMode={isMapSelectMode}
          onToggleMapSelect={handleToggleMapSelect}
          reverseGeocodedAddress={reverseGeocodedAddress}
          isReverseGeocoding={isReverseGeocoding}
        />

        {hasValidCoordinates && <CustomerLocationCard destCoords={activeDestCoords} distanceKm={routeInfo?.distanceKm} />}

        <CustomerFields
          customerName={customerName} customerPhone={customerPhone} deliveryNotes={deliveryNotes}
          onNameChange={setCustomerName} onPhoneChange={setCustomerPhone} onNotesChange={setDeliveryNotes}
        />

        <ServiceSelectionCard serviceLevel={serviceLevel} onSelectService={setServiceLevel} />

        {store?.latitude && store?.longitude ? (
          <DeliveryMapSection 
            store={{...store, nome_loja: store.nome_loja || "Minha Loja", latitude: Number(store.latitude), longitude: Number(store.longitude)}} 
            destCoords={activeDestCoords} 
            routeInfo={routeInfo} 
            onMarkerDragEnd={handleMarkerDrag} 
            isMapSelectMode={isMapSelectMode} 
            tempDestCoords={tempDestCoords} 
            onMapMouseMove={handleMapMouseMove} 
            destDetails={destDetails} 
            customerName={customerName}
          />
        ) : null}

        {hasValidCoordinates && (
          <FinancialSummaryCard saldoDisplay={saldoDisplay} valorFinal={valorFinal} saldoApos={saldoApos} isLoadingBalance={isLoadingBalance} distanceKm={routeInfo?.distanceKm} />
        )}

        <div className="sticky bottom-0 bg-background border-t p-4 z-40 -mx-4 mt-8 flex justify-center">
           <Button className="w-full max-w-[350px] h-14 text-lg font-semibold" onClick={handleRequestMotoboy} disabled={isButtonDisabled}>
             {loading ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Processando...</> : <><Truck className="h-5 w-5 mr-2" /> Chamar Motoboy</>}
           </Button>
        </div>
        </>
        )}
      </div>

      {/* DESKTOP SPLIT */}
      <div className="hidden xl:flex w-full flex-1 pt-[64px] pb-4">
        {(!store?.latitude || !store?.longitude) ? (
           <div className="flex-1 flex flex-col items-center justify-center p-8">
             <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
             <p className="text-muted-foreground">Redirecionando para as configurações da loja...</p>
           </div>
        ) : (
          <>
            {/* Left dominant map section */}
            <div className="relative flex-1 min-w-0 pr-4 rounded-xl overflow-hidden shadow-2xl shadow-black/50 border border-white/5 mx-4 my-2">
          {store?.latitude && store?.longitude ? (
            <DeliveryMapSection 
              store={{...store, nome_loja: store.nome_loja || "Minha Loja", latitude: Number(store.latitude), longitude: Number(store.longitude)}} 
              destCoords={activeDestCoords} 
              routeInfo={routeInfo} 
              onMarkerDragEnd={handleMarkerDrag} 
              isDesktopFullHeight
              isMapSelectMode={isMapSelectMode} 
              tempDestCoords={tempDestCoords} 
              onMapMouseMove={handleMapMouseMove} 
              destDetails={destDetails} 
              customerName={customerName}
            />
          ) : (
            <div className="w-full h-full rounded-2xl bg-muted/20 border-2 border-dashed border-border flex items-center justify-center text-muted-foreground p-8 text-center">
              Sem dados da loja válidos para traçar a rota. Configure o endereço na página de Perfil.
            </div>
          )}
        </div>

        {/* RIGHT — Sidebar (~32%, scrollable) */}
        <div className="w-[380px] 2xl:w-[420px] bg-zinc-950/80 backdrop-blur-2xl border-l border-white/5 flex flex-col overflow-y-auto shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-10">
          <div className="p-5 2xl:p-6 space-y-6 flex-1">
            
            {store && (
              <RouteDetailsCard routeInfo={routeInfo} isCalculating={isCalculatingRoute} hasValidCoordinates={hasValidCoordinates} />
            )}

            {/* Product Selection Block */}
            <Card className="border-none shadow-none bg-muted/20">
              <CardContent className="p-4 space-y-4 pt-4">
                <Label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Package className="w-4 h-4 text-primary" /> O que vamos entregar?
                </Label>
                
                <Popover open={searchOpenDesktop} onOpenChange={setSearchOpenDesktop}>
                   <PopoverTrigger asChild>
                     <Button variant="outline" role="combobox" className="w-full justify-between h-11 bg-muted/30 border-primary/20 hover:border-primary/50 transition-colors">
                       {selectedProductId ? catalog.find((p:any) => p.id === selectedProductId)?.title : "Buscar no catálogo..."}
                       <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                     </Button>
                   </PopoverTrigger>
                   <PopoverContent className="w-[300px] p-0 border-primary/20 shadow-xl">
                     <Command>
                       <CommandInput placeholder="Buscar produto..." />
                       <CommandList>
                         <CommandEmpty>Nenhum produto cadastrado nesta loja</CommandEmpty>
                         <CommandGroup>
                           {catalog.map((product:any) => (
                             <CommandItem 
                                key={product.id} 
                                value={`${product.title} ${product.description || ""} ${product.id}`}
                                onSelect={() => handleProductSelect(product)} 
                                className="hover:bg-primary/10 flex items-center gap-3 py-3 cursor-pointer"
                             >
                               <CheckCircle2 className={cn("h-4 w-4 text-primary shrink-0", selectedProductId === product.id ? "opacity-100" : "opacity-0")} />
                               
                               {/* Miniatura */}
                               {product.image_url ? (
                                 <div className="w-10 h-10 rounded-md border overflow-hidden shrink-0 bg-muted/50">
                                   <img src={product.image_url} alt={product.title} className="w-full h-full object-cover" />
                                 </div>
                               ) : (
                                 <div className="w-10 h-10 rounded-md border flex items-center justify-center shrink-0 bg-muted/50 text-muted-foreground">
                                   <Package className="w-5 h-5" />
                                 </div>
                               )}

                               <div className="flex flex-col flex-1 min-w-0">
                                 <span className="font-bold truncate">{product.title}</span>
                                 <span className="text-[10px] text-muted-foreground truncate">R$ {product.price?.toFixed(2)}</span>
                               </div>
                             </CommandItem>
                           ))}
                         </CommandGroup>
                       </CommandList>
                     </Command>
                   </PopoverContent>
                </Popover>

                <div className="flex items-center gap-2">
                  <Separator className="flex-1"/>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">OU</span>
                  <Separator className="flex-1"/>
                </div>

                <Button variant={isManualItem ? "secondary" : "outline"} className="w-full h-11 border-dashed" onClick={() => { setIsManualItem(true); setSelectedProductId(null); }}>
                   <Plus className="w-4 h-4 mr-2" /> Item Avulso Manual
                </Button>

                {isManualItem && (
                   <div className="space-y-4 pt-2 animate-in slide-in-from-top-1 fade-in duration-200">
                     <div className="space-y-2">
                       <Label className="text-xs text-muted-foreground">Nome do Item</Label>
                       <Input value={productData.title} onChange={e => setProductData({...productData, title:e.target.value})} placeholder="Pacote Documentos" />
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-2">
                         <Label className="text-xs text-muted-foreground">Valor R$</Label>
                         <div className="relative">
                           <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                           <Input type="number" className="pl-9" value={productData.value} onChange={e=>setProductData({...productData, value: parseFloat(e.target.value)})} />
                         </div>
                       </div>
                       <div className="space-y-2">
                         <Label className="text-xs text-muted-foreground">Peso/Volume</Label>
                         <div className="relative">
                           <Scale className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                           <Input className="pl-9" placeholder="500g" value={productData.weight} onChange={e=>setProductData({...productData, weight: e.target.value})} />
                         </div>
                       </div>
                     </div>
                     
                     <div className="space-y-2">
                         <Label className="text-xs text-muted-foreground">Foto para conferência (Opcional)</Label>
                         <div className="flex items-center gap-4">
                            {uploadPreviewUrl || productData.image_url ? (
                              <div className="relative w-16 h-16 rounded-lg border overflow-hidden">
                                <img src={uploadPreviewUrl || productData.image_url} alt="Item" className="w-full h-full object-cover" />
                                <button onClick={() => { clearUpload(); setProductData({...productData, image_url: ""}); }} className="absolute top-1 right-1 bg-black/60 rounded-full p-1 text-white">
                                  <X className="w-3 h-3"/>
                                </button>
                              </div>
                            ) : null}
                            <label className="flex items-center justify-center p-4 border-2 border-dashed rounded-xl flex-1 cursor-pointer hover:bg-muted/50 transition-colors group">
                               <Input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={isUploading}/>
                               {isUploading ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <Camera className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />}
                               <span className="ml-2 text-xs text-muted-foreground group-hover:text-foreground">Anexar Imagem</span>
                            </label>
                         </div>
                     </div>
                   </div>
                )}
              </CardContent>
            </Card>

            <DestinationSection
              destinationAddress={destinationAddress}
              onAddressChange={(v) => { setManualDestCoords(null); setReverseGeocodedAddress(null); setDestinationAddress(v); }}
              hasValidCoordinates={hasValidCoordinates}
              isMapSelectMode={isMapSelectMode}
              onToggleMapSelect={handleToggleMapSelect}
              reverseGeocodedAddress={reverseGeocodedAddress}
              isReverseGeocoding={isReverseGeocoding}
            />

            {hasValidCoordinates && <CustomerLocationCard destCoords={activeDestCoords} distanceKm={routeInfo?.distanceKm} />}

            <CustomerFields
              customerName={customerName} customerPhone={customerPhone} deliveryNotes={deliveryNotes}
              onNameChange={setCustomerName} onPhoneChange={setCustomerPhone} onNotesChange={setDeliveryNotes}
            />

            <ServiceSelectionCard serviceLevel={serviceLevel} onSelectService={setServiceLevel} />

            {saldoApos !== null && saldoApos < 0 && (
              <div className="flex items-center gap-2 bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Saldo insuficiente para solicitar motoboy.</span>
              </div>
            )}

            {hasValidCoordinates && (
              <div className="shadow-lg rounded-xl overflow-hidden border">
                <FinancialSummaryCard saldoDisplay={saldoDisplay} valorFinal={valorFinal} saldoApos={saldoApos} isLoadingBalance={isLoadingBalance} distanceKm={routeInfo?.distanceKm} />
              </div>
            )}
            
            <Card className="border-none shadow-none bg-muted/20">
               <CardContent className="p-4 space-y-2 pt-4">
                  <div className="flex items-center gap-2 text-amber-500">
                     <AlertCircle className="w-4 h-4" />
                     <p className="text-[11px] font-bold uppercase">Segurança</p>
                  </div>
                  <p className="text-xs text-muted-foreground">O entregador pedirá um <strong>Código de Retirada</strong> que será gerado ao confirmar o pedido.</p>
               </CardContent>
            </Card>
          </div>

            <div className="pt-4 pb-2 mt-auto">
               <Button className="w-full h-14 text-[15px] font-bold shadow-md" onClick={handleRequestMotoboy} disabled={isButtonDisabled}>
                 {loading ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Gerando Solicitação...</> : <><Truck className="h-5 w-5 mr-2" /> Solicitar motoboy agora</>}
               </Button>
            </div>
        </div>
        </>
        )}
      </div>
      
      {/* SUCCESS MODAL */}
      <Dialog open={successModalOpen} onOpenChange={setSuccessModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader className="space-y-4">
             <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
             </div>
             <div className="space-y-2 text-center">
              <DialogTitle className="text-2xl font-black uppercase italic tracking-tight">Solicitação Enviada!</DialogTitle>
              <DialogDescription className="text-sm">Seu motoboy já está sendo procurado.</DialogDescription>
             </div>
          </DialogHeader>

          <div className="bg-muted/50 p-6 rounded-2xl border border-border space-y-4 text-center mt-2">
             <p className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Código de Retirada</p>
             <div className="text-4xl font-black text-primary tracking-[0.1em]">{pickupCode || "--- ---"}</div>
             <p className="text-[10px] text-muted-foreground font-medium">Forneça este código ao motoboy para confirmar a coleta.</p>
          </div>

          <DialogFooter className="sm:justify-center pt-4">
            <Button onClick={() => navigate('/anunciante/painel')} className="w-full font-bold uppercase h-12">Acompanhar Entrega</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
