import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Bike, MapPin, Clock, CheckCircle, XCircle, Loader2,
  Phone, Star, Package, Copy, ArrowLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ViaggAIChat } from "@/components/public/ViaggAIChat";

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────
interface PublicRide {
  id: string;
  tracking_code: string;
  status: string;
  visitor_name: string;
  origin_address: string;
  destination_address: string;
  package_description: string | null;
  estimated_price: number;
  final_price: number | null;
  payment_status: string;
  payment_method: string | null;
  motoboy_id: string | null;
  motoboy_accepted_at: string | null;
  created_at: string;
  collected_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  distance_km: number | null;
  estimated_duration_min: number | null;
}

interface MotoboyInfo {
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  rating: number | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  aguardando_motoboy:   { label: "Aguardando Motoboy",       color: "text-amber-600",  bg: "bg-amber-50",  icon: "⏳" },
  motoboy_aceitou:      { label: "Motoboy Aceitou",          color: "text-blue-600",   bg: "bg-blue-50",   icon: "🛵" },
  aguardando_pagamento: { label: "Aguardando Pagamento",     color: "text-purple-600", bg: "bg-purple-50", icon: "💳" },
  pagamento_confirmado: { label: "Pagamento Confirmado",     color: "text-green-600",  bg: "bg-green-50",  icon: "✅" },
  indo_coletar:         { label: "Indo para Coleta",          color: "text-orange-600", bg: "bg-orange-50", icon: "🏃" },
  coletado:             { label: "Produto Coletado",          color: "text-blue-600",   bg: "bg-blue-50",   icon: "📦" },
  em_entrega:           { label: "Em Entrega",                color: "text-indigo-600", bg: "bg-indigo-50", icon: "🚀" },
  entregue:             { label: "Entregue com Sucesso",      color: "text-green-600",  bg: "bg-green-50",  icon: "🎉" },
  cancelado:            { label: "Corrida Cancelada",         color: "text-red-600",    bg: "bg-red-50",    icon: "❌" },
};

const STATUS_TIMELINE = [
  "aguardando_motoboy",
  "motoboy_aceitou",
  "pagamento_confirmado",
  "indo_coletar",
  "coletado",
  "em_entrega",
  "entregue",
];

// ─────────────────────────────────────────────────────────────────────────────
// PÁGINA
// ─────────────────────────────────────────────────────────────────────────────
export default function PublicRideTracking() {
  const { trackingCode } = useParams<{ trackingCode: string }>();
  const [ride, setRide] = useState<PublicRide | null>(null);
  const [motoboy, setMotoboy] = useState<MotoboyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // ── Carregar corrida ──
  useEffect(() => {
    if (!trackingCode) return;

    const load = async () => {
      const { data, error } = await supabase
        .from("public_rides")
        .select("*")
        .eq("tracking_code", trackingCode.toUpperCase())
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setRide(data as PublicRide);
      setLoading(false);

      // Carregar info do motoboy se atribuído
      if (data.motoboy_id) {
        const { data: profile } = await supabase
          .from("motoboy_profiles")
          .select("full_name, avatar_url, phone, rating")
          .eq("user_id", data.motoboy_id)
          .maybeSingle();
        if (profile) setMotoboy(profile as MotoboyInfo);
      }
    };

    load();
  }, [trackingCode]);

  // ── Realtime: atualizar status ao vivo ──
  useEffect(() => {
    if (!ride?.id) return;

    const channel = supabase
      .channel(`tracking_${ride.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "public_rides", filter: `id=eq.${ride.id}` },
        async (payload) => {
          const updated = payload.new as PublicRide;
          setRide(updated);

          const cfg = STATUS_CONFIG[updated.status];
          if (cfg) toast.info(`${cfg.icon} ${cfg.label}`);

          // Carregar motoboy se acabou de ser atribuído
          if (updated.motoboy_id && !motoboy) {
            const { data: profile } = await supabase
              .from("motoboy_profiles")
              .select("full_name, avatar_url, phone, rating")
              .eq("user_id", updated.motoboy_id)
              .maybeSingle();
            if (profile) setMotoboy(profile as MotoboyInfo);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [ride?.id, motoboy]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#FF6A00] to-institutional-yellow flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    );
  }

  if (notFound || !ride) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#FF6A00] to-institutional-yellow flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full shadow-2xl space-y-4">
          <XCircle className="w-16 h-16 text-red-400 mx-auto" />
          <h2 className="text-xl font-black text-zinc-900">Corrida não encontrada</h2>
          <p className="text-zinc-500 text-sm">
            O código <strong>{trackingCode}</strong> não corresponde a nenhuma corrida.
          </p>
          <Link
            to="/chamar-motoboy"
            className="flex items-center justify-center gap-2 text-[#FF6A00] font-bold text-sm hover:underline"
          >
            <ArrowLeft className="w-4 h-4" /> Solicitar motoboy
          </Link>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[ride.status] ?? STATUS_CONFIG.aguardando_motoboy;
  const currentStepIdx = STATUS_TIMELINE.indexOf(ride.status);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FF6A00] via-[#FF8C00] to-institutional-yellow">
      {/* Header */}
      <header className="pt-8 pb-4 px-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Bike className="w-6 h-6 text-white" />
          <h1 className="text-xl font-black text-white">Rastrear Entrega</h1>
        </div>
        <p className="text-orange-100 text-sm">VIAGG-TX8™</p>
      </header>

      <div className="px-4 pb-24 max-w-md mx-auto space-y-4">

        {/* Status atual */}
        <div className={`${statusCfg.bg} rounded-3xl shadow-xl p-6 text-center`}>
          <div className="text-5xl mb-3">{statusCfg.icon}</div>
          <h2 className={`text-xl font-black ${statusCfg.color}`}>{statusCfg.label}</h2>
          <p className="text-zinc-500 text-xs mt-1">
            Código: <strong className="tracking-widest text-zinc-700">{ride.tracking_code}</strong>
            <button
              onClick={() => {
                navigator.clipboard.writeText(ride.tracking_code);
                toast.success("Código copiado!");
              }}
              className="ml-2 text-zinc-400 hover:text-zinc-600"
            >
              <Copy className="w-3 h-3 inline" />
            </button>
          </p>
        </div>

        {/* Info do motoboy */}
        {motoboy && (
          <div className="bg-white rounded-3xl shadow-xl p-5">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide mb-3">Seu Motoboy</p>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center overflow-hidden shrink-0">
                {motoboy.avatar_url ? (
                  <img src={motoboy.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Bike className="w-8 h-8 text-[#FF6A00]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-zinc-900 text-base truncate">
                  {motoboy.full_name ?? "Motoboy VIAGG"}
                </p>
                {motoboy.rating && (
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    <span className="text-xs font-bold text-zinc-600">{motoboy.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>
              {motoboy.phone && (
                <a
                  href={`tel:${motoboy.phone}`}
                  className="w-10 h-10 rounded-2xl bg-green-100 flex items-center justify-center shrink-0"
                >
                  <Phone className="w-5 h-5 text-green-600" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Rota */}
        <div className="bg-white rounded-3xl shadow-xl p-5 space-y-3">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Rota</p>
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-green-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-green-600 uppercase">Coleta</p>
              <p className="text-sm text-zinc-900">{ride.origin_address}</p>
            </div>
          </div>
          <div className="ml-3.5 w-0.5 h-3 bg-zinc-200" />
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-red-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-red-600 uppercase">Entrega</p>
              <p className="text-sm text-zinc-900">{ride.destination_address}</p>
            </div>
          </div>
          {ride.package_description && (
            <div className="flex items-start gap-2 pt-1 border-t border-zinc-100">
              <Package className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
              <p className="text-xs text-zinc-500">{ride.package_description}</p>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-3xl shadow-xl p-5">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide mb-4">Progresso</p>
          <div className="space-y-3">
            {STATUS_TIMELINE.filter((s) => s !== "cancelado").map((s, i) => {
              const cfg = STATUS_CONFIG[s];
              const done = i < currentStepIdx || ride.status === "entregue";
              const active = ride.status === s;
              const pending = i > currentStepIdx;
              return (
                <div key={s} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    done ? "bg-green-100" : active ? "bg-orange-100" : "bg-zinc-100"
                  }`}>
                    {done ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <span className={`text-sm ${active ? "animate-pulse" : ""}`}>{cfg.icon}</span>
                    )}
                  </div>
                  <p className={`text-sm font-medium ${
                    done ? "text-green-600 line-through opacity-70"
                    : active ? "text-orange-600 font-black"
                    : "text-zinc-400"
                  }`}>
                    {cfg.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detalhes financeiros */}
        <div className="bg-white rounded-3xl shadow-xl p-5 space-y-2">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Pagamento</p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-600">Valor</span>
            <span className="font-black text-zinc-900">
              R$ {(ride.final_price ?? ride.estimated_price ?? 0).toFixed(2).replace(".", ",")}
            </span>
          </div>
          {ride.payment_method && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600">Forma</span>
              <span className="text-sm font-medium text-zinc-700 capitalize">
                {ride.payment_method === "pix" ? "PIX" : ride.payment_method === "credit_card" ? "Cartão" : ride.payment_method}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-600">Status</span>
            <span className={`text-sm font-bold ${
              ride.payment_status === "paid" ? "text-green-600" : "text-amber-600"
            }`}>
              {ride.payment_status === "paid" ? "✅ Pago" : "⏳ Pendente"}
            </span>
          </div>
          {ride.estimated_duration_min && ride.estimated_duration_min > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600">Tempo estimado</span>
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-700">{ride.estimated_duration_min} min</span>
              </div>
            </div>
          )}
        </div>

        {/* Cancelamento */}
        {ride.status === "cancelado" && (
          <div className="bg-red-50 rounded-3xl p-5 border border-red-100 space-y-2">
            <p className="font-black text-red-700">Corrida Cancelada</p>
            {ride.cancelled_reason && (
              <p className="text-sm text-red-600">{ride.cancelled_reason}</p>
            )}
            <Link
              to="/chamar-motoboy"
              className="flex items-center gap-2 text-[#FF6A00] font-bold text-sm hover:underline"
            >
              <Bike className="w-4 h-4" /> Solicitar nova corrida
            </Link>
          </div>
        )}
      </div>

      <ViaggAIChat
        context="Assistente de rastreamento. O cliente está acompanhando uma entrega pela VIAGG. Ajude com dúvidas sobre status, prazo, contato com o motoboy e procedimentos."
        welcomeMessage="Olá! 📦 Precisa de ajuda com o acompanhamento da sua entrega?"
      />
    </div>
  );
}
