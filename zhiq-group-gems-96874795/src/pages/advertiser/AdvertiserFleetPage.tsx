/**
 * AdvertiserFleetPage — "Minha Frota" (V2 do marketplace de fretes).
 * CRUD dos veículos do transportador: categoria, dados, capacidades e tipos
 * de carga aceitos. A placa é PRIVADA (nunca aparece no perfil público —
 * a view freight_fleet_public não a expõe). Escrita via RPC upsert/delete.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFreightFleet, freightQuoteActions, type FleetVehicleRow } from "@/hooks/useFreightQuotes";
import { FLEET_CATEGORIES, FLEET_CARGO_TYPES } from "@/lib/freight/quoteEngine";
import { Loader2, Truck, Plus, Trash2, PencilLine, X, Save } from "lucide-react";

const EMPTY = {
  vehicle_type: "", brand: "", model: "", year: "", plate: "",
  max_weight_kg: "", max_volume_m3: "", length_m: "", height_m: "", width_m: "", axles: "",
  accepted_cargo: [] as string[], is_active: true,
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

export default function AdvertiserFleetPage() {
  const { data, isLoading, invalidate } = useFreightFleet();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [f, setF] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const vehicles = data?.vehicles ?? [];

  const openEditor = (v?: FleetVehicleRow) => {
    if (v) {
      setEditing(v.id);
      setF({
        vehicle_type: v.vehicle_type || "", brand: v.brand || "", model: v.model || "",
        year: v.year ? String(v.year) : "", plate: v.plate || "",
        max_weight_kg: v.max_weight_kg ? String(v.max_weight_kg) : "",
        max_volume_m3: v.max_volume_m3 ? String(v.max_volume_m3) : "",
        length_m: v.length_m ? String(v.length_m) : "", height_m: v.height_m ? String(v.height_m) : "",
        width_m: v.width_m ? String(v.width_m) : "", axles: v.axles ? String(v.axles) : "",
        accepted_cargo: v.accepted_cargo, is_active: v.is_active,
      });
    } else {
      setEditing("new");
      setF(EMPTY);
    }
  };

  const save = async () => {
    if (!f.vehicle_type) { toast.error("Selecione a categoria do veículo."); return; }
    setSaving(true);
    try {
      await freightQuoteActions.upsertVehicle(editing === "new" ? null : editing, f);
      toast.success("Veículo salvo! Ele já conta no matching do ORION. 🚚");
      setEditing(null);
      await invalidate();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Excluir este veículo da frota?")) return;
    try { await freightQuoteActions.deleteVehicle(id); toast.success("Veículo excluído."); await invalidate(); }
    catch (e: any) { toast.error(e.message || "Erro ao excluir."); }
  };

  return (
    <div className="max-w-5xl mx-auto w-full space-y-5 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">🚛 Minha Frota</h1>
          <p className="text-xs font-bold text-[#A7B0BE]">
            Cadastre seus veículos — o ORION usa categoria e capacidade para enviar só oportunidades que você consegue atender.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/anunciante/fretes/rotas" className="px-4 py-2.5 rounded-xl bg-white/5 border border-[#2A3038] text-[10px] font-black uppercase tracking-wider text-[#A7B0BE] hover:text-white">
            Minhas Rotas →
          </Link>
          <button onClick={() => openEditor()} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FF6A00] text-white text-[10px] font-black uppercase tracking-wider hover:bg-[#E65C00]">
            <Plus className="w-3.5 h-3.5" /> Adicionar veículo
          </button>
        </div>
      </div>

      {editing && (
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black text-zinc-800 uppercase tracking-widest">
              {editing === "new" ? "Novo veículo" : "Editar veículo"}
            </h2>
            <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg hover:bg-zinc-100"><X className="w-4 h-4" /></button>
          </div>
          <div>
            <span className="block text-[10px] font-black text-zinc-600 uppercase tracking-wider mb-1.5">Categoria *</span>
            <div className="flex flex-wrap gap-1.5">
              {FLEET_CATEGORIES.map((c) => (
                <button key={c} type="button" onClick={() => setF((s) => ({ ...s, vehicle_type: c }))}
                  className={cn("px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase",
                    f.vehicle_type === c ? "bg-[#FF6A00] border-[#FF6A00] text-white" : "bg-white border-zinc-200 text-zinc-500 hover:border-[#FF6A00]/40")}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <In label="Marca" value={f.brand} onChange={(v) => setF((s) => ({ ...s, brand: v }))} placeholder="Mercedes" />
            <In label="Modelo" value={f.model} onChange={(v) => setF((s) => ({ ...s, model: v }))} placeholder="Accelo 815" />
            <In label="Ano" value={f.year} onChange={(v) => setF((s) => ({ ...s, year: v }))} placeholder="2021" />
            <In label="Placa (privada 🔒)" value={f.plate} onChange={(v) => setF((s) => ({ ...s, plate: v }))} placeholder="ABC1D23" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <In label="Peso máx." value={f.max_weight_kg} onChange={(v) => setF((s) => ({ ...s, max_weight_kg: v }))} suffix="kg" placeholder="3500" />
            <In label="Volume máx." value={f.max_volume_m3} onChange={(v) => setF((s) => ({ ...s, max_volume_m3: v }))} suffix="m³" placeholder="20" />
            <In label="Comprimento" value={f.length_m} onChange={(v) => setF((s) => ({ ...s, length_m: v }))} suffix="m" placeholder="5.5" />
            <In label="Altura" value={f.height_m} onChange={(v) => setF((s) => ({ ...s, height_m: v }))} suffix="m" placeholder="2.4" />
            <In label="Largura" value={f.width_m} onChange={(v) => setF((s) => ({ ...s, width_m: v }))} suffix="m" placeholder="2.2" />
            <In label="Eixos" value={f.axles} onChange={(v) => setF((s) => ({ ...s, axles: v }))} placeholder="2" />
          </div>
          <div>
            <span className="block text-[10px] font-black text-zinc-600 uppercase tracking-wider mb-1.5">Tipos de carga aceitos</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
              {FLEET_CARGO_TYPES.map((c) => (
                <button key={c.key} type="button"
                  onClick={() => setF((s) => ({ ...s, accepted_cargo: s.accepted_cargo.includes(c.key) ? s.accepted_cargo.filter((k) => k !== c.key) : [...s.accepted_cargo, c.key] }))}
                  className={cn("px-3 py-2 rounded-xl border text-left text-[10px] font-bold",
                    f.accepted_cargo.includes(c.key) ? "border-[#FF6A00] bg-[#FF6A00]/5 text-[#FF6A00]" : "border-zinc-200 text-zinc-500")}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={save} disabled={saving}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-[#FF6A00] text-white text-xs font-black uppercase tracking-widest hover:bg-[#E65C00] disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar veículo
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[#A7B0BE]"><Loader2 className="w-6 h-6 animate-spin" /> Carregando frota…</div>
      ) : vehicles.length === 0 && !editing ? (
        <div className="bg-white/5 border border-[#2A3038] rounded-3xl p-10 text-center space-y-2">
          <Truck className="w-12 h-12 text-[#2A3038] mx-auto" />
          <p className="text-sm font-black text-[#A7B0BE] uppercase">Nenhum veículo cadastrado</p>
          <p className="text-xs text-[#6b7581]">Cadastre a frota para o ORION encontrar oportunidades para você.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {vehicles.map((v) => (
            <div key={v.id} className={cn("bg-white rounded-3xl border border-zinc-200 shadow-sm p-5 space-y-2", !v.is_active && "opacity-60")}>
              <div className="flex items-center justify-between gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-black uppercase">{v.vehicle_type || "Veículo"}</span>
                <span className="flex gap-1">
                  <button onClick={() => openEditor(v)} className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500"><PencilLine className="w-4 h-4" /></button>
                  <button onClick={() => remove(v.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"><Trash2 className="w-4 h-4" /></button>
                </span>
              </div>
              <p className="font-black text-zinc-900 text-sm">{[v.brand, v.model, v.year].filter(Boolean).join(" ") || "Sem descrição"}</p>
              <p className="text-[11px] font-bold text-zinc-500">
                {v.max_weight_kg ? `⚖️ ${v.max_weight_kg} kg` : ""}{v.max_volume_m3 ? ` · 📦 ${v.max_volume_m3} m³` : ""}{v.axles ? ` · ${v.axles} eixos` : ""}
              </p>
              {v.plate && <p className="text-[10px] font-bold text-zinc-400">🔒 Placa {v.plate} (visível só para você)</p>}
              {v.accepted_cargo.length > 0 && (
                <p className="text-[10px] text-zinc-400 font-bold">
                  Aceita: {v.accepted_cargo.map((k) => FLEET_CARGO_TYPES.find((c) => c.key === k)?.label || k).join(" · ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
