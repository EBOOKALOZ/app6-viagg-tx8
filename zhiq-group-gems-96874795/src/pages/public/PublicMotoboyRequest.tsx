import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapPin, Phone, User, Package, ArrowRight, Bike, XCircle,
  CheckCircle, CreditCard, QrCode, Loader2, Copy, ChevronRight,
  Navigation, AlertCircle, Map, Search, Lock, Pencil, ChevronLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import motoboyHero from "@/assets/motoboy-hero.png";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { geocodeAddress } from "@/lib/map/GeoLocationService";
import { ViaggAIChat } from "@/components/public/ViaggAIChat";
import { viaggAI } from "@/lib/viaggAI";
import { RideMapPremium } from "@/components/map/RideMapPremium";
import { parseCoordinates } from "@/lib/coordinateParser";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────
type Step = "form" | "price" | "waiting" | "payment" | "confirmed";

interface RidePrice {
  distance_km: number;
  duration_min: number;
  price: number;
  commission: number;
  motoboy_earnings: number;
}

interface PendingRide {
  id: string;
  tracking_code: string;
  status: string;
  estimated_price: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function formatPhone(raw: string) {
  return raw.replace(/\D/g, "").slice(0, 11);
}

function phoneMask(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function PublicMotoboyRequest() {
  const navigate = useNavigate();

  // Form fields
  const [visitorName, setVisitorName] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [originAddress, setOriginAddress] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [packageDescription, setPackageDescription] = useState("");
  const [originLat, setOriginLat] = useState<number | null>(null);
  const [originLng, setOriginLng] = useState<number | null>(null);
  const [destLat, setDestLat] = useState<number | null>(null);
  const [destLng, setDestLng] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showOriginMap, setShowOriginMap] = useState(false);

  // State
  const [step, setStep] = useState<Step>("form");
  const [priceData, setPriceData] = useState<RidePrice | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [ride, setRide] = useState<PendingRide | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payMethod, setPayMethod] = useState<"pix" | "credit_card">("pix");
  const [payProcessing, setPayProcessing] = useState(false);

  // ── Restaura corrida em andamento ao recarregar a página ──
  useEffect(() => {
    const saved = localStorage.getItem('public_ride_pending');
    if (!saved) return;
    try {
      const { rideId } = JSON.parse(saved);
      if (!rideId) return;
      supabase.from('public_rides')
        .select('id, tracking_code, status, estimated_price')
        .eq('id', rideId)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) { localStorage.removeItem('public_ride_pending'); return; }
          setRide(data as PendingRide);
          if (data.status === 'motoboy_aceitou' || data.status === 'aguardando_pagamento') {
            setStep('payment');
          } else if (data.status === 'aguardando_motoboy') {
            setStep('waiting');
          } else {
            localStorage.removeItem('public_ride_pending');
          }
        });
    } catch (_) { localStorage.removeItem('public_ride_pending'); }
  }, []);

  // ── Carrega dados do perfil se logado para preencher o formulário ──
  useEffect(() => {
    const loadProfileData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        let hasCoords = false;

        // Buscar dados gerais de profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, telefone, whatsapp, store_address, store_latitude, store_longitude, cidade, estado')
          .eq('id', user.id)
          .maybeSingle();

        if (profile) {
          if (profile.name) {
            setVisitorName(profile.name);
          }
          if (profile.whatsapp || profile.telefone) {
            setVisitorPhone(profile.whatsapp || profile.telefone || "");
          }
          if (profile.store_latitude && profile.store_longitude) {
            setOriginLat(profile.store_latitude);
            setOriginLng(profile.store_longitude);
            setOriginAddress(profile.store_address || profile.cidade || `Lat ${profile.store_latitude.toFixed(5)}, Lng ${profile.store_longitude.toFixed(5)}`);
            setShowOriginMap(true);
            hasCoords = true;
          }
        }

        // Tentar buscar endereço específico de motoboy
        const { data: motoboy } = await supabase
          .from('motoboy_profiles')
          .select('latitude_residencia, longitude_residencia, endereco_residencia, cidade, estado, nome, sobrenome')
          .eq('user_id', user.id)
          .maybeSingle();

        if (motoboy) {
          if (motoboy.nome) {
            setVisitorName(`${motoboy.nome} ${motoboy.sobrenome || ""}`.trim());
          }
          if (motoboy.latitude_residencia && motoboy.longitude_residencia) {
            setOriginLat(motoboy.latitude_residencia);
            setOriginLng(motoboy.longitude_residencia);
            setOriginAddress(motoboy.endereco_residencia || motoboy.cidade || `Lat ${motoboy.latitude_residencia.toFixed(5)}, Lng ${motoboy.longitude_residencia.toFixed(5)}`);
            setShowOriginMap(true);
            hasCoords = true;
          }
        }

        // Tentar buscar endereço específico de motorista
        const { data: driver } = await supabase
          .from('driver_profiles')
          .select('latitude_residencia, longitude_residencia, endereco_residencia, cidade, estado, nome, sobrenome')
          .eq('user_id', user.id)
          .maybeSingle();

        if (driver) {
          if (driver.nome) {
            setVisitorName(`${driver.nome} ${driver.sobrenome || ""}`.trim());
          }
          if (driver.latitude_residencia && driver.longitude_residencia) {
            setOriginLat(driver.latitude_residencia);
            setOriginLng(driver.longitude_residencia);
            setOriginAddress(driver.endereco_residencia || driver.cidade || `Lat ${driver.latitude_residencia.toFixed(5)}, Lng ${driver.longitude_residencia.toFixed(5)}`);
            setShowOriginMap(true);
            hasCoords = true;
          }
        }

        // Se não houver coordenadas exatas, mas há cidade/estado no cadastro, faz geocodificação
        if (!hasCoords) {
          const searchCity = motoboy?.cidade || driver?.cidade || profile?.cidade || "";
          const searchState = motoboy?.estado || driver?.estado || profile?.estado || "";
          const searchAddr = motoboy?.endereco_residencia || driver?.endereco_residencia || profile?.store_address || "";

          const searchQuery = [searchAddr || searchCity, searchState].filter(Boolean).join(", ");
          if (searchQuery) {
            const results = await geocodeAddress(searchQuery);
            if (results && results.length > 0) {
              setOriginLat(results[0].latLng.lat);
              setOriginLng(results[0].latLng.lng);
              setOriginAddress(results[0].formattedAddress.split(",").slice(0, 2).join(", "));
              setShowOriginMap(true);
              hasCoords = true;
            }
          }
        }

        // (Removido) NÃO usar um motoboy aleatório do sistema como coleta: a coleta
        // é a posição de quem chama (GPS ou endereço digitado). Herdar a residência
        // de outro cadastro fazia a coleta cair na cidade dele (ex.: Santa Catarina).

      } catch (err) {
        console.warn("Erro ao carregar dados do perfil para preencher formulário:", err);
      }
    };
    loadProfileData();
  }, []);

  // ── GPS ──
  const handleGetGPS = () => {
    if (!navigator.geolocation) {
      toast.error("GPS não disponível no seu dispositivo");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          // Validação de localização no Brasil para evitar coordenadas simuladas fora do país em testes
          const { data } = await supabase.functions.invoke('reverse-geocode', {
            body: { lat: pos.coords.latitude, lng: pos.coords.longitude }
          });
          const addrText = data?.results?.[0]?.formatted_address || "";
          const isBrazil = addrText.includes("Brasil") || addrText.includes("Brazil");
          
          if (isBrazil) {
            setOriginLat(pos.coords.latitude);
            setOriginLng(pos.coords.longitude);
            setOriginAddress(addrText.split(",").slice(0, 2).join(", "));
            setShowOriginMap(true);
            toast.success("Localização obtida!");
          } else {
            toast.error("Geolocalização fora do Brasil ignorada.");
          }
        } catch {
          // Fallback seguro caso a geocodificação falhe
          setOriginLat(pos.coords.latitude);
          setOriginLng(pos.coords.longitude);
          setOriginAddress(`Lat ${pos.coords.latitude.toFixed(5)}, Lng ${pos.coords.longitude.toFixed(5)}`);
          setShowOriginMap(true);
          toast.success("Localização obtida!");
        }
        setGpsLoading(false);
      },
      () => {
        setGpsLoading(false);
        toast.error("Não foi possível obter sua localização. Digite o endereço.");
      }
    );
  };

  // ── STEP 1 → 2: Calcular preço ──
  const handleCalculate = async () => {
    if (!visitorName.trim()) { toast.error("Informe seu nome"); return; }
    if (formatPhone(visitorPhone).length < 10) { toast.error("Informe um WhatsApp válido"); return; }
    if (!originLat || !originLng) { toast.error("Informe o endereço de coleta e use GPS ou buscar"); return; }
    if (!destLat || !destLng) { toast.error("Marque o ponto de entrega no mapa"); return; }

    // Garante que destinationAddress reflita as coordenadas do mapa se o campo texto estiver vazio
    const effectiveDestAddr = destinationAddress.trim() ||
      `Lat ${destLat.toFixed(5)}, Lng ${destLng.toFixed(5)}`;
    if (!destinationAddress.trim()) setDestinationAddress(effectiveDestAddr);

    setSubmitting(true);
    try {
      let price: RidePrice;

      if (originLat && originLng) {
        // Usa as coordenadas reais de coleta E entrega para cálculo preciso
        const { data, error } = await supabase.rpc("calculate_ride_price", {
          p_origin_lat: originLat,
          p_origin_lng: originLng,
          p_dest_lat: destLat,
          p_dest_lng: destLng,
        });
        if (error) throw error;
        price = data as RidePrice;
      } else {
        // Sem GPS → buscar config e usar preço mínimo + estimativa manual
        const { data: cfg } = await supabase
          .from("ride_pricing_config")
          .select("min_price, price_per_km, platform_commission_pct")
          .eq("is_active", true)
          .limit(1)
          .single();

        const minPrice = cfg?.min_price ?? 8;
        const commissionPct = cfg?.platform_commission_pct ?? 20;
        price = {
          distance_km: 0,
          duration_min: 0,
          price: minPrice,
          commission: +(minPrice * commissionPct / 100).toFixed(2),
          motoboy_earnings: +(minPrice * (1 - commissionPct / 100)).toFixed(2),
        };
      }

      setPriceData(price);

      // IA analisa o pedido
      try {
        const note = await viaggAI.suggestRidePrice({
          distanceKm: price.distance_km,
          durationMin: price.duration_min,
          basePrice: price.price,
          packageDescription,
        });
        setAiNote(note);
      } catch {
        /* IA indisponível — silencioso */
      }

      setStep("price");
    } catch (err) {
      toast.error("Erro ao calcular preço. Tente novamente.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // ── STEP 2 → 3: Criar corrida e aguardar motoboy ──
  const handleConfirmRequest = async () => {
    if (!priceData) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("public_rides")
        .insert({
          visitor_name: visitorName.trim(),
          visitor_phone: formatPhone(visitorPhone),
          origin_address: originAddress.trim(),
          origin_lat: originLat,
          origin_lng: originLng,
          destination_address: destinationAddress.trim() || (destLat && destLng ? `Lat ${destLat.toFixed(5)}, Lng ${destLng.toFixed(5)}` : ""),
          destination_lat: destLat,
          destination_lng: destLng,
          package_description: packageDescription.trim() || null,
          distance_km: priceData.distance_km,
          estimated_duration_min: priceData.duration_min,
          estimated_price: priceData.price,
          platform_commission: priceData.commission,
          motoboy_earnings: priceData.motoboy_earnings,
          status: "aguardando_motoboy",
        })
        .select("id, tracking_code, status, estimated_price")
        .single();

      if (error) throw error;
      setRide(data as PendingRide);
      localStorage.setItem('public_ride_pending', JSON.stringify({ rideId: (data as PendingRide).id }));
      setStep("waiting");
    } catch (err) {
      toast.error("Erro ao criar solicitação. Tente novamente.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // ── REALTIME + POLLING: aguardando motoboy aceitar ──
  // Realtime pode falhar para visitantes anônimos; polling de 4s garante a transição.
  useEffect(() => {
    if (step !== "waiting" || !ride) return;

    const handleStatusUpdate = (status: string) => {
      if (status === "motoboy_aceitou" || status === "aguardando_pagamento") {
        toast.success("🛵 Motoboy encontrado! Realize o pagamento para confirmar.");
        setStep("payment");
      } else if (status === "cancelado") {
        toast.error("Corrida expirada — nenhum motoboy disponível no momento.");
        localStorage.removeItem('public_ride_pending');
        setStep("form");
      }
    };

    // 1) Realtime (melhor caso)
    const channel = supabase
      .channel(`public_ride_${ride.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "public_rides", filter: `id=eq.${ride.id}` },
        (payload) => {
          const updated = payload.new as PendingRide;
          setRide((prev) => prev ? { ...prev, ...updated } : prev);
          handleStatusUpdate(updated.status);
        }
      )
      .subscribe();

    // 2) Polling a cada 4s (fallback caso realtime não funcione para anônimos)
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from("public_rides")
        .select("id, tracking_code, status, estimated_price")
        .eq("id", ride.id)
        .maybeSingle();
      if (!data) return;
      setRide((prev) => prev ? { ...prev, ...data } : prev);
      handleStatusUpdate(data.status);
    }, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [step, ride?.id]);

  // ── Cancelar chamada ──
  const handleCancel = () => {
    if (!ride) return;
    localStorage.removeItem('public_ride_pending');
    // fire-and-forget: não aguarda resposta (visitante anônimo pode não ter permissão de UPDATE)
    supabase.from('public_rides').update({ status: 'cancelado' }).eq('id', ride.id).catch(() => {});
    toast.info("Chamada cancelada.");
    setRide(null);
    setPriceData(null);
    setStep('form');
  };

  // ── STEP 4: Confirmar pagamento (simulado para v1) ──
  const handleConfirmPayment = async () => {
    if (!ride) return;
    setPayProcessing(true);
    try {
      const { data, error } = await supabase.rpc("confirm_public_ride_payment", {
        p_ride_id: ride.id,
        p_payment_method: payMethod,
        p_external_ref: `SIM-${Date.now()}`,
      });

      if (error) throw error;
      if (!data) throw new Error("Pagamento não confirmado pelo servidor.");

      toast.success("✅ Pagamento confirmado! Seu motoboy está a caminho.");
      localStorage.removeItem('public_ride_pending');
      setStep("confirmed");
    } catch (err) {
      toast.error("Erro ao confirmar pagamento. Tente novamente.");
      console.error(err);
    } finally {
      setPayProcessing(false);
    }
  };

  const copyTrackingCode = useCallback(() => {
    if (!ride) return;
    navigator.clipboard.writeText(ride.tracking_code);
    toast.success("Código copiado!");
  }, [ride]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <MarketLayout
      showSearch={false}
      hideCart
      headerChildren={<MarketNavButtons />}
      blueFooter
      blueFooterLabel="🛵 Motoboy"
      mainClassName="bg-gradient-to-b from-[#FF6A00] via-[#FF8C00] to-[#F5E62B]"
    >
      {/* Título da página */}
      <div className="pt-6 pb-4 px-4 text-center relative">
        <button
          onClick={() => navigate(-1)}
          className="absolute left-4 top-6 md:top-8 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors shadow-sm"
          title="Voltar"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shadow-lg overflow-hidden border border-white/30">
            <img src={motoboyHero} alt="Motoboy" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling!.classList.remove('hidden'); }} />
            <Bike className="w-7 h-7 text-white hidden" />
          </div>
          <div className="text-left">
            <h1 className="text-2xl font-black text-white leading-none">Chamar Motoboy</h1>
            <p className="text-orange-100 text-sm">Plataforma VIAGG-TX8™</p>
          </div>
        </div>
        <StepIndicator current={step} />
      </div>

      {/* Card principal */}
      <div className="px-4 pb-24 max-w-md mx-auto">
        {step === "form" && (
          <FormStep
            visitorName={visitorName} setVisitorName={setVisitorName}
            visitorPhone={visitorPhone} setVisitorPhone={setVisitorPhone}
            originAddress={originAddress} setOriginAddress={setOriginAddress}
            destinationAddress={destinationAddress} setDestinationAddress={setDestinationAddress}
            packageDescription={packageDescription} setPackageDescription={setPackageDescription}
            gpsLoading={gpsLoading} onGetGPS={handleGetGPS}
            hasGPS={!!(originLat && originLng)}
            originLat={originLat} originLng={originLng}
            onMapSelect={(lat, lng) => { setOriginLat(lat); setOriginLng(lng); }}
            destLat={destLat} destLng={destLng}
            onDestMapSelect={(lat, lng) => { setDestLat(lat); setDestLng(lng); }}
            showMap={showOriginMap} setShowMap={setShowOriginMap}
            submitting={submitting} onSubmit={handleCalculate}
          />
        )}

        {step === "price" && priceData && (
          <PriceStep
            priceData={priceData}
            originAddress={originAddress}
            destinationAddress={destinationAddress}
            aiNote={aiNote}
            hasGPS={!!(originLat && originLng)}
            submitting={submitting}
            onBack={() => setStep("form")}
            onConfirm={handleConfirmRequest}
          />
        )}

        {step === "waiting" && ride && (
          <WaitingStep ride={ride} onCancel={handleCancel} />
        )}

        {step === "payment" && ride && (
          <PaymentStep
            ride={ride}
            payMethod={payMethod}
            setPayMethod={setPayMethod}
            payProcessing={payProcessing}
            onConfirm={handleConfirmPayment}
          />
        )}

        {step === "confirmed" && ride && (
          <ConfirmedStep
            ride={ride}
            onCopyCode={copyTrackingCode}
            onTrack={() => navigate(`/corrida/${ride.tracking_code}`)}
          />
        )}
      </div>

      {/* IA Viagg-TX8 chat flutuante */}
      <ViaggAIChat
        context="Assistente de solicitação de motoboy. O visitante está no processo de solicitar uma entrega pela plataforma VIAGG. Responda dúvidas sobre custos, prazos, itens aceitos e como funciona o serviço."
        welcomeMessage="Olá! 🛵 Sou a IA Viagg-TX8. Posso te ajudar com dúvidas sobre a entrega ou o nosso serviço!"
      />
    </MarketLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTES
// ─────────────────────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const steps: Step[] = ["form", "price", "waiting", "payment", "confirmed"];
  const idx = steps.indexOf(current);
  return (
    <div className="flex items-center justify-center gap-2 mt-3">
      {steps.map((s, i) => (
        <div
          key={s}
          className={`h-2 rounded-full transition-all ${
            i <= idx ? "bg-white w-6" : "bg-white/30 w-3"
          }`}
        />
      ))}
    </div>
  );
}

interface FormStepProps {
  visitorName: string; setVisitorName: (v: string) => void;
  visitorPhone: string; setVisitorPhone: (v: string) => void;
  originAddress: string; setOriginAddress: (v: string) => void;
  destinationAddress: string; setDestinationAddress: (v: string) => void;
  packageDescription: string; setPackageDescription: (v: string) => void;
  gpsLoading: boolean; onGetGPS: () => void; hasGPS: boolean;
  originLat: number | null; originLng: number | null;
  onMapSelect: (lat: number, lng: number) => void;
  destLat: number | null; destLng: number | null;
  onDestMapSelect: (lat: number, lng: number) => void;
  showMap: boolean; setShowMap: (v: boolean) => void;
  submitting: boolean; onSubmit: () => void;
}

function FormStep({
  visitorName, setVisitorName, visitorPhone, setVisitorPhone,
  originAddress, setOriginAddress, destinationAddress, setDestinationAddress,
  packageDescription, setPackageDescription,
  gpsLoading, onGetGPS, hasGPS, originLat, originLng, onMapSelect,
  destLat, destLng, onDestMapSelect,
  showMap, setShowMap,
  submitting, onSubmit,
}: FormStepProps) {
  const [geocoding, setGeocoding] = useState(false);
  const [locationLocked, setLocationLocked] = useState(false);
  const [coordColeta, setCoordColeta] = useState("");
  const [coordDestino, setCoordDestino] = useState("");
  const [originPlace, setOriginPlace] = useState<string | null>(null);
  const [destPlace, setDestPlace] = useState<string | null>(null);

  const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    // Mapbox Geocoding API — dados mais completos para o Brasil
    if (token) {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&language=pt&country=BR&limit=1`
        );
        const data = await res.json();
        const feature = data.features?.[0];
        if (feature) {
          const ctx: { id: string; text: string; short_code?: string }[] = feature.context || [];
          const neighborhood =
            ctx.find(c => c.id.startsWith("neighborhood") || c.id.startsWith("locality"))?.text || "";
          const city = ctx.find(c => c.id.startsWith("place"))?.text || "";
          const state =
            ctx.find(c => c.id.startsWith("region"))?.short_code?.replace("BR-", "") ||
            ctx.find(c => c.id.startsWith("region"))?.text || "";
          const result = [neighborhood, city, state].filter(Boolean).join(", ");
          if (result) return result;
        }
      } catch { /* cai no fallback */ }
    }
    // Fallback Nominatim
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=pt-BR`
      );
      const data = await res.json();
      const addr = data.address || {};
      const bairro = addr.suburb || addr.neighbourhood || addr.residential || addr.city_district || addr.quarter || "";
      const cidade = addr.city || addr.town || addr.village || addr.municipality || "";
      const estado = addr.state_code?.replace("BR-", "") || "";
      return [bairro, cidade, estado].filter(Boolean).join(", ") || null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!originLat || !originLng) { setOriginPlace(null); return; }
    reverseGeocode(originLat, originLng).then(setOriginPlace);
  }, [originLat, originLng]);

  useEffect(() => {
    if (!destLat || !destLng) { setDestPlace(null); return; }
    reverseGeocode(destLat, destLng).then(setDestPlace);
  }, [destLat, destLng]);

  // Usa o MESMO parser homologado do fluxo do lojista (CreateDelivery):
  // aceita coordenadas, link do Google Maps e do WhatsApp.
  const parseCoords = (text: string): { lat: number; lng: number } | null => {
    const r = parseCoordinates(text);
    if (r.success && r.coordinates) {
      return { lat: r.coordinates.latitude, lng: r.coordinates.longitude };
    }
    return null;
  };

  const geocodeAddress = async (address: string) => {
    if (!address.trim()) return null;
    // Se o usuário colou coordenadas, usa direto (sem chamar geocoder)
    const coords = parseCoords(address);
    if (coords) return coords;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=br`,
      { headers: { "Accept-Language": "pt-BR" } }
    );
    const data = await res.json();
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    return null;
  };

  const handleGeocode = async () => {
    if (!originAddress.trim()) {
      toast.error("Digite um endereço ou cole as coordenadas de coleta");
      return;
    }
    setGeocoding(true);
    try {
      const originCoords = parseCoords(originAddress);
      const destCoords = parseCoords(destinationAddress);
      const [originResult, destResult] = await Promise.all([
        geocodeAddress(originAddress),
        destinationAddress.trim() ? geocodeAddress(destinationAddress) : Promise.resolve(null),
      ]);
      if (originResult) {
        onMapSelect(originResult.lat, originResult.lng);
        setShowMap(true);
        // Se veio de coordenadas coladas, resolve o endereço legível e mostra no campo
        if (originCoords) {
          reverseGeocode(originResult.lat, originResult.lng).then((addr) => addr && setOriginAddress(addr));
        }
        if (destResult) {
          onDestMapSelect(destResult.lat, destResult.lng);
          if (destCoords) reverseGeocode(destResult.lat, destResult.lng).then((addr) => addr && setDestinationAddress(addr));
        }
        toast.success(destResult ? "Coleta e Entrega localizadas no mapa!" : "Coleta localizada no mapa!");
      } else {
        toast.error("Endereço/coordenada de coleta não encontrado. Tente ser mais específico.");
      }
    } catch {
      toast.error("Erro ao buscar endereços.");
    } finally {
      setGeocoding(false);
    }
  };

  // Aplica coordenadas coladas num dos balões → marca o pino + resolve o endereço
  const applyCoords = async (text: string, target: "origin" | "dest") => {
    const c = parseCoords(text);
    if (!c) {
      toast.error("Cole coordenadas válidas. Ex: -10.9267, -53.2035");
      return;
    }
    setShowMap(true);
    if (target === "origin") {
      onMapSelect(c.lat, c.lng);
      setOriginAddress(`${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
      reverseGeocode(c.lat, c.lng).then((addr) => addr && setOriginAddress(addr));
      toast.success("📦 Coleta (quem chama) marcada no mapa!");
    } else {
      onDestMapSelect(c.lat, c.lng);
      setDestinationAddress(`${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
      reverseGeocode(c.lat, c.lng).then((addr) => addr && setDestinationAddress(addr));
      toast.success("🏁 Destino (para onde vai) marcado no mapa!");
    }
  };

  const handleGecodeDest = async () => {
    if (!destinationAddress.trim()) {
      toast.error("Digite um endereço ou cole as coordenadas de entrega");
      return;
    }
    setGeocoding(true);
    try {
      const destCoords = parseCoords(destinationAddress);
      const result = await geocodeAddress(destinationAddress);
      if (result) {
        onDestMapSelect(result.lat, result.lng);
        setShowMap(true);
        if (destCoords) reverseGeocode(result.lat, result.lng).then((addr) => addr && setDestinationAddress(addr));
        toast.success("Pino de entrega marcado no mapa!");
      } else {
        toast.error("Endereço/coordenada de entrega não encontrado. Tente ser mais específico.");
      }
    } catch {
      toast.error("Erro ao buscar endereço de entrega.");
    } finally {
      setGeocoding(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl p-6 space-y-5">
      <div>
        <h2 className="text-xl font-black text-zinc-900">Solicitar Motoboy</h2>
        <p className="text-zinc-500 text-sm">Sem cadastro necessário · Pagamento só após aceite</p>
      </div>

      {/* Nome */}
      <Field label="Seu nome" icon={<User className="w-4 h-4" />}>
        <Input
          value={visitorName}
          onChange={(e) => setVisitorName(e.target.value)}
          placeholder="Nome completo"
          className="rounded-xl border-zinc-200"
        />
      </Field>

      {/* WhatsApp */}
      <Field label="WhatsApp (receberá o link de rastreamento)" icon={<Phone className="w-4 h-4" />}>
        <Input
          value={phoneMask(visitorPhone)}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "").slice(0, 11);
            setVisitorPhone(raw);
          }}
          placeholder="(00) 00000-0000"
          className="rounded-xl border-zinc-200"
        />
      </Field>

      {/* ── Balões de coordenadas (colar lat, lng) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Quem chama (coleta) */}
        <div className="rounded-2xl border-2 border-green-200 bg-green-50/60 p-3">
          <p className="text-[11px] font-black text-green-700 mb-1.5 flex items-center gap-1">
            📦 Quem chama (coleta)
          </p>
          <div className="flex gap-1.5">
            <Input
              value={coordColeta}
              onChange={(e) => setCoordColeta(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyCoords(coordColeta, "origin"); }}
              placeholder="Coordenadas ou link do Google Maps"
              className="rounded-xl border-green-200 bg-white flex-1 text-xs h-9"
            />
            <button
              onClick={() => applyCoords(coordColeta, "origin")}
              className="px-3 h-9 bg-green-500 hover:bg-green-600 text-white text-xs font-black rounded-xl shrink-0"
            >
              Marcar
            </button>
          </div>
        </div>
        {/* Para onde o motoboy vai (destino) */}
        <div className="rounded-2xl border-2 border-red-200 bg-red-50/60 p-3">
          <p className="text-[11px] font-black text-red-600 mb-1.5 flex items-center gap-1">
            🏁 Para onde o motoboy vai (destino)
          </p>
          <div className="flex gap-1.5">
            <Input
              value={coordDestino}
              onChange={(e) => setCoordDestino(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyCoords(coordDestino, "dest"); }}
              placeholder="Coordenadas ou link do Google Maps"
              className="rounded-xl border-red-200 bg-white flex-1 text-xs h-9"
            />
            <button
              onClick={() => applyCoords(coordDestino, "dest")}
              className="px-3 h-9 bg-red-500 hover:bg-red-600 text-white text-xs font-black rounded-xl shrink-0"
            >
              Marcar
            </button>
          </div>
        </div>
      </div>

      {/* Origem */}
      <Field label="Endereço de coleta" icon={<MapPin className="w-4 h-4 text-green-500" />}>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={originAddress}
              onChange={(e) => setOriginAddress(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleGeocode(); }}
              placeholder="Endereço, coordenadas ou link do Google Maps"
              className="rounded-xl border-zinc-200 flex-1"
            />
            <button
              onClick={handleGeocode}
              disabled={geocoding}
              className="flex items-center gap-1.5 px-3 h-10 bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white text-xs font-black rounded-xl transition-colors shrink-0"
            >
              {geocoding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Buscar
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onGetGPS}
              disabled={gpsLoading}
              className="flex items-center gap-1.5 text-[#FF6A00] text-xs font-bold hover:underline"
            >
              {gpsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
              {hasGPS ? "✅ GPS obtido" : "Usar GPS"}
            </button>
            <span className="text-zinc-300">|</span>
            <button
              onClick={() => setShowMap((v) => !v)}
              className="flex items-center gap-1.5 text-blue-500 text-xs font-bold hover:underline"
            >
              <Map className="w-3 h-3" />
              {showMap ? "Ocultar mapa" : "Selecionar no mapa"}
            </button>
          </div>

          {showMap && !locationLocked && (
            <>
              <RideMapPremium
                originLat={originLat ?? undefined}
                originLng={originLng ?? undefined}
                destLat={destLat ?? undefined}
                destLng={destLng ?? undefined}
                onOriginChange={(lat, lng) => {
                  if (lat === 0 && lng === 0) { onMapSelect(0, 0); return; } // reset
                  onMapSelect(lat, lng);
                  // Mostra a coordenada na hora e resolve o endereço legível em seguida
                  setOriginAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
                  reverseGeocode(lat, lng).then((addr) => addr && setOriginAddress(addr));
                }}
                onDestChange={(lat, lng) => {
                  if (lat === 0 && lng === 0) { onDestMapSelect(0, 0); return; } // reset
                  onDestMapSelect(lat, lng);
                  setDestinationAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
                  reverseGeocode(lat, lng).then((addr) => addr && setDestinationAddress(addr));
                }}
                height={300}
                className="mt-1 w-full"
              />
              <p className="text-[10px] text-zinc-400 text-center mt-1">
                Arraste os pinos para ajustar a posição exata
              </p>
              <button
                onClick={() => { setLocationLocked(true); setShowMap(false); }}
                disabled={!originLat || !originLng}
                style={{ position: "relative", zIndex: 1000 }}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm rounded-xl transition-colors"
              >
                <Lock className="w-4 h-4" />
                Travar e adicionar localização
              </button>
            </>
          )}

          {locationLocked && originLat && originLng && (
            <div className="rounded-xl border border-green-300 bg-green-50 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 bg-green-500">
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-white" />
                  <p className="text-xs font-black text-white tracking-wide">Localização travada</p>
                </div>
                <button
                  onClick={() => { setLocationLocked(false); setShowMap(true); }}
                  className="flex items-center gap-1 text-[11px] text-white/80 hover:text-white font-bold"
                >
                  <Pencil className="w-3 h-3" />
                  Alterar
                </button>
              </div>

              {/* Coleta */}
              <div className="flex items-start gap-2.5 px-3 py-2.5 border-b border-green-200">
                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px]">📦</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-green-700 uppercase tracking-widest">Coleta</p>
                  <p className="text-xs font-black text-zinc-900 truncate">
                    {originPlace || originAddress || "Buscando localização…"}
                  </p>
                  <p className="text-[10px] text-zinc-400 font-mono">
                    {originLat.toFixed(6)}, {originLng.toFixed(6)}
                  </p>
                </div>
              </div>

              {/* Entrega */}
              <div className="flex items-start gap-2.5 px-3 py-2.5">
                <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px]">🏁</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">Entrega</p>
                  {destLat && destLng ? (
                    <>
                      <p className="text-xs font-black text-zinc-900 truncate">
                        {destPlace || "Buscando localização…"}
                      </p>
                      <p className="text-[10px] text-zinc-400 font-mono">
                        {destLat.toFixed(6)}, {destLng.toFixed(6)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-zinc-400 italic">Não marcado — abra o mapa e toque para marcar</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Field>


      {/* Pacote */}
      <Field label="O que será entregue? (opcional)" icon={<Package className="w-4 h-4" />}>
        <Textarea
          value={packageDescription}
          onChange={(e) => setPackageDescription(e.target.value)}
          placeholder="Ex: Caixa pequena, envelope, medicamento..."
          className="rounded-xl border-zinc-200 resize-none text-sm"
          rows={2}
        />
      </Field>

      <Button
        onClick={onSubmit}
        disabled={submitting}
        className="w-full h-12 bg-[#FF6A00] hover:bg-[#e55a00] text-white font-black rounded-2xl text-base"
      >
        {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (
          <span className="flex items-center gap-2">Calcular corrida <ArrowRight className="w-5 h-5" /></span>
        )}
      </Button>

      <p className="text-center text-xs text-zinc-400">
        Ao solicitar, você concorda com os termos da plataforma VIAGG-TX8
      </p>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-bold text-zinc-700">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}

function PriceStep({
  priceData, originAddress, destinationAddress, aiNote, hasGPS, submitting, onBack, onConfirm,
}: {
  priceData: RidePrice; originAddress: string; destinationAddress: string;
  aiNote: string | null; hasGPS: boolean; submitting: boolean;
  onBack: () => void; onConfirm: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl shadow-2xl p-6 space-y-5">
        <div>
          <h2 className="text-xl font-black text-zinc-900">Resumo da Corrida</h2>
          <p className="text-zinc-500 text-sm">Confirme os dados antes de solicitar</p>
        </div>

        {/* Rota */}
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-green-50 rounded-2xl">
            <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center shrink-0 mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-green-600 uppercase tracking-wide">Coleta</p>
              <p className="text-sm font-medium text-zinc-900">{originAddress}</p>
            </div>
          </div>
          <div className="ml-3.5 w-0.5 h-4 bg-zinc-200" />
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-2xl">
            <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center shrink-0 mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide">Entrega</p>
              <p className="text-sm font-medium text-zinc-900">{destinationAddress}</p>
            </div>
          </div>
        </div>

        {/* Métricas */}
        {hasGPS && priceData.distance_km > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-50 rounded-2xl p-3 text-center">
              <p className="text-xl font-black text-zinc-900">{priceData.distance_km} km</p>
              <p className="text-xs text-zinc-500">Distância estimada</p>
            </div>
            <div className="bg-zinc-50 rounded-2xl p-3 text-center">
              <p className="text-xl font-black text-zinc-900">{priceData.duration_min} min</p>
              <p className="text-xs text-zinc-500">Tempo estimado</p>
            </div>
          </div>
        )}

        {!hasGPS && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-2xl border border-amber-100">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              Preço baseado no valor mínimo da corrida. O valor exato será confirmado pelo motoboy.
            </p>
          </div>
        )}

        {/* Preço */}
        <div className="bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] rounded-2xl p-5 text-center">
          <p className="text-orange-100 text-sm font-medium">Valor da corrida</p>
          <p className="text-4xl font-black text-white mt-1">
            R$ {priceData.price.toFixed(2).replace(".", ",")}
          </p>
          <p className="text-orange-200 text-xs mt-1">
            Motoboy recebe R$ {priceData.motoboy_earnings.toFixed(2).replace(".", ",")}
          </p>
        </div>

        {/* Análise da IA */}
        {aiNote && (
          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-2xl border border-blue-100">
            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-[10px]">🤖</span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">IA Viagg-TX8</p>
              <p className="text-xs text-blue-700">{aiNote}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            onClick={onBack}
            className="rounded-2xl border-zinc-200 font-bold"
          >
            Voltar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={submitting}
            className="bg-[#FF6A00] hover:bg-[#e55a00] text-white font-black rounded-2xl"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <span className="flex items-center gap-1">Solicitar <ChevronRight className="w-4 h-4" /></span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function WaitingStep({ ride, onCancel }: { ride: PendingRide; onCancel: () => void }) {
  const CYCLE = 180; // 3 minutos
  const [timeLeft, setTimeLeft] = useState(CYCLE);
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setShowCancel(true);
          return CYCLE; // reinicia
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const R = 36;
  const circ = 2 * Math.PI * R;
  const dashOffset = circ * (1 - timeLeft / CYCLE);
  const min = Math.floor(timeLeft / 60);
  const sec = timeLeft % 60;
  const label = min > 0 ? `${min}:${sec.toString().padStart(2, '0')}` : `${sec}s`;

  return (
    <div className="bg-white rounded-3xl shadow-2xl p-8 text-center space-y-6">
      {/* Ícone motoboy */}
      <div className="relative mx-auto w-24 h-24">
        <div className="absolute inset-0 rounded-full bg-orange-100 animate-ping opacity-50" />
        <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-[#FF6A00] to-[#FF8C00] flex items-center justify-center shadow-xl">
          <Bike className="w-12 h-12 text-white" />
        </div>
      </div>

      <div>
        <h2 className="text-xl font-black text-zinc-900">Procurando motoboy...</h2>
        <p className="text-zinc-500 text-sm mt-1">
          A IA Viagg-TX8 está distribuindo sua corrida para motoboys disponíveis
        </p>
      </div>

      {/* Contador regressivo verde */}
      <div className="flex flex-col items-center gap-1">
        <div className="relative" style={{ width: 88, height: 88 }}>
          <svg width="88" height="88" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="44" cy="44" r={R} fill="none" stroke="#dcfce7" strokeWidth="8" />
            <circle
              cx="44" cy="44" r={R}
              fill="none"
              stroke="#16a34a"
              strokeWidth="8"
              strokeDasharray={circ}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.9s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-black text-green-600 tabular-nums">{label}</span>
          </div>
        </div>
        <p className="text-[10px] font-bold text-green-600 uppercase tracking-wide">
          {showCancel ? 'nova tentativa' : 'buscando motoboy'}
        </p>
      </div>

      {/* Código */}
      <div className="bg-zinc-50 rounded-2xl p-4 space-y-2">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Código da sua corrida</p>
        <p className="text-2xl font-black text-zinc-900 tracking-widest">{ride.tracking_code}</p>
        <p className="text-xs text-zinc-400">Anote para consultar o status depois</p>
      </div>

      {/* Cancelar — aparece após o primeiro ciclo de 3 min */}
      {showCancel && (
        <button
          onClick={onCancel}
          className="w-full h-12 rounded-2xl border-2 border-red-300 bg-white text-red-500 font-black text-sm flex items-center justify-center gap-2 hover:bg-red-50 active:bg-red-100 transition-colors"
        >
          <XCircle className="w-5 h-5" />
          Cancelar chamada
        </button>
      )}

      <p className="text-xs text-zinc-400">
        O motoboy tem 15 minutos para aceitar. Você será notificado imediatamente.
      </p>
    </div>
  );
}

function PaymentStep({
  ride, payMethod, setPayMethod, payProcessing, onConfirm,
}: {
  ride: PendingRide;
  payMethod: "pix" | "credit_card";
  setPayMethod: (m: "pix" | "credit_card") => void;
  payProcessing: boolean;
  onConfirm: () => void;
}) {
  return (
    <div className="bg-white rounded-3xl shadow-2xl p-6 space-y-5">
      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
          <CheckCircle className="w-8 h-8 text-green-500" />
        </div>
        <h2 className="text-xl font-black text-zinc-900">Motoboy encontrado! 🛵</h2>
        <p className="text-zinc-500 text-sm">Realize o pagamento para confirmar a corrida</p>
      </div>

      <div className="bg-[#FF6A00]/10 rounded-2xl p-4 text-center">
        <p className="text-zinc-600 text-sm">Total a pagar</p>
        <p className="text-3xl font-black text-[#FF6A00]">
          R$ {(ride.estimated_price ?? 0).toFixed(2).replace(".", ",")}
        </p>
      </div>

      {/* Método de pagamento */}
      <div className="space-y-2">
        <p className="text-sm font-bold text-zinc-700">Forma de pagamento</p>
        <button
          onClick={() => setPayMethod("pix")}
          className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition-all ${
            payMethod === "pix" ? "border-[#FF6A00] bg-orange-50" : "border-zinc-200"
          }`}
        >
          <QrCode className="w-5 h-5 text-[#FF6A00]" />
          <div className="text-left">
            <p className="font-bold text-sm text-zinc-900">PIX</p>
            <p className="text-xs text-zinc-500">Aprovação imediata</p>
          </div>
          {payMethod === "pix" && <CheckCircle className="w-4 h-4 text-[#FF6A00] ml-auto" />}
        </button>
        <button
          onClick={() => setPayMethod("credit_card")}
          className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition-all ${
            payMethod === "credit_card" ? "border-[#FF6A00] bg-orange-50" : "border-zinc-200"
          }`}
        >
          <CreditCard className="w-5 h-5 text-[#FF6A00]" />
          <div className="text-left">
            <p className="font-bold text-sm text-zinc-900">Cartão de crédito</p>
            <p className="text-xs text-zinc-500">Todas as bandeiras</p>
          </div>
          {payMethod === "credit_card" && <CheckCircle className="w-4 h-4 text-[#FF6A00] ml-auto" />}
        </button>
      </div>

      <Button
        onClick={onConfirm}
        disabled={payProcessing}
        className="w-full h-12 bg-[#FF6A00] hover:bg-[#e55a00] text-white font-black rounded-2xl"
      >
        {payProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirmar Pagamento"}
      </Button>

      <p className="text-center text-xs text-zinc-400">
        🔒 Pagamento processado com segurança pela plataforma VIAGG
      </p>
    </div>
  );
}

function ConfirmedStep({
  ride, onCopyCode, onTrack,
}: {
  ride: PendingRide;
  onCopyCode: () => void;
  onTrack: () => void;
}) {
  return (
    <div className="bg-white rounded-3xl shadow-2xl p-8 text-center space-y-6">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
        <CheckCircle className="w-12 h-12 text-green-500" />
      </div>

      <div>
        <h2 className="text-2xl font-black text-zinc-900">Corrida confirmada!</h2>
        <p className="text-zinc-500 text-sm mt-1">Seu motoboy está a caminho para a coleta</p>
      </div>

      <div className="bg-zinc-50 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Código de rastreamento</p>
        <div className="flex items-center justify-center gap-2">
          <p className="text-3xl font-black text-zinc-900 tracking-widest">{ride.tracking_code}</p>
          <button onClick={onCopyCode} className="text-zinc-400 hover:text-zinc-600">
            <Copy className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-zinc-400">
          Um link de rastreamento foi enviado para o seu WhatsApp
        </p>
      </div>

      <Button
        onClick={onTrack}
        className="w-full h-12 bg-zinc-900 hover:bg-zinc-800 text-white font-black rounded-2xl"
      >
        <span className="flex items-center gap-2">
          Acompanhar entrega ao vivo <ArrowRight className="w-5 h-5" />
        </span>
      </Button>
    </div>
  );
}
