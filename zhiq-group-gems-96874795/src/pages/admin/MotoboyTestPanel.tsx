import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Play, RefreshCw, Terminal, CheckCircle2, Circle, Loader2,
  Bike, MapPin, Package, Clock, CreditCard, XCircle, AlertTriangle,
  ChevronRight, Trash2, Copy, Wifi,
} from "lucide-react";

// ─── Constantes ────────────────────────────────────────────────────────────────
const TEST_RIDE_DEFAULTS = {
  visitor_name: "Visitante Teste",
  visitor_phone: "66992323101",
  origin_address: "Rua das Palmeiras, 123 — Vilhena/RO",
  origin_lat: -10.57919,
  origin_lng: -59.38176,
  destination_address: "Av. Brasil, 456 — Vilhena/RO",
  destination_lat: -10.57818,
  destination_lng: -59.38378,
  package_description: "Caixa 3 kg",
  distance_km: 0.25,
  estimated_duration_min: 5,
  estimated_price: 8.00,
  payment_method: "pix",
};

const FLOW_STEPS: { status: string; label: string; icon: string; color: string }[] = [
  { status: "aguardando_motoboy",   label: "Aguardando Motoboy",    icon: "⏳", color: "bg-zinc-100 text-zinc-600" },
  { status: "motoboy_aceitou",      label: "Motoboy Aceitou",       icon: "🛵", color: "bg-blue-100 text-blue-700" },
  { status: "aguardando_pagamento", label: "Aguardando Pagamento",  icon: "💳", color: "bg-amber-100 text-amber-700" },
  { status: "pagamento_confirmado", label: "Pagamento Confirmado",  icon: "✅", color: "bg-emerald-100 text-emerald-700" },
  { status: "indo_coletar",         label: "Indo para Coleta",      icon: "📍", color: "bg-orange-100 text-orange-700" },
  { status: "coletado",             label: "Produto Coletado",      icon: "📦", color: "bg-purple-100 text-purple-700" },
  { status: "em_entrega",           label: "Em Entrega",            icon: "🚀", color: "bg-sky-100 text-sky-700" },
  { status: "entregue",             label: "Entregue ✓",            icon: "🎉", color: "bg-green-100 text-green-700" },
];

const STATUS_ORDER = FLOW_STEPS.map(s => s.status);

interface LogEntry { ts: string; type: "info" | "success" | "error" | "event"; msg: string }
interface Ride { id: string; tracking_code: string; status: string; [k: string]: any }

function ts() { return new Date().toLocaleTimeString("pt-BR", { hour12: false }) }

// ─── Componente ────────────────────────────────────────────────────────────────
export default function MotoboyTestPanel() {
  const { user } = useAuth();
  const [ride, setRide] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const log = (msg: string, type: LogEntry["type"] = "info") => {
    setLogs(prev => [...prev.slice(-199), { ts: ts(), type, msg }]);
  };

  // Auto-scroll log
  useEffect(() => {
    if (devMode) logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, devMode]);

  // Realtime: escuta mudanças na corrida de teste
  useEffect(() => {
    if (!ride?.id) return;
    const ch = supabase
      .channel(`test_panel_ride_${ride.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "public_rides", filter: `id=eq.${ride.id}` },
        (payload) => {
          const updated = payload.new as Ride;
          setRide(prev => prev ? { ...prev, ...updated } : prev);
          log(`[REALTIME] Status → ${updated.status}`, "event");
          toast.info(`Status atualizado: ${updated.status}`);
        })
      .subscribe((status) => log(`[REALTIME] Canal: ${status}`, "info"));

    return () => { supabase.removeChannel(ch); };
  }, [ride?.id]);

  // ── Criar corrida de teste ──
  const createRide = async () => {
    setLoading(true);
    log("Criando corrida de teste...", "info");
    try {
      const { data, error } = await supabase
        .from("public_rides")
        .insert({
          ...TEST_RIDE_DEFAULTS,
          expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2h para teste
        })
        .select("*")
        .single();

      if (error) throw error;
      setRide(data as Ride);
      setLogs([]);
      log(`✅ Corrida criada! ID: ${data.id}`, "success");
      log(`   Tracking: #${data.tracking_code}`, "info");
      toast.success(`Corrida de teste criada: #${data.tracking_code}`);
    } catch (err: any) {
      log(`❌ Erro: ${err.message}`, "error");
      toast.error(`Erro: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Avançar status ──
  const advanceTo = async (status: string, extra?: Record<string, any>) => {
    if (!ride) return;
    setAdvancing(true);
    log(`→ Avançando para: ${status}`, "info");
    try {
      const patch: Record<string, any> = { status, updated_at: new Date().toISOString(), ...extra };

      if (status === "motoboy_aceitou") {
        patch.motoboy_id = user?.id ?? null;
        patch.motoboy_accepted_at = new Date().toISOString();
      }
      if (status === "pagamento_confirmado") {
        patch.payment_status = "paid";
        patch.paid_at = new Date().toISOString();
      }
      if (status === "coletado") patch.collected_at = new Date().toISOString();
      if (status === "entregue")  patch.delivered_at = new Date().toISOString();
      if (status === "cancelado") {
        patch.cancelled_at = new Date().toISOString();
        patch.cancelled_reason = "Cancelado via painel de testes";
      }

      const { error } = await supabase.from("public_rides").update(patch).eq("id", ride.id);
      if (error) throw error;
      setRide(prev => prev ? { ...prev, ...patch } : prev);
      log(`✅ Status atualizado: ${status}`, "success");
    } catch (err: any) {
      log(`❌ Erro: ${err.message}`, "error");
      toast.error(err.message);
    } finally {
      setAdvancing(false);
    }
  };

  const deleteRide = async () => {
    if (!ride) return;
    if (!window.confirm("Deletar corrida de teste?")) return;
    await supabase.from("public_rides").delete().eq("id", ride.id);
    setRide(null);
    setLogs([]);
    log("Corrida deletada.", "info");
    toast.info("Corrida de teste removida.");
  };

  const currentIdx = ride ? STATUS_ORDER.indexOf(ride.status) : -1;

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-mono p-4 md:p-6 space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#FF6A00] flex items-center justify-center">
            <Bike className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-black text-white tracking-tight">Motoboy — Painel de Testes</h1>
            <p className="text-[10px] text-zinc-400">Sandbox · Supabase Realtime ativo</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDevMode(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${devMode ? "bg-[#FF6A00] border-[#FF6A00] text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}
          >
            <Terminal className="w-3.5 h-3.5" />
            {devMode ? "Dev ON" : "🛠️ Modo Dev"}
          </button>
          {ride && (
            <button onClick={deleteRide} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-red-800 text-red-400 hover:bg-red-950 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Deletar
            </button>
          )}
        </div>
      </div>

      {/* ── Criar corrida ── */}
      {!ride ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 p-8 flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center justify-center">
            <Play className="w-7 h-7 text-[#FF6A00]" />
          </div>
          <p className="text-zinc-400 text-sm text-center">Nenhuma corrida de teste ativa.<br />Crie uma para começar a simulação.</p>
          <button
            onClick={createRide}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-[#FF6A00] hover:bg-[#e55a00] text-white font-black rounded-xl text-sm transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Criar Corrida de Teste
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ── Coluna 1: Info da corrida ── */}
          <div className="space-y-3">
            <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Corrida</span>
                <button onClick={() => navigator.clipboard.writeText(ride.id)}
                  className="text-zinc-600 hover:text-zinc-300 transition-colors">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-lg font-black text-[#FF6A00]">#{ride.tracking_code}</p>

              <div className="space-y-1.5 text-xs">
                <InfoRow icon={<Circle className="w-3 h-3" />} label="Status" value={ride.status} highlight />
                <InfoRow icon={<MapPin className="w-3 h-3 text-green-500" />} label="Coleta"
                  value={`${ride.origin_lat?.toFixed(5)}, ${ride.origin_lng?.toFixed(5)}`} />
                <InfoRow icon={<MapPin className="w-3 h-3 text-red-500" />} label="Entrega"
                  value={`${ride.destination_lat?.toFixed(5)}, ${ride.destination_lng?.toFixed(5)}`} />
                <InfoRow icon={<Bike className="w-3 h-3" />} label="Distância" value={`${ride.distance_km} km`} />
                <InfoRow icon={<Clock className="w-3 h-3" />} label="Tempo est." value={`${ride.estimated_duration_min} min`} />
                <InfoRow icon={<Package className="w-3 h-3" />} label="Pacote" value={ride.package_description} />
                <InfoRow icon={<CreditCard className="w-3 h-3" />} label="Valor" value={`R$ ${Number(ride.estimated_price).toFixed(2)}`} highlight />
              </div>

              <div className="pt-2 border-t border-zinc-800 flex gap-2">
                <a href={`/corrida/${ride.tracking_code}`} target="_blank"
                  className="flex-1 text-center text-[10px] py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">
                  👤 Visão Cliente
                </a>
                <a href="/motoboy" target="_blank"
                  className="flex-1 text-center text-[10px] py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">
                  🛵 Visão Motoboy
                </a>
              </div>
            </div>

            {/* ── Ações especiais ── */}
            <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4 space-y-2">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3">Eventos Especiais</p>
              <ActionBtn label="❌ Cliente Cancelou" color="red"
                onClick={() => advanceTo("cancelado", { cancelled_reason: "Cancelado pelo cliente" })} disabled={advancing} />
              <ActionBtn label="🏪 Loja Cancelou" color="red"
                onClick={() => advanceTo("cancelado", { cancelled_reason: "Cancelado pela loja" })} disabled={advancing} />
              <ActionBtn label="💳 Pagamento Recusado" color="amber"
                onClick={async () => {
                  await supabase.from("public_rides").update({ payment_status: "failed" }).eq("id", ride.id);
                  log("Pagamento recusado simulado", "error");
                  toast.error("Pagamento recusado (simulado)");
                }} disabled={advancing} />
              <ActionBtn label="🔄 Resetar para Aguardando" color="zinc"
                onClick={() => advanceTo("aguardando_motoboy")} disabled={advancing} />
              <ActionBtn label="🗑️ Nova Corrida" color="zinc"
                onClick={async () => { await deleteRide(); }} disabled={advancing} />
            </div>
          </div>

          {/* ── Coluna 2: Fluxo de status ── */}
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-4">Fluxo da Corrida</p>
            <div className="space-y-1.5">
              {FLOW_STEPS.map((step, idx) => {
                const isDone    = currentIdx > idx;
                const isCurrent = currentIdx === idx;
                const isNext    = currentIdx + 1 === idx;
                return (
                  <div key={step.status} className="flex items-center gap-3">
                    {/* Ícone de estado */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-sm border transition-all ${
                      isDone    ? "bg-green-600 border-green-500 text-white" :
                      isCurrent ? "bg-[#FF6A00] border-orange-400 text-white animate-pulse" :
                                  "bg-zinc-800 border-zinc-700 text-zinc-500"
                    }`}>
                      {isDone ? "✓" : step.icon}
                    </div>

                    {/* Label */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold truncate ${
                        isCurrent ? "text-[#FF6A00]" : isDone ? "text-green-400" : "text-zinc-500"
                      }`}>
                        {step.label}
                      </p>
                      {isCurrent && (
                        <span className="text-[9px] text-zinc-500 flex items-center gap-1">
                          <Wifi className="w-2.5 h-2.5" /> Status atual
                        </span>
                      )}
                    </div>

                    {/* Botão avançar */}
                    {isNext && ride.status !== "cancelado" && (
                      <button
                        onClick={() => advanceTo(step.status)}
                        disabled={advancing}
                        className="flex items-center gap-1 px-3 py-1 bg-[#FF6A00] hover:bg-[#e55a00] text-white text-[10px] font-black rounded-lg transition-colors disabled:opacity-50 shrink-0"
                      >
                        {advancing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}
                        Avançar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {ride.status === "cancelado" && (
              <div className="mt-4 p-3 bg-red-950 border border-red-800 rounded-xl text-xs text-red-400 text-center">
                <XCircle className="w-5 h-5 mx-auto mb-1" />
                Corrida cancelada<br />
                <span className="text-[10px] text-red-500">{ride.cancelled_reason ?? ""}</span>
              </div>
            )}

            {ride.status === "entregue" && (
              <div className="mt-4 p-3 bg-green-950 border border-green-800 rounded-xl text-xs text-green-400 text-center">
                <CheckCircle2 className="w-5 h-5 mx-auto mb-1" />
                Corrida finalizada com sucesso! 🎉
              </div>
            )}
          </div>

          {/* ── Coluna 3: Log / Dev ── */}
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Log de Eventos</p>
              <button onClick={() => setLogs([])} className="text-zinc-600 hover:text-zinc-400 text-[10px]">
                limpar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-0.5 max-h-[420px] pr-1">
              {logs.length === 0 && (
                <p className="text-zinc-600 text-xs text-center py-8">Nenhum evento ainda.</p>
              )}
              {logs.map((entry, i) => (
                <div key={i} className={`flex gap-2 text-[10px] font-mono leading-relaxed ${
                  entry.type === "success" ? "text-green-400" :
                  entry.type === "error"   ? "text-red-400"   :
                  entry.type === "event"   ? "text-[#FF6A00]" :
                                             "text-zinc-400"
                }`}>
                  <span className="text-zinc-600 shrink-0">{entry.ts}</span>
                  <span>{entry.msg}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>

            {/* Dev mode: info extra */}
            {devMode && ride && (
              <div className="mt-3 pt-3 border-t border-zinc-800 space-y-1 text-[10px] text-zinc-500">
                <p className="text-zinc-400 font-bold uppercase tracking-widest mb-1">Debug</p>
                <p>ride.id: <span className="text-zinc-300 break-all">{ride.id}</span></p>
                <p>motoboy_id: <span className="text-zinc-300">{ride.motoboy_id ?? "null"}</span></p>
                <p>payment_status: <span className="text-zinc-300">{ride.payment_status ?? "pending"}</span></p>
                <p>expires_at: <span className="text-zinc-300">{ride.expires_at ? new Date(ride.expires_at).toLocaleString("pt-BR") : "—"}</span></p>
                <p>updated_at: <span className="text-zinc-300">{ride.updated_at ? new Date(ride.updated_at).toLocaleString("pt-BR") : "—"}</span></p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers visuais ──────────────────────────────────────────────────────────
function InfoRow({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: any; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-600 shrink-0">{icon}</span>
      <span className="text-zinc-500 shrink-0 w-16">{label}</span>
      <span className={`truncate font-bold ${highlight ? "text-[#FF6A00]" : "text-zinc-300"}`}>{value ?? "—"}</span>
    </div>
  );
}

function ActionBtn({ label, color, onClick, disabled }: { label: string; color: "red" | "amber" | "zinc"; onClick: () => void; disabled?: boolean }) {
  const cls = {
    red:   "border-red-800 text-red-400 hover:bg-red-950",
    amber: "border-amber-800 text-amber-400 hover:bg-amber-950",
    zinc:  "border-zinc-700 text-zinc-400 hover:bg-zinc-800",
  }[color];
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-full text-left px-3 py-2 rounded-lg border text-[11px] font-bold transition-colors disabled:opacity-40 ${cls}`}>
      {label}
    </button>
  );
}
