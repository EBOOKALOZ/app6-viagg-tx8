/**
 * AdvertiserRoutesPage — "Minhas Rotas" (V2 do marketplace de fretes).
 * Rotas por veículo: origem/destino, distância, preço sugerido, dias,
 * frequência, disponibilidade e capacidade restante. Estrutura pronta p/
 * mapa interativo (colunas lat/lng/waypoints/radius_km já existem no banco).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFreightFleet, freightQuoteActions, type FreightRouteRow } from "@/hooks/useFreightQuotes";
import { WEEK_DAYS, brlLabel } from "@/lib/freight/quoteEngine";
import { Loader2, Route as RouteIcon, Plus, Trash2, PencilLine, X, Save, MapPin } from "lucide-react";

const EMPTY = {
  vehicle_id: "", origin_city: "", origin_state: "", dest_city: "", dest_state: "",
  distance_km: "", suggested_price_brl: "", radius_km: "", times: "", frequency: "",
  availability_mode: "sempre", days_available: [] as string[],
  capacity_kg_left: "", capacity_m3_left: "", is_active: true,
};

function In({ label, value, onChange, placeholder, suffix }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; suffix?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-[10px] font-black text-zinc-600 uppercase tracking-wider mb-1">{label}</span>
      <span className="relative block">
        <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
          className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-xs text-zinc-800 outline-none focus:border-[#FF6A00]/60 bg-white" />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-zinc-400">{suffix}</span>}
      </span>
    </label>
  );
}

export default function AdvertiserRoutesPage() {
  const { data, isLoading, invalidate } = useFreightFleet();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [f, setF] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const routes = data?.routes ?? [];
  const vehicles = data?.vehicles ?? [];

  const openEditor = (r?: FreightRouteRow) => {
    if (r) {
      setEditing(r.id);
      setF({
        vehicle_id: r.vehicle_id || "", origin_city: r.origin_city || "", origin_state: r.origin_state || "",
        dest_city: r.dest_city || "", dest_state: r.dest_state || "",
        distance_km: r.distance_km ? String(r.distance_km) : "",
        suggested_price_brl: r.suggested_price_brl ? String(r.suggested_price_brl) : "",
        radius_km: r.radius_km ? String(r.radius_km) : "", times: r.times || "", frequency: r.frequency || "",
        availability_mode: r.availability_mode || "sempre", days_available: r.days_available,
        capacity_kg_left: r.capacity_kg_left ? String(r.capacity_kg_left) : "",
        capacity_m3_left: r.capacity_m3_left ? String(r.capacity_m3_left) : "", is_active: r.is_active,
      });
    } else {
      setEditing("new");
      setF(EMPTY);
    }
  };

  const save = async () => {
    if (!f.origin_city || !f.dest_city) { toast.error("Informe as cidades de origem e destino."); return; }
    setSaving(true);
    try {
      await freightQuoteActions.upsertRoute(editing === "new" ? null : editing, {
        ...f, vehicle_id: f.vehicle_id || null,
      });
      toast.success("Rota salva! O ORION já considera esta rota no matching. 🗺️");
      setEditing(null);
      await invalidate();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Excluir esta rota?")) return;
    try { await freightQuoteActions.deleteRoute(id); toast.success("Rota excluída."); await invalidate(); }
    catch (e: any) { toast.error(e.message || "Erro ao excluir."); }
  };

  return (
    <div className="max-w-5xl mx-auto w-full space-y-5 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">🗺️ Minhas Rotas</h1>
          <p className="text-xs font-bold text-[#A7B0BE]">
            Cadastre rotas fixas com preço sugerido — o ORION cruza com as solicitações e envia só o que bate com o seu caminho.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/anunciante/fretes/frota" className="px-4 py-2.5 rounded-xl bg-white/5 border border-[#2A3038] text-[10px] font-black uppercase tracking-wider text-[#A7B0BE] hover:text-white">
            ← Minha Frota
          </Link>
          <button onClick={() => openEditor()} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FF6A00] text-white text-[10px] font-black uppercase tracking-wider hover:bg-[#E65C00]">
            <Plus className="w-3.5 h-3.5" /> Nova rota
          </button>
        </div>
      </div>

      {editing && (
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black text-zinc-800 uppercase tracking-widest">{editing === "new" ? "Nova rota" : "Editar rota"}</h2>
            <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg hover:bg-zinc-100"><X className="w-4 h-4" /></button>
          </div>

          {vehicles.length > 0 && (
            <div>
              <span className="block text-[10px] font-black text-zinc-600 uppercase tracking-wider mb-1.5">Veículo desta rota</span>
              <div className="flex flex-wrap gap-1.5">
                {vehicles.map((v) => (
                  <button key={v.id} type="button" onClick={() => setF((s) => ({ ...s, vehicle_id: s.vehicle_id === v.id ? "" : v.id }))}
                    className={cn("px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase",
                      f.vehicle_id === v.id ? "bg-[#FF6A00] border-[#FF6A00] text-white" : "bg-white border-zinc-200 text-zinc-500")}>
                    {v.vehicle_type || "Veículo"} {v.model ? `· ${v.model}` : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <In label="Cidade origem *" value={f.origin_city} onChange={(v) => setF((s) => ({ ...s, origin_city: v }))} placeholder="Blumenau" />
            <In label="UF origem" value={f.origin_state} onChange={(v) => setF((s) => ({ ...s, origin_state: v }))} placeholder="SC" />
            <In label="Cidade destino *" value={f.dest_city} onChange={(v) => setF((s) => ({ ...s, dest_city: v }))} placeholder="Curitiba" />
            <In label="UF destino" value={f.dest_state} onChange={(v) => setF((s) => ({ ...s, dest_state: v }))} placeholder="PR" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <In label="Distância" value={f.distance_km} onChange={(v) => setF((s) => ({ ...s, distance_km: v }))} suffix="km" placeholder="180" />
            <In label="Preço sugerido" value={f.suggested_price_brl} onChange={(v) => setF((s) => ({ ...s, suggested_price_brl: v }))} suffix="R$" placeholder="450" />
            <In label="Raio de atendimento" value={f.radius_km} onChange={(v) => setF((s) => ({ ...s, radius_km: v }))} suffix="km" placeholder="50" />
            <In label="Horários" value={f.times} onChange={(v) => setF((s) => ({ ...s, times: v }))} placeholder="Saída 06:00" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="block text-[10px] font-black text-zinc-600 uppercase tracking-wider mb-1.5">Disponibilidade</span>
              <div className="flex bg-zinc-100 rounded-xl p-0.5">
                {[{ v: "sempre", l: "Sempre" }, { v: "dias", l: "Dias fixos" }, { v: "datas", l: "Datas" }].map((o) => (
                  <button key={o.v} type="button" onClick={() => setF((s) => ({ ...s, availability_mode: o.v }))}
                    className={cn("flex-1 px-2 py-2 rounded-lg text-[10px] font-black uppercase",
                      f.availability_mode === o.v ? "bg-white shadow text-[#FF6A00]" : "text-zinc-500")}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
            <In label="Frequência" value={f.frequency} onChange={(v) => setF((s) => ({ ...s, frequency: v }))} placeholder="Semanal / Quinzenal / Sob demanda" />
          </div>

          {f.availability_mode !== "sempre" && (
            <div>
              <span className="block text-[10px] font-black text-zinc-600 uppercase tracking-wider mb-1.5">Dias disponíveis</span>
              <div className="flex flex-wrap gap-1.5">
                {WEEK_DAYS.map((d) => (
                  <button key={d.key} type="button"
                    onClick={() => setF((s) => ({ ...s, days_available: s.days_available.includes(d.key) ? s.days_available.filter((k) => k !== d.key) : [...s.days_available, d.key] }))}
                    className={cn("px-3.5 py-2 rounded-xl border text-[10px] font-black uppercase",
                      f.days_available.includes(d.key) ? "bg-[#FF6A00] border-[#FF6A00] text-white" : "bg-white border-zinc-200 text-zinc-500")}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <In label="Peso restante disponível" value={f.capacity_kg_left} onChange={(v) => setF((s) => ({ ...s, capacity_kg_left: v }))} suffix="kg" placeholder="1200" />
            <In label="Volume restante" value={f.capacity_m3_left} onChange={(v) => setF((s) => ({ ...s, capacity_m3_left: v }))} suffix="m³" placeholder="8" />
          </div>

          <p className="text-[10px] text-zinc-400">
            🗺️ Mapa interativo (desenhar percurso, cidades intermediárias): estrutura pronta no banco — chegará numa próxima etapa sem retrabalho.
          </p>

          <button onClick={save} disabled={saving}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-[#FF6A00] text-white text-xs font-black uppercase tracking-widest hover:bg-[#E65C00] disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar rota
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[#A7B0BE]"><Loader2 className="w-6 h-6 animate-spin" /> Carregando rotas…</div>
      ) : routes.length === 0 && !editing ? (
        <div className="bg-white/5 border border-[#2A3038] rounded-3xl p-10 text-center space-y-2">
          <RouteIcon className="w-12 h-12 text-[#2A3038] mx-auto" />
          <p className="text-sm font-black text-[#A7B0BE] uppercase">Nenhuma rota cadastrada</p>
          <p className="text-xs text-[#6b7581]">Ex.: Blumenau → Curitiba · seg/qua/sex · R$ 450 sugeridos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {routes.map((r) => {
            const veh = vehicles.find((v) => v.id === r.vehicle_id);
            return (
              <div key={r.id} className={cn("bg-white rounded-3xl border border-zinc-200 shadow-sm p-5 space-y-2", !r.is_active && "opacity-60")}>
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 font-black text-zinc-900 text-sm min-w-0">
                    <MapPin className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="truncate">{r.origin_city}/{r.origin_state || "?"} → {r.dest_city}/{r.dest_state || "?"}</span>
                  </p>
                  <span className="flex gap-1 shrink-0">
                    <button onClick={() => openEditor(r)} className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500"><PencilLine className="w-4 h-4" /></button>
                    <button onClick={() => remove(r.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </span>
                </div>
                <p className="text-[11px] font-bold text-zinc-500">
                  {r.distance_km ? `${r.distance_km} km · ` : ""}💰 sugerido {brlLabel(r.suggested_price_brl)}
                  {veh ? ` · ${veh.vehicle_type}` : ""}
                </p>
                <p className="text-[10px] font-bold text-zinc-400">
                  {r.availability_mode === "sempre" ? "Sempre disponível" :
                    r.days_available.map((k) => WEEK_DAYS.find((d) => d.key === k)?.label || k).join(" · ") || "Dias a definir"}
                  {r.frequency ? ` · ${r.frequency}` : ""}{r.times ? ` · ${r.times}` : ""}
                </p>
                {(r.capacity_kg_left || r.capacity_m3_left) && (
                  <p className="text-[10px] font-bold text-emerald-600">
                    Espaço restante: {r.capacity_kg_left ? `${r.capacity_kg_left} kg` : ""}{r.capacity_m3_left ? ` · ${r.capacity_m3_left} m³` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
