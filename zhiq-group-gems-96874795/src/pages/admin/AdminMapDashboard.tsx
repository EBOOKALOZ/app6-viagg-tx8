// ── VIAGG-TX8™ — Admin Map Dashboard — Mapa em Tempo Real ────────────────────

import { useState, useEffect, Suspense } from "react";
import { ViaggMap } from "@/components/map/ViaggMap";
import { getRealDriversNearby, generateMapInsights } from "@/lib/map/AIMapService";
import { Loader2, Activity, Car, Bike, Package, Radio, BrainCircuit } from "lucide-react";
import type { LatLng, DriverMarker, AIMapInsight } from "@/lib/map/types";

const DEFAULT_CENTER: LatLng = { lat: -15.7942, lng: -47.8825 }; // Brasília

const TYPE_COLORS: Record<string, string> = {
  mototaxi:  "#FF6A00",
  motoboy:   "#EF4444",
  motorista: "#F59E0B",
  taxi:      "#22C55E",
};

export default function AdminMapDashboard() {
  const [center]  = useState<LatLng>(DEFAULT_CENTER);
  const [drivers, setDrivers] = useState<DriverMarker[]>([]);
  const [insights, setInsights] = useState<AIMapInsight[]>([]);
  const [filter, setFilter]   = useState<string>("todos");
  const [loading, setLoading] = useState<boolean>(true);

  const fetchRealData = async () => {
    try {
      const all = await getRealDriversNearby(center);
      setDrivers(all);
      const ins = await generateMapInsights(all.length, 12, "Brasília");
      setInsights(ins);
    } catch (err) {
      console.error("Erro ao carregar motoristas reais no mapa:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRealData();
    const iv = setInterval(() => {
      fetchRealData();
    }, 15000);
    return () => clearInterval(iv);
  }, [center]);

  const filteredDrivers = filter === "todos" ? drivers : drivers.filter((d) => d.type === filter);

  const counts = {
    mototaxi:  drivers.filter((d) => d.type === "mototaxi").length,
    motorista: drivers.filter((d) => d.type === "motorista").length,
    motoboy:   drivers.filter((d) => d.type === "motoboy").length,
    taxi:      drivers.filter((d) => d.type === "taxi").length,
  };

  return (
    <div className="h-full flex flex-col bg-[#0D0F12]">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-[#0D0F12]">
        <div className="w-8 h-8 rounded-xl bg-[#FF6A00]/20 flex items-center justify-center">
          <Activity className="w-4 h-4 text-[#FF6A00] animate-pulse" />
        </div>
        <div>
          <h1 className="text-sm font-black text-white">Mapa em Tempo Real — VIAGG-TX8™</h1>
          <p className="text-[11px] text-[#A7B0BE]">
            {loading
              ? "Carregando autônomos reais do banco de dados..."
              : `${drivers.length} autônomos reais monitorados no banco de dados · tempo real`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 bg-green-500/15 border border-green-500/30 rounded-full px-3 py-1">
          <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          <span className="text-[11px] text-green-400 font-semibold">LIVE</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="shrink-0 grid grid-cols-4 gap-2 p-3">
        {[
          { key: "mototaxi",  label: "Moto-Táxi",  icon: Bike,    count: counts.mototaxi },
          { key: "motorista", label: "Motoristas", icon: Car,     count: counts.motorista },
          { key: "motoboy",   label: "Motoboys",   icon: Package, count: counts.motoboy },
          { key: "taxi",      label: "Táxis",      icon: Car,     count: counts.taxi },
        ].map((item) => {
          const Icon = item.icon;
          const color = TYPE_COLORS[item.key];
          const active = filter === item.key;
          return (
            <button key={item.key} onClick={() => setFilter(active ? "todos" : item.key)}
              className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all ${
                active ? "border-[#FF6A00]/50 bg-[#FF6A00]/10" : "border-white/10 bg-[#1B1F24] hover:border-white/20"
              }`}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}22` }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <div className="text-left">
                <div className="text-base font-black text-white leading-none">{item.count}</div>
                <div className="text-[10px] text-[#A7B0BE]">{item.label}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Mapa + painel direito */}
      <div className="flex-1 flex gap-0 overflow-hidden">
        {/* Mapa */}
        <div className="flex-1 relative">
          <Suspense fallback={
            <div className="absolute inset-0 bg-[#1a1a2e] flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-[#FF6A00] animate-spin" />
            </div>
          }>
            <ViaggMap
              center={center}
              drivers={filteredDrivers}
              showDrivers
              zoom={13}
              className="absolute inset-0 w-full h-full"
            />
          </Suspense>

          {/* Legenda */}
          <div className="absolute bottom-4 left-4 z-[1001] bg-[#0D0F12]/90 backdrop-blur border border-white/10 rounded-xl p-3 space-y-1.5">
            <p className="text-[10px] font-bold text-[#A7B0BE] uppercase mb-2">Legenda</p>
            {Object.entries(TYPE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                <span className="text-[11px] text-white capitalize">{type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Painel direito — Insights IA */}
        <div className="w-72 shrink-0 bg-[#0D0F12] border-l border-white/10 flex flex-col">
          <div className="p-3 border-b border-white/10 flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold text-white">Insights IA</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {insights.map((ins, i) => (
              <div key={i} className={`p-3 rounded-xl border text-xs ${
                ins.severity === "alert"   ? "bg-red-500/10 border-red-500/20 text-red-300" :
                ins.severity === "warning" ? "bg-amber-500/10 border-amber-500/20 text-amber-300" :
                "bg-blue-500/10 border-blue-500/20 text-blue-300"
              }`}>
                <BrainCircuit className="w-3.5 h-3.5 mb-1.5" />
                <p className="leading-relaxed">{ins.message}</p>
              </div>
            ))}

            {/* Lista de autônomos reais */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-[#A7B0BE] uppercase">
                Autônomos Reais ({filteredDrivers.length})
              </p>
              {loading && (
                <div className="p-3 text-center text-xs text-[#A7B0BE] flex items-center justify-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF6A00]" />
                  Carregando dados...
                </div>
              )}
              {!loading && filteredDrivers.length === 0 && (
                <div className="p-3 bg-[#1B1F24] rounded-xl border border-white/5 text-center text-[11px] text-[#A7B0BE]">
                  Nenhum profissional autônomo encontrado no banco de dados.
                </div>
              )}
              {filteredDrivers.slice(0, 15).map((d) => {
                const color = TYPE_COLORS[d.type] ?? "#6B7280";
                return (
                  <div key={d.id} className="flex flex-col gap-0.5 p-2 bg-[#1B1F24] rounded-xl border border-white/5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-xs text-white font-medium flex-1 truncate">{d.name}</span>
                      <span className="text-[10px] text-[#A7B0BE]">{d.distanceKm.toFixed(1)}km</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[#A7B0BE] pl-4">
                      <span className="truncate">{d.vehicle}</span>
                      <span className="font-mono text-[9px] bg-white/5 px-1.5 py-0.5 rounded text-white/80">{d.plate}</span>
                    </div>
                  </div>
                );
              })}
              {filteredDrivers.length > 15 && (
                <p className="text-[10px] text-[#A7B0BE] text-center">+{filteredDrivers.length - 15} mais…</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
