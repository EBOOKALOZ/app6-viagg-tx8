/**
 * 🚀 GrowthEngineMonitor — Admin Panel
 *
 * Premium admin dashboard for the Local Marketplace Growth Engine.
 * Shows city heat map, zone dominance, viral alerts, and agent activity.
 */
import { useState } from "react";
import {
  TrendingUp, MapPin, Zap, Users, BarChart3,
  Activity, RefreshCw, Radio, Target, Flame,
  Shield, Globe, ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGrowthMetrics } from "@/hooks/useGrowthMetrics";
import type { GrowthOverviewRow, GrowthStage, AgentSignal } from "@/skills/growth/growthAgentTypes";
import { runCityExpansionAgent } from "@/skills/growth/cityExpansion/cityExpansionAgent";
import { runDemandIntelligenceAgent } from "@/skills/growth/demandIntelligence/demandIntelligenceAgent";
import { runViralDistributionAgent } from "@/skills/growth/viralDistribution/viralDistributionAgent";
import { runTerritoryDominanceAgent } from "@/skills/growth/territoryDominance/territoryDominanceAgent";
import { toast } from "sonner";

// ─── Stage colors ───────────────────────
const STAGE_CONFIG: Record<GrowthStage, { color: string; bg: string; icon: typeof Flame; label: string }> = {
  cold: { color: "text-gray-400", bg: "bg-gray-500/10", icon: Globe, label: "Fria" },
  warming: { color: "text-amber-400", bg: "bg-amber-500/10", icon: TrendingUp, label: "Aquecendo" },
  growing: { color: "text-orange-400", bg: "bg-orange-500/10", icon: ArrowUpRight, label: "Crescendo" },
  hot: { color: "text-red-400", bg: "bg-red-500/10", icon: Flame, label: "Quente" },
  dominant: { color: "text-emerald-400", bg: "bg-emerald-500/10", icon: Shield, label: "Dominante" },
};

// ─── Signal Badge ───────────────────────
function SignalBadge({ signal }: { signal: AgentSignal }) {
  const actionColors: Record<string, string> = {
    CITY_HEATING: "bg-amber-500/20 text-amber-300",
    EXPANSION_TRIGGERED: "bg-orange-500/20 text-orange-300",
    VIRAL_DETECTED: "bg-red-500/20 text-red-300",
    DEMAND_SHIFT: "bg-blue-500/20 text-blue-300",
    AMPLIFY_COMPLETE: "bg-green-500/20 text-green-300",
    POSTER_REALLOC: "bg-purple-500/20 text-purple-300",
    ZONE_DOMINANT: "bg-emerald-500/20 text-emerald-300",
    ZONE_EXPANSION: "bg-cyan-500/20 text-cyan-300",
  };

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
      <Radio className="h-3 w-3 text-blue-400 animate-pulse flex-shrink-0" />
      <span className="text-[10px] text-gray-400 font-mono">{signal.source.replace("Agent", "")}</span>
      <span className="text-[10px] text-gray-500">→</span>
      <span className="text-[10px] text-gray-400 font-mono">{typeof signal.target === "string" ? signal.target.replace("Agent", "") : "ALL"}</span>
      <Badge className={`text-[8px] px-1 py-0 ${actionColors[signal.action] || "bg-gray-500/20 text-gray-300"} border-0`}>
        {signal.action}
      </Badge>
      <span className="text-[9px] text-gray-500 ml-auto">{new Date(signal.timestamp).toLocaleTimeString("pt-BR")}</span>
    </div>
  );
}

// ─── City Card ──────────────────────────
function CityCard({ city }: { city: GrowthOverviewRow }) {
  const stage = STAGE_CONFIG[city.growth_stage] || STAGE_CONFIG.cold;
  const Icon = stage.icon;

  return (
    <div className={`rounded-xl border border-white/[0.06] ${stage.bg} p-4 space-y-3 hover:border-white/[0.12] transition-all`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${stage.color}`} />
          <h4 className="text-sm font-bold text-white">{city.city}</h4>
        </div>
        <Badge className={`text-[9px] px-1.5 py-0.5 ${stage.bg} ${stage.color} border border-white/[0.08]`}>
          {stage.label}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-lg font-black text-white">{city.total_stores}</p>
          <p className="text-[8px] text-gray-400 uppercase tracking-wider">Lojas</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-black text-white">{city.total_zones}</p>
          <p className="text-[8px] text-gray-400 uppercase tracking-wider">Zonas</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-black text-orange-400">{Math.round(city.demand_score)}</p>
          <p className="text-[8px] text-gray-400 uppercase tracking-wider">Demanda</p>
        </div>
      </div>

      {/* Zone mini-bars */}
      {city.zones && city.zones.length > 0 && (
        <div className="space-y-1">
          <p className="text-[8px] text-gray-500 uppercase tracking-wider font-bold">Zonas</p>
          {city.zones.slice(0, 4).map((z: any, i: number) => {
            const levelColor: Record<string, string> = {
              weak: "bg-gray-500", emerging: "bg-amber-500", growing: "bg-orange-500",
              strong: "bg-red-500", dominant: "bg-emerald-500",
            };
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[8px] text-gray-400 truncate w-20">{z.zone_name}</span>
                <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${levelColor[z.dominance_level] || "bg-gray-500"} transition-all`}
                    style={{ width: `${Math.min((z.demand_score / 1000) * 100, 100)}%` }} />
                </div>
                <span className="text-[7px] text-gray-500 uppercase w-12 text-right">{z.dominance_level}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════
export default function GrowthEngineMonitor() {
  const { cities, isLoading, refetch, stats, recentSignals } = useGrowthMetrics();
  const [isRunning, setIsRunning] = useState(false);

  const runAllAgents = async () => {
    setIsRunning(true);
    try {
      toast.info("🚀 Executando Growth Engine...");

      // 1. CityExpansion (global)
      const cityResult = await runCityExpansionAgent();
      toast.success(`🏙️ CityExpansion: ${cityResult.metrics.cities_monitored || 0} cidades`);

      // 2. For each city, run demand + viral + territory
      for (const city of cities) {
        await runDemandIntelligenceAgent(city.city);
        await runViralDistributionAgent(city.city);
        await runTerritoryDominanceAgent(city.city);
      }

      toast.success("✅ Growth Engine completado!");
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao executar agentes");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              Growth Engine
              <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-[9px] px-1.5">AGENTIC</Badge>
            </h2>
            <p className="text-[10px] text-gray-400">Marketplace territorial expansion • 4 agents • 19 skills</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}
            className="text-[10px] h-7 border-white/10 text-gray-400 hover:text-white">
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
          <Button size="sm" disabled={isRunning} onClick={runAllAgents}
            className="text-[10px] h-7 bg-orange-500 hover:bg-orange-600 text-white font-bold">
            {isRunning ? <Activity className="h-3 w-3 mr-1 animate-spin" /> : <Zap className="h-3 w-3 mr-1" />}
            {isRunning ? "Executando..." : "Executar Agentes"}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Cidades", value: stats.totalCities, icon: MapPin, color: "text-blue-400" },
          { label: "Cidades Quentes", value: stats.hotCities, icon: Flame, color: "text-red-400" },
          { label: "Zonas", value: stats.totalZones, icon: Target, color: "text-purple-400" },
          { label: "Dominantes", value: stats.dominantZones, icon: Shield, color: "text-emerald-400" },
          { label: "Lojas", value: stats.totalStores, icon: Users, color: "text-amber-400" },
          { label: "Sinais", value: stats.totalSignals, icon: Radio, color: "text-cyan-400" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
            <kpi.icon className={`h-4 w-4 ${kpi.color} mx-auto mb-1`} />
            <p className="text-xl font-black text-white">{kpi.value}</p>
            <p className="text-[8px] text-gray-500 uppercase tracking-wider">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* City Grid + Signal Log */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* City cards */}
        <div className="space-y-3">
          <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em] flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Mapa de Crescimento
          </p>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Activity className="h-6 w-6 animate-spin text-gray-500" />
            </div>
          ) : cities.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.08] p-12 text-center">
              <Globe className="h-10 w-10 text-gray-600 mx-auto mb-3" />
              <p className="text-sm font-bold text-gray-500">Nenhuma cidade rastreada</p>
              <p className="text-[10px] text-gray-600 mt-1">Execute a migração SQL e comece a rastrear cidades</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {cities.map((city) => (
                <CityCard key={city.id} city={city} />
              ))}
            </div>
          )}
        </div>

        {/* Signal log */}
        <div className="space-y-3">
          <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em] flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5" /> Agent Bus — Log de Sinais
          </p>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3 space-y-1.5 max-h-[400px] overflow-y-auto">
            {recentSignals.length === 0 ? (
              <p className="text-[10px] text-gray-600 text-center py-6">Nenhum sinal emitido ainda</p>
            ) : (
              recentSignals.map((signal) => (
                <SignalBadge key={signal.id} signal={signal} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
