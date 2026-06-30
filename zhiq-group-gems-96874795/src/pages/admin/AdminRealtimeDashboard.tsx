import { useState, useMemo } from "react";
import { useEventLog } from "@/hooks/useEventLog";
import { useRealtimeMetrics } from "@/hooks/useRealtimeMetrics";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  Activity, AlertTriangle, Zap, Users, CreditCard,
  Car, BrainCircuit, Shield, Pause, Play, Trash2,
  RefreshCw, Radio, TrendingUp,
} from "lucide-react";
import type { PlatformEvent, EventSeverity } from "@/lib/events/types";

// ── Constantes ────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<EventSeverity, { color: string; bg: string; label: string }> = {
  info:     { color: "#3B82F6", bg: "bg-blue-500/10",   label: "INFO"     },
  warning:  { color: "#F59E0B", bg: "bg-amber-500/10",  label: "AVISO"    },
  error:    { color: "#EF4444", bg: "bg-red-500/10",    label: "ERRO"     },
  critical: { color: "#DC2626", bg: "bg-red-700/20",    label: "CRÍTICO"  },
};

const MODULE_COLORS: Record<string, string> = {
  rides:    "#FF6A00",
  finance:  "#22C55E",
  users:    "#3B82F6",
  drivers:  "#F59E0B",
  motoboys: "#EF4444",
  ai:       "#8B5CF6",
  security: "#DC2626",
  stores:   "#06B6D4",
  system:   "#6B7280",
};

const PIE_COLORS = Object.values(MODULE_COLORS);

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  title, value, sub, icon: Icon, color, pulse,
}: {
  title: string; value: number | string; sub?: string;
  icon: React.ElementType; color: string; pulse?: boolean;
}) {
  return (
    <div className="bg-[#1B1F24] border border-white/10 rounded-2xl p-4 flex items-start gap-3">
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${pulse ? "animate-pulse" : ""}`}
        style={{ background: `${color}22`, border: `1px solid ${color}40` }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <p className="text-xs text-[#A7B0BE] font-medium">{title}</p>
        <p className="text-2xl font-black text-white leading-none mt-0.5">{value.toLocaleString()}</p>
        {sub && <p className="text-[11px] text-[#A7B0BE] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Event Row ─────────────────────────────────────────────────────────────────

function EventRow({ event }: { event: PlatformEvent }) {
  const s = SEVERITY_CONFIG[event.severity ?? "info"];
  const color = MODULE_COLORS[event.module] ?? "#6B7280";
  const time = event.created_at
    ? new Date(event.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--:--:--";

  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 border-b border-white/5 hover:bg-white/5 transition-colors text-[12px] ${s.bg}`}>
      {/* Dot */}
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
      {/* Time */}
      <span className="font-mono text-[#A7B0BE] shrink-0 w-18">{time}</span>
      {/* Module badge */}
      <span
        className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0"
        style={{ background: `${color}22`, color }}
      >
        {event.module}
      </span>
      {/* Severity */}
      <span className="font-bold shrink-0" style={{ color: s.color }}>[{s.label}]</span>
      {/* Title */}
      <span className="text-[#F5F7FA] flex-1 truncate">{event.title}</span>
      {/* City */}
      {event.city && <span className="text-[#A7B0BE] shrink-0">{event.city}</span>}
    </div>
  );
}

// ── Filtros ───────────────────────────────────────────────────────────────────

const MODULES = ["todos", "rides", "finance", "users", "drivers", "motoboys", "ai", "security", "system"] as const;
const SEVERITIES = ["todas", "info", "warning", "error", "critical"] as const;

// ── Dashboard principal ───────────────────────────────────────────────────────

export default function AdminRealtimeDashboard() {
  const [moduleFilter,   setModuleFilter]   = useState("todos");
  const [severityFilter, setSeverityFilter] = useState("todas");

  const { events, loading, paused, togglePause, clear } = useEventLog({
    module:   moduleFilter   !== "todos"  ? (moduleFilter as any)   : undefined,
    severity: severityFilter !== "todas"  ? (severityFilter as any) : undefined,
    limit: 100,
  });

  const { metrics, lastUpdate, refetch } = useRealtimeMetrics();

  // Converte by_module para Recharts
  const moduleData = useMemo(() =>
    Object.entries(metrics.events_by_module ?? {}).map(([name, value]) => ({
      name,
      value: value as number,
      fill: MODULE_COLORS[name] ?? "#6B7280",
    })), [metrics.events_by_module]
  );

  // Converte by_hour para Recharts
  const hourData = useMemo(() =>
    (metrics.events_by_hour ?? []).map((h) => ({
      hour: new Date(h.hour).getHours() + "h",
      count: h.count,
    })), [metrics.events_by_hour]
  );

  return (
    <div className="min-h-screen bg-[#0D0F12] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#0D0F12]/95 backdrop-blur sticky top-0 z-10 px-6 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-[#FF6A00]/20 flex items-center justify-center">
          <Radio className="w-4 h-4 text-[#FF6A00] animate-pulse" />
        </div>
        <div>
          <h1 className="text-base font-black tracking-tight">Central de Eventos — VIAGG-TX8™</h1>
          <p className="text-[11px] text-[#A7B0BE]">
            Sistema de Monitoramento em Tempo Real
            {lastUpdate && ` · atualizado ${lastUpdate.toLocaleTimeString("pt-BR")}`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-green-500/15 border border-green-500/30 rounded-full px-3 py-1">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <span className="text-[11px] text-green-400 font-semibold">LIVE</span>
          </div>
          <button
            onClick={refetch}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            title="Atualizar métricas"
          >
            <RefreshCw className="w-4 h-4 text-[#A7B0BE]" />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          <KpiCard title="Eventos Hoje"       value={metrics.total_today}     icon={Activity}    color="#FF6A00" />
          <KpiCard title="Última Hora"        value={metrics.total_last_hour} icon={TrendingUp}  color="#3B82F6" />
          <KpiCard title="Erros Hoje"         value={metrics.errors_today}    icon={AlertTriangle} color="#EF4444" pulse={metrics.errors_today > 0} />
          <KpiCard title="Corridas Hoje"      value={metrics.rides_today}     icon={Car}         color="#FF6A00" />
          <KpiCard title="Pagamentos"         value={metrics.payments_today}  icon={CreditCard}  color="#22C55E" />
          <KpiCard title="Novos Usuários"     value={metrics.users_today}     icon={Users}       color="#3B82F6" />
          <KpiCard title="Chamadas IA"        value={metrics.ai_calls_today}  icon={BrainCircuit} color="#8B5CF6" />
          <KpiCard title="Alertas Críticos"   value={metrics.critical_alerts} icon={Shield}      color="#DC2626" pulse={metrics.critical_alerts > 0} />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Area chart — eventos/hora */}
          <div className="md:col-span-2 bg-[#1B1F24] rounded-2xl border border-white/10 p-4">
            <p className="text-xs font-bold text-[#A7B0BE] uppercase mb-3">Eventos por Hora (24h)</p>
            {hourData.length > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={hourData}>
                  <defs>
                    <linearGradient id="ev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF6A00" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#FF6A00" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="hour" tick={{ fill: "#A7B0BE", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#A7B0BE", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: "#1B1F24", border: "1px solid #ffffff20", borderRadius: 8 }}
                    labelStyle={{ color: "#F5F7FA" }}
                    itemStyle={{ color: "#FF6A00" }}
                  />
                  <Area type="monotone" dataKey="count" stroke="#FF6A00" fill="url(#ev)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[140px] flex items-center justify-center text-[#A7B0BE] text-sm">
                {loading ? "Carregando..." : "Sem dados ainda — execute a migration SQL primeiro."}
              </div>
            )}
          </div>

          {/* Pie — por módulo */}
          <div className="bg-[#1B1F24] rounded-2xl border border-white/10 p-4">
            <p className="text-xs font-bold text-[#A7B0BE] uppercase mb-3">Por Módulo</p>
            {moduleData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={110}>
                  <PieChart>
                    <Pie data={moduleData} dataKey="value" cx="50%" cy="50%" outerRadius={50} innerRadius={28}>
                      {moduleData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#1B1F24", border: "1px solid #ffffff20", borderRadius: 8 }}
                      itemStyle={{ color: "#F5F7FA" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-1 mt-2">
                  {moduleData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ background: d.fill }} />
                      <span className="text-[10px] text-[#A7B0BE] truncate">{d.name}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[140px] flex items-center justify-center text-[#A7B0BE] text-sm">Sem dados</div>
            )}
          </div>
        </div>

        {/* Console de eventos */}
        <div className="bg-[#1B1F24] rounded-2xl border border-white/10 overflow-hidden">
          {/* Console header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-[#0D0F12]">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            </div>
            <span className="text-[11px] font-mono text-[#A7B0BE]">
              viagg-tx8 — live event console ({events.length} eventos)
            </span>
            <div className="ml-auto flex items-center gap-2">
              {/* Filtro módulo */}
              <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="text-[11px] bg-[#2A3038] border border-white/10 rounded px-2 py-1 text-[#A7B0BE]"
              >
                {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {/* Filtro severidade */}
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="text-[11px] bg-[#2A3038] border border-white/10 rounded px-2 py-1 text-[#A7B0BE]"
              >
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {/* Pause / Play */}
              <button
                onClick={togglePause}
                className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition-colors ${
                  paused
                    ? "border-amber-500/40 text-amber-400 bg-amber-500/10"
                    : "border-white/10 text-[#A7B0BE] hover:bg-white/5"
                }`}
              >
                {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                {paused ? "Retomar" : "Pausar"}
              </button>
              <button
                onClick={clear}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-white/10 text-[#A7B0BE] hover:bg-white/5 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Limpar
              </button>
            </div>
          </div>

          {/* Linhas */}
          <div className="h-96 overflow-y-auto font-mono">
            {loading && events.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="flex items-center gap-2 text-[#A7B0BE] text-sm">
                  <Zap className="w-4 h-4 animate-pulse text-[#FF6A00]" />
                  Conectando ao stream de eventos…
                </div>
              </div>
            )}
            {!loading && events.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <Activity className="w-8 h-8 text-[#A7B0BE]/30" />
                <p className="text-[#A7B0BE] text-sm">Nenhum evento ainda.</p>
                <p className="text-[#A7B0BE]/60 text-xs">Os eventos aparecerão aqui em tempo real.</p>
              </div>
            )}
            {events.map((event, i) => (
              <EventRow key={event.id ?? i} event={event} />
            ))}
          </div>

          {/* Console footer */}
          <div className="flex items-center gap-2 px-4 py-2 border-t border-white/10 bg-[#0D0F12]">
            <div className={`w-2 h-2 rounded-full ${paused ? "bg-amber-400" : "bg-green-400 animate-pulse"}`} />
            <span className="text-[10px] font-mono text-[#A7B0BE]">
              {paused ? "⏸ Stream pausado" : `▶ Stream ativo · ${events.length} eventos carregados`}
            </span>
          </div>
        </div>

        {/* Bar chart por módulo */}
        {moduleData.length > 0 && (
          <div className="bg-[#1B1F24] rounded-2xl border border-white/10 p-4">
            <p className="text-xs font-bold text-[#A7B0BE] uppercase mb-3">Volume por Módulo (hoje)</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={moduleData} layout="vertical">
                <XAxis type="number" tick={{ fill: "#A7B0BE", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#A7B0BE", fontSize: 10 }} width={70} />
                <Tooltip
                  contentStyle={{ background: "#1B1F24", border: "1px solid #ffffff20", borderRadius: 8 }}
                  itemStyle={{ color: "#F5F7FA" }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {moduleData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

      </div>
    </div>
  );
}
