// ── AcceptedRideCard ─────────────────────────────────────────────────────────
// Card PREMIUM exibido para o CLIENTE depois que o profissional (motoboy,
// moto-táxi ou motorista de carro) aceita a corrida. Mostra status em tempo
// real, dados do profissional e do veículo ativo, galeria de fotos com
// lightbox e ações rápidas (conversar / ligar / compartilhar / cancelar).
//
// REGRA: só lê dados que já existem — nenhuma tabela nova, nenhuma coluna
// nova. Fontes:
//  • Pedido: service_orders | motorista_corridas (mesmas colunas de estado
//    do PaymentCountdown: driver_status / payment_status + Realtime).
//  • Profissional: profiles (name, avatar_url — leitura pública) e,
//    best-effort, motoboy_profiles / driver_profiles (hoje owner-only por
//    RLS: em produção o fallback gracioso é o caminho comum para
//    quem acessa como cliente).
//  • Veículo: driver_vehicles ativo do profissional (RLS permite leitura
//    pública de linhas com active = true).
//
// Uso:
//   <AcceptedRideCard orderId={rideId} table="service_orders" onCancel={...} />
//   <AcceptedRideCard orderId={rideId} table="motorista_corridas" />

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2, Navigation, CheckCircle2, XCircle, Clock, MapPin, Star,
  MessageCircle, Phone, Share2, Car, Bike, Wind, Users, Accessibility,
  Camera, X, ChevronLeft, ChevronRight, ShieldAlert,
} from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type RideTable = "service_orders" | "motorista_corridas";

interface AcceptedRideCardProps {
  orderId: string;
  /** Tabela da corrida. Default 'service_orders' (motoboy / moto-táxi). */
  table?: RideTable;
  onCancel?: () => void;
  className?: string;
}

interface ProfessionalDisplay {
  name: string;
  avatarUrl: string | null;
  /** Contato comercial (whatsapp/foto de operação) — nunca o telefone pessoal. */
  whatsapp: string | null;
  rating: number | null;
  totalRides: number | null;
}

interface ActiveVehicle {
  vehicle_type: "carro" | "moto" | string;
  brand: string;
  model: string;
  manufacture_year: number | null;
  plate: string;
  color: string;
  air_conditioning: boolean | null;
  passenger_capacity: number | null;
  accessible: boolean | null;
  accessibility_features: string[] | null;
  observations: string | null;
  front_photo: string | null;
  rear_photo: string | null;
  side_photo: string | null;
  interior_photo: string | null;
}

type StatusTone = "wait" | "progress" | "done" | "cancel";
interface StatusInfo {
  label: string;
  tone: StatusTone;
}

// ── Helpers puros ─────────────────────────────────────────────────────────────
function onlyDigits(v?: string | null): string {
  return (v || "").replace(/\D/g, "");
}

/** Placa mascarada: 3 primeiros + últimos 1 (ex.: ABC-***3). */
function maskPlate(plate?: string | null): string {
  if (!plate) return "—";
  const p = plate.toUpperCase();
  if (p.length < 4) return p;
  return `${p.slice(0, 3)}-***${p.slice(-1)}`;
}

function parseLeadingMinutes(text?: string | null): number | null {
  if (!text) return null;
  const m = String(text).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function toWhatsAppLink(phone: string, text: string): string {
  let digits = onlyDigits(phone);
  if (digits && digits.length <= 11) digits = `55${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Extrai os campos comuns da corrida, aceitando os dois desenhos de tabela
 *  (service_orders em inglês, motorista_corridas em português). */
function extractRide(row: any, table: RideTable) {
  if (!row) {
    return {
      professionalId: null as string | null,
      driverStatus: null as string | null,
      paymentStatus: null as string | null,
      distanceKm: null as number | null,
      value: null as number | null,
      etaMinutes: null as number | null,
    };
  }
  const professionalId: string | null =
    table === "motorista_corridas"
      ? row.motorista_id ?? null
      : row.courier_id ?? row.motoboy_id ?? row.professional_uid ?? null;

  const rawDistance = row.distance_km ?? row.distancia_km ?? row.estimated_km ?? null;
  const rawValue = row.total_price ?? row.estimated_value ?? row.valor ?? row.estimated_price ?? null;
  const rawEta = row.estimated_time_minutes ?? parseLeadingMinutes(row.tempo_estimado) ?? null;

  return {
    professionalId,
    driverStatus: row.driver_status ?? null,
    paymentStatus: row.payment_status ?? null,
    distanceKm: rawDistance != null ? Number(rawDistance) : null,
    value: rawValue != null ? Number(rawValue) : null,
    etaMinutes: rawEta != null ? Number(rawEta) : null,
  };
}

function resolveRideStatus(driverStatus: string | null, paymentStatus: string | null): StatusInfo {
  if (driverStatus === "cancelled") return { label: "Cancelada", tone: "cancel" };
  if (driverStatus === "payment_timeout") return { label: "Tempo de pagamento expirou", tone: "cancel" };
  if (driverStatus === "completed") return { label: "Corrida finalizada", tone: "done" };
  if (driverStatus === "in_progress") return { label: "Corrida iniciada", tone: "progress" };
  if (driverStatus === "arrived") return { label: "Chegou ao local", tone: "progress" };
  if (paymentStatus === "paid" || driverStatus === "driver_on_the_way") {
    return { label: "Pagamento confirmado — profissional a caminho", tone: "progress" };
  }
  if (driverStatus === "waiting_payment") return { label: "Aguardando pagamento", tone: "wait" };
  // accepted / waiting_accept / null: profissional já foi vinculado, aguardando o próximo passo
  return { label: "Profissional confirmado — preparando corrida", tone: "wait" };
}

const TONE_STYLES: Record<StatusTone, string> = {
  wait: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50",
  progress: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50",
  cancel: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800",
};

// ── Botão de ação (grade 2x2 / 4 colunas) ────────────────────────────────────
function ActionButton({
  icon: Icon, label, onClick, disabled, hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className="flex h-auto flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-semibold disabled:opacity-40"
    >
      <Icon className="h-5 w-5" />
      {label}
    </Button>
  );
}

// ── Fato do veículo (mini label + valor) ─────────────────────────────────────
function VehicleFact({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-muted/40 px-2 py-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="truncate">
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-semibold text-foreground">{value}</span>
      </span>
    </div>
  );
}

// ── Lightbox de fotos (sem lib externa) ──────────────────────────────────────
function PhotoLightbox({
  photos, index, onIndexChange, onClose,
}: {
  photos: string[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onIndexChange((index + 1) % photos.length);
      else if (e.key === "ArrowLeft") onIndexChange((index - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [index, photos.length, onIndexChange, onClose]);

  return (
    <AnimatePresence>
      <motion.div
        key="ride-vehicle-lightbox"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>

        {photos.length > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onIndexChange((index - 1 + photos.length) % photos.length); }}
            aria-label="Foto anterior"
            className="absolute left-2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 sm:left-6"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        <motion.img
          key={photos[index]}
          src={photos[index]}
          alt={`Foto ${index + 1} de ${photos.length} do veículo`}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.18 }}
          className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />

        {photos.length > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onIndexChange((index + 1) % photos.length); }}
            aria-label="Próxima foto"
            className="absolute right-2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 sm:right-6"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}

        {photos.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">
            {index + 1} / {photos.length}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export function AcceptedRideCard({
  orderId, table = "service_orders", onCancel, className = "",
}: AcceptedRideCardProps) {
  const [rideRow, setRideRow] = useState<any>(null);
  const [loadingRide, setLoadingRide] = useState(true);

  const [professional, setProfessional] = useState<ProfessionalDisplay | null>(null);
  const [loadingProfessional, setLoadingProfessional] = useState(false);

  const [vehicle, setVehicle] = useState<ActiveVehicle | null>(null);
  const [loadingVehicle, setLoadingVehicle] = useState(false);

  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // ── 1) Fetch inicial do pedido ──────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setLoadingRide(true);
    (supabase as any)
      .from(table)
      .select("*")
      .eq("id", orderId)
      .maybeSingle()
      .then(({ data, error }: any) => {
        if (!alive) return;
        if (error) console.warn("[AcceptedRideCard] erro ao buscar pedido:", error);
        setRideRow(data ?? null);
        setLoadingRide(false);
      });
    return () => { alive = false; };
  }, [orderId, table]);

  // ── 2) Realtime: qualquer UPDATE na linha atualiza o card ao vivo ──────
  useEffect(() => {
    const channel = supabase
      .channel(`accepted-ride-${table}-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table, filter: `id=eq.${orderId}` },
        (payload) => setRideRow(payload.new as any),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId, table]);

  const ride = useMemo(() => extractRide(rideRow, table), [rideRow, table]);
  const status = useMemo(() => resolveRideStatus(ride.driverStatus, ride.paymentStatus), [ride.driverStatus, ride.paymentStatus]);
  const isTerminal = ride.driverStatus === "completed" || ride.driverStatus === "cancelled" || ride.driverStatus === "payment_timeout";

  const etaMinutes = useMemo(() => {
    if (ride.etaMinutes != null && ride.etaMinutes > 0) return ride.etaMinutes;
    if (ride.distanceKm != null && ride.distanceKm > 0) return Math.max(1, Math.round(ride.distanceKm * 3));
    return null;
  }, [ride.etaMinutes, ride.distanceKm]);

  // ── 3) Perfil do profissional: profiles (público) + best-effort
  //      motoboy_profiles/driver_profiles (owner-only hoje — fallback gracioso). ──
  useEffect(() => {
    const professionalId = ride.professionalId;
    if (!professionalId) { setProfessional(null); return; }
    let alive = true;
    setLoadingProfessional(true);
    (async () => {
      try {
        const [profileRes, motoboyRes, driverRes] = await Promise.all([
          supabase.from("profiles").select("name, avatar_url").eq("id", professionalId).maybeSingle(),
          (supabase as any).from("motoboy_profiles").select("*").eq("user_id", professionalId).maybeSingle(),
          (supabase as any).from("driver_profiles").select("*").eq("user_id", professionalId).maybeSingle(),
        ]);
        if (!alive) return;

        const profile = (profileRes as any)?.data ?? null;
        const op: any = (motoboyRes as any)?.data ?? (driverRes as any)?.data ?? null;

        const opName = op?.nome ? `${op.nome} ${op?.sobrenome || ""}`.trim() : null;
        const rating = typeof op?.rating === "number" ? op.rating
          : typeof op?.avaliacao === "number" ? op.avaliacao
          : typeof op?.nota_media === "number" ? op.nota_media
          : null;
        const totalRides = typeof op?.total_corridas === "number" ? op.total_corridas
          : typeof op?.total_rides === "number" ? op.total_rides
          : typeof op?.corridas_realizadas === "number" ? op.corridas_realizadas
          : null;

        setProfessional({
          name: opName || profile?.name || "Profissional",
          avatarUrl: op?.foto || op?.foto_url || profile?.avatar_url || null,
          whatsapp: op?.whatsapp || null,
          rating,
          totalRides,
        });
      } catch (err) {
        console.warn("[AcceptedRideCard] erro ao buscar perfil do profissional:", err);
        if (alive) setProfessional({ name: "Profissional", avatarUrl: null, whatsapp: null, rating: null, totalRides: null });
      } finally {
        if (alive) setLoadingProfessional(false);
      }
    })();
    return () => { alive = false; };
  }, [ride.professionalId]);

  // ── 4) Veículo ativo do profissional (driver_vehicles) ─────────────────
  useEffect(() => {
    const professionalId = ride.professionalId;
    if (!professionalId) { setVehicle(null); return; }
    let alive = true;
    setLoadingVehicle(true);
    (supabase as any)
      .from("driver_vehicles")
      .select("*")
      .eq("driver_id", professionalId)
      .eq("active", true)
      .maybeSingle()
      .then(({ data, error }: any) => {
        if (!alive) return;
        if (error) console.warn("[AcceptedRideCard] erro ao buscar veículo:", error);
        setVehicle((data as ActiveVehicle) ?? null);
        setLoadingVehicle(false);
      });
    return () => { alive = false; };
  }, [ride.professionalId]);

  const photos = useMemo(
    () => [vehicle?.front_photo, vehicle?.rear_photo, vehicle?.side_photo, vehicle?.interior_photo].filter(Boolean) as string[],
    [vehicle],
  );

  // ── Ações ────────────────────────────────────────────────────────────────
  const canContact = Boolean(professional?.whatsapp);

  const handleChat = useCallback(() => {
    if (!professional?.whatsapp) return;
    window.open(toWhatsAppLink(professional.whatsapp, "Olá! Sou o passageiro/cliente da sua corrida na Viagg-TX8."), "_blank");
  }, [professional?.whatsapp]);

  const handleCall = useCallback(() => {
    if (!professional?.whatsapp) return;
    window.location.href = `tel:+55${onlyDigits(professional.whatsapp)}`;
  }, [professional?.whatsapp]);

  const handleShare = useCallback(async () => {
    const shareData = {
      title: "Minha corrida — Viagg-TX8",
      text: `Acompanhe minha corrida na Viagg-TX8${professional?.name ? ` com ${professional.name}` : ""}.`,
      url: window.location.href,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* usuário cancelou o compartilhamento */ }
    } else if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareData.url);
        toast.success("Link copiado!");
      } catch {
        toast.info(shareData.url);
      }
    } else {
      toast.info(shareData.url);
    }
  }, [professional?.name]);

  const handleViewLocation = useCallback(() => {
    toast.info("Acompanhamento por mapa em tempo real chegando em breve.");
  }, []);

  const handleCancel = useCallback(async () => {
    setCancelling(true);
    try {
      if (onCancel) {
        onCancel();
      } else {
        const { error } = await supabase.rpc("cancel_ride" as any, { p_order_id: orderId });
        if (error) throw error;
        toast.success("Corrida cancelada.");
      }
    } catch (err: any) {
      toast.error(`Não foi possível cancelar: ${err?.message || "erro desconhecido"}`);
    } finally {
      setCancelling(false);
      setConfirmingCancel(false);
    }
  }, [onCancel, orderId]);

  const ToneIcon = status.tone === "wait" ? Loader2
    : status.tone === "progress" ? Navigation
    : status.tone === "done" ? CheckCircle2
    : XCircle;

  if (loadingRide) {
    return (
      <Card className={cn("overflow-hidden rounded-2xl", className)}>
        <CardContent className="space-y-4 p-4">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!rideRow) {
    return (
      <Card className={cn("overflow-hidden rounded-2xl border-dashed", className)}>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Corrida não encontrada.
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn("w-full", className)}
    >
      <Card className="overflow-hidden rounded-2xl border-2 border-primary/15 bg-gradient-to-br from-card to-primary/[0.03] shadow-lg shadow-primary/5 dark:to-primary/[0.06]">

        {/* A) Status em tempo real */}
        <div className={cn("flex items-center justify-between gap-2 border-b px-4 py-3 text-sm font-semibold", TONE_STYLES[status.tone])}>
          <div className="flex min-w-0 items-center gap-2">
            <ToneIcon className={cn("h-4 w-4 shrink-0", status.tone === "wait" && "animate-spin")} />
            <AnimatePresence mode="wait">
              <motion.span
                key={status.label}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.2 }}
                className="truncate"
              >
                {status.label}
              </motion.span>
            </AnimatePresence>
          </div>
          {ride.value != null && (
            <span className="shrink-0 rounded-full bg-white/60 px-2.5 py-0.5 text-xs font-bold text-foreground dark:bg-black/20">
              {formatCurrencyBRL(ride.value)}
            </span>
          )}
        </div>

        <CardContent className="space-y-4 p-4">

          {/* B) Card do profissional */}
          <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/40 p-3">
            <Avatar className="h-14 w-14 shrink-0 border-2 border-primary/20 shadow-md">
              <AvatarImage src={professional?.avatarUrl ?? undefined} alt={professional?.name ?? "Profissional"} />
              <AvatarFallback className="bg-gradient-to-br from-zhiq-teal to-zhiq-green text-lg font-bold text-white">
                {(professional?.name || "P").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-foreground">
                {loadingProfessional ? "Carregando…" : (professional?.name || "Profissional")}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-zhiq-gold text-zhiq-gold" />
                  {professional?.rating != null ? professional.rating.toFixed(1) : "Novo profissional"}
                </span>
                <span>
                  {professional?.totalRides != null ? `${professional.totalRides} corridas` : "0 corridas"}
                </span>
                {etaMinutes != null && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> ~{etaMinutes} min
                  </span>
                )}
                {ride.distanceKm != null && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {ride.distanceKm.toFixed(1)} km
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* C + D) Card do veículo + galeria */}
          {loadingVehicle ? (
            <Skeleton className="h-28 w-full rounded-xl" />
          ) : vehicle ? (
            <div className="space-y-3 rounded-xl border border-border/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 font-semibold text-foreground">
                  {vehicle.vehicle_type === "moto" ? <Bike className="h-4 w-4 shrink-0 text-primary" /> : <Car className="h-4 w-4 shrink-0 text-primary" />}
                  <span className="truncate">
                    {vehicle.brand} {vehicle.model}
                    {vehicle.manufacture_year ? ` · ${vehicle.manufacture_year}` : ""}
                  </span>
                </div>
                <Badge variant="outline" className="shrink-0 border-primary/30 font-mono text-primary">
                  {maskPlate(vehicle.plate)}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-3">
                <VehicleFact icon={vehicle.vehicle_type === "moto" ? Bike : Car} label="Categoria" value={vehicle.vehicle_type === "moto" ? "Moto" : "Carro"} />
                <VehicleFact icon={Wind} label="Ar-cond." value={vehicle.air_conditioning ? "Sim" : "Não"} />
                <VehicleFact icon={Users} label="Passageiros" value={String(vehicle.passenger_capacity ?? "—")} />
                <VehicleFact icon={Accessibility} label="Acessível" value={vehicle.accessible ? "Sim" : "Não"} />
                <VehicleFact icon={Star} label="Cor" value={vehicle.color || "—"} />
              </div>

              {vehicle.accessible && !!vehicle.accessibility_features?.length && (
                <div className="flex flex-wrap gap-1.5">
                  {vehicle.accessibility_features.map((f) => (
                    <Badge key={f} variant="secondary" className="font-normal">{f}</Badge>
                  ))}
                </div>
              )}

              {vehicle.observations && (
                <p className="text-xs italic text-muted-foreground">"{vehicle.observations}"</p>
              )}

              {photos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {photos.map((src, i) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setLightboxIndex(i)}
                      className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border/50 transition-transform hover:scale-105"
                    >
                      <img src={src} alt={`Foto do veículo ${i + 1}`} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
              <Camera className="h-4 w-4 shrink-0" />
              Veículo não cadastrado pelo profissional.
            </div>
          )}

          {/* E) Ações */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ActionButton
              icon={MessageCircle}
              label="Conversar"
              onClick={handleChat}
              disabled={!canContact}
              hint={!canContact ? "Contato indisponível no momento" : undefined}
            />
            <ActionButton
              icon={Phone}
              label="Ligar"
              onClick={handleCall}
              disabled={!canContact}
              hint={!canContact ? "Contato indisponível no momento" : undefined}
            />
            <ActionButton icon={Share2} label="Compartilhar" onClick={handleShare} />
            <ActionButton icon={MapPin} label="Localização" onClick={handleViewLocation} />
          </div>

          {!isTerminal && (
            confirmingCancel ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  className="flex-1"
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Confirmar cancelamento
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfirmingCancel(false)}
                  disabled={cancelling}
                >
                  Voltar
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmingCancel(true)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancelar corrida
              </Button>
            )
          )}
        </CardContent>
      </Card>

      {lightboxIndex !== null && photos.length > 0 && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </motion.div>
  );
}

export default AcceptedRideCard;
