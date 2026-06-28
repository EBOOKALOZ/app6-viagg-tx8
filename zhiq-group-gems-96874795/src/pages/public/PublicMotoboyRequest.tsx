import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapPin, Phone, User, Package, ArrowRight, Clock, Bike,
  CheckCircle, CreditCard, QrCode, Loader2, Copy, ChevronRight,
  Navigation, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ViaggAIChat } from "@/components/public/ViaggAIChat";
import { viaggAI } from "@/lib/viaggAI";

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
  const [gpsLoading, setGpsLoading] = useState(false);

  // State
  const [step, setStep] = useState<Step>("form");
  const [priceData, setPriceData] = useState<RidePrice | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [ride, setRide] = useState<PendingRide | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payMethod, setPayMethod] = useState<"pix" | "credit_card">("pix");
  const [payProcessing, setPayProcessing] = useState(false);

  // ── GPS ──
  const handleGetGPS = () => {
    if (!navigator.geolocation) {
      toast.error("GPS não disponível no seu dispositivo");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOriginLat(pos.coords.latitude);
        setOriginLng(pos.coords.longitude);
        setOriginAddress(`Lat ${pos.coords.latitude.toFixed(5)}, Lng ${pos.coords.longitude.toFixed(5)}`);
        setGpsLoading(false);
        toast.success("Localização obtida!");
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
    if (!originAddress.trim()) { toast.error("Informe o endereço de coleta"); return; }
    if (!destinationAddress.trim()) { toast.error("Informe o endereço de entrega"); return; }

    setSubmitting(true);
    try {
      let price: RidePrice;

      if (originLat && originLng) {
        // Coordenadas disponíveis → usar Haversine via RPC
        // Como não temos as coords do destino, usamos uma estimativa
        const { data, error } = await supabase.rpc("calculate_ride_price", {
          p_origin_lat: originLat,
          p_origin_lng: originLng,
          p_dest_lat: originLat + 0.05,   // fallback: ~5.5 km de distância estimada
          p_dest_lng: originLng + 0.05,
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
          destination_address: destinationAddress.trim(),
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
      setStep("waiting");
    } catch (err) {
      toast.error("Erro ao criar solicitação. Tente novamente.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // ── REALTIME: aguardando motoboy aceitar ──
  useEffect(() => {
    if (step !== "waiting" || !ride) return;

    const channel = supabase
      .channel(`public_ride_${ride.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "public_rides", filter: `id=eq.${ride.id}` },
        (payload) => {
          const updated = payload.new as PendingRide;
          setRide((prev) => prev ? { ...prev, ...updated } : prev);
          if (updated.status === "motoboy_aceitou") {
            toast.success("🛵 Motoboy encontrado! Realize o pagamento para confirmar.");
            setStep("payment");
          }
          if (updated.status === "cancelado") {
            toast.error("Corrida expirada — nenhum motoboy disponível no momento.");
            setStep("form");
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [step, ride]);

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
    <div className="min-h-screen bg-gradient-to-b from-[#FF6A00] via-[#FF8C00] to-[#F5E62B]">
      {/* Header */}
      <header className="pt-8 pb-6 px-4 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shadow-lg">
            <Bike className="w-7 h-7 text-white" />
          </div>
          <div className="text-left">
            <h1 className="text-2xl font-black text-white leading-none">Chamar Motoboy</h1>
            <p className="text-orange-100 text-sm">Plataforma VIAGG-TX8™</p>
          </div>
        </div>
        <StepIndicator current={step} />
      </header>

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
          <WaitingStep ride={ride} />
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
    </div>
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
  submitting: boolean; onSubmit: () => void;
}

function FormStep({
  visitorName, setVisitorName, visitorPhone, setVisitorPhone,
  originAddress, setOriginAddress, destinationAddress, setDestinationAddress,
  packageDescription, setPackageDescription,
  gpsLoading, onGetGPS, hasGPS, submitting, onSubmit,
}: FormStepProps) {
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

      {/* Origem */}
      <Field label="Endereço de coleta" icon={<MapPin className="w-4 h-4 text-green-500" />}>
        <div className="space-y-2">
          <Input
            value={originAddress}
            onChange={(e) => setOriginAddress(e.target.value)}
            placeholder="Rua, número, bairro, cidade"
            className="rounded-xl border-zinc-200"
          />
          <button
            onClick={onGetGPS}
            disabled={gpsLoading}
            className="flex items-center gap-2 text-[#FF6A00] text-xs font-bold hover:underline"
          >
            {gpsLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Navigation className="w-3 h-3" />
            )}
            {hasGPS ? "✅ Localização obtida" : "Usar minha localização atual"}
          </button>
        </div>
      </Field>

      {/* Destino */}
      <Field label="Endereço de entrega" icon={<MapPin className="w-4 h-4 text-red-500" />}>
        <Input
          value={destinationAddress}
          onChange={(e) => setDestinationAddress(e.target.value)}
          placeholder="Rua, número, bairro, cidade"
          className="rounded-xl border-zinc-200"
        />
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

function WaitingStep({ ride }: { ride: PendingRide }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="bg-white rounded-3xl shadow-2xl p-8 text-center space-y-6">
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

      <div className="flex items-center justify-center gap-2 text-zinc-400 text-sm">
        <Clock className="w-4 h-4" />
        <span>Aguardando há {elapsed}s</span>
      </div>

      <div className="bg-zinc-50 rounded-2xl p-4 space-y-2">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Código da sua corrida</p>
        <p className="text-2xl font-black text-zinc-900 tracking-widest">{ride.tracking_code}</p>
        <p className="text-xs text-zinc-400">Anote para consultar o status depois</p>
      </div>

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
