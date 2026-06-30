/**
 * AdminGLMHistoryPage — Histórico Completo de Consumo da IA GLM
 *
 * Expansão da Central de Inteligência GLM. Não altera nenhuma página existente.
 * Registra e exibe toda utilização da IA na plataforma via tabela `glm_usage_log`.
 *
 * Tabs:
 *   Dashboard · Histórico · Prompts · Respostas · Estatísticas · Por Módulo · Pesquisa
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Brain, Clock, CheckCircle2, XCircle, Zap, BarChart3, Search,
  Download, RefreshCw, ChevronDown, ChevronUp, Eye,
  Loader2, AlertCircle, Timer, TrendingUp, Users, Package,
  FileText, MessageSquare, Activity, Layers, Filter,
} from "lucide-react";
import { format, startOfDay, subDays, subWeeks, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

/* ─── Types ───────────────────────────────────────────────────── */

interface GlmUsageRow {
  id: string;
  created_at: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  profile_type: string | null;
  module: string | null;
  page: string | null;
  feature: string | null;
  operation_type: string | null;
  status: string;
  processing_ms: number | null;
  response_ms: number | null;
  model: string | null;
  session_id: string | null;
  request_id: string | null;
  prompt_text: string | null;
  prompt_summary: string | null;
  prompt_category: string | null;
  response_text: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
}

/* ─── Constants ────────────────────────────────────────────────── */

const TABS = [
  { id: "dashboard",    label: "Dashboard",   icon: BarChart3     },
  { id: "historico",    label: "Histórico",   icon: Activity      },
  { id: "prompts",      label: "Prompts",     icon: MessageSquare },
  { id: "respostas",    label: "Respostas",   icon: FileText      },
  { id: "estatisticas", label: "Estatísticas",icon: TrendingUp    },
  { id: "modulos",      label: "Por Módulo",  icon: Layers        },
  { id: "pesquisa",     label: "Pesquisa",    icon: Search        },
] as const;

type TabId = typeof TABS[number]["id"];

const MODULE_LABELS: Record<string, string> = {
  admin_glm:          "Central GLM",
  admin_glm_analytics:"Análise IA",
  imoveis:            "Imóveis",
  veiculos:           "Veículos",
  servicos:           "Serviços",
  fretes:             "Fretes & Mudanças",
  viagens:            "Viagens & Turismo",
  mercado:            "Mercado",
  postador:           "Postador",
  grupos:             "Grupos WhatsApp",
  carteira:           "Carteira",
  financeiro:         "Financeiro",
  promocoes:          "Promoções",
  admin:              "Painel Admin",
  anunciante:         "Anunciante",
  plataforma:         "Plataforma",
};

const MODULE_COLORS = [
  "#FF6A00", "#EAB308", "#3B82F6", "#10B981", "#8B5CF6",
  "#EC4899", "#06B6D4", "#F97316", "#84CC16", "#6366F1",
  "#14B8A6", "#A78BFA", "#FB923C", "#34D399", "#818CF8",
];

const STATUS_COLOR: Record<string, string> = {
  success: "#10B981",
  error:   "#EF4444",
  timeout: "#F59E0B",
  pending: "#6B7280",
};

/* ─── Hook: fetch all rows ─────────────────────────────────────── */

function useGlmHistory(limit = 500) {
  return useQuery<GlmUsageRow[]>({
    queryKey: ["glm_usage_log", limit],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("glm_usage_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as GlmUsageRow[];
    },
  });
}

/* ─── Sub-components ───────────────────────────────────────────── */

function KpiCard({
  label, value, sub, icon: Icon, color = "#FF6A00",
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: string;
}) {
  return (
    <div className="rounded-2xl p-4 border" style={{ background: "#13161B", borderColor: color + "30" }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>{label}</p>
          <p className="text-3xl font-black text-white mt-1">{value}</p>
          {sub && <p className="text-[11px] text-[#A7B0BE] mt-0.5">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + "20" }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? "#6B7280";
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase"
      style={{ background: color + "20", color, border: `1px solid ${color}40` }}>
      {status === "success" ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
      {status}
    </span>
  );
}

function ModuleBadge({ mod }: { mod: string | null }) {
  const label = MODULE_LABELS[mod ?? ""] ?? mod ?? "—";
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide bg-[#FF6A00]/12 text-[#FF6A00] border border-[#FF6A00]/25">
      {label}
    </span>
  );
}

function PromptModal({ row, onClose }: { row: GlmUsageRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl bg-[#0D0F12] border border-[#2A3038] p-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-[#A7B0BE] hover:text-white text-lg leading-none">✕</button>
        <h3 className="text-white font-black text-lg mb-4">Detalhes da Chamada GLM</h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {[
            ["Modelo",    row.model ?? "—"],
            ["Status",    row.status],
            ["Módulo",    MODULE_LABELS[row.module ?? ""] ?? row.module ?? "—"],
            ["Usuário",   row.user_email ?? row.user_name ?? row.user_id?.slice(0, 8) ?? "—"],
            ["Perfil",    row.profile_type ?? "—"],
            ["Tempo (ms)",row.processing_ms != null ? `${row.processing_ms} ms` : "—"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl p-3 bg-[#1B1F24] border border-[#2A3038]">
              <p className="text-[9px] text-[#A7B0BE]/60 uppercase tracking-widest mb-1">{k}</p>
              <p className="text-xs text-white font-bold truncate">{v}</p>
            </div>
          ))}
        </div>

        {row.prompt_text && (
          <div className="mb-4">
            <p className="text-[10px] font-black text-[#FF6A00] uppercase tracking-widest mb-2">Prompt</p>
            <pre className="text-[11px] text-[#A7B0BE] bg-[#1B1F24] border border-[#2A3038] rounded-xl p-4 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
              {row.prompt_text}
            </pre>
          </div>
        )}

        {row.response_text && (
          <div className="mb-4">
            <p className="text-[10px] font-black text-[#10B981] uppercase tracking-widest mb-2">Resposta da IA</p>
            <pre className="text-[11px] text-[#A7B0BE] bg-[#1B1F24] border border-[#2A3038] rounded-xl p-4 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
              {row.response_text}
            </pre>
          </div>
        )}

        {row.error_message && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs">
            <strong>Erro:</strong> {row.error_message}
          </div>
        )}

        <p className="text-[10px] text-[#A7B0BE]/40 mt-4">
          {format(new Date(row.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
          {row.page && ` · ${row.page}`}
        </p>
      </div>
    </div>
  );
}

/* ─── Export helpers ───────────────────────────────────────────── */

function exportCsv(rows: GlmUsageRow[]) {
  const headers = [
    "ID","Data","Hora","Usuário","Perfil","Módulo","Página","Funcionalidade",
    "Operação","Status","Tempo (ms)","Modelo","Sessão","Prompt (resumo)","Erro",
  ];
  const lines = rows.map((r) => [
    r.id,
    format(new Date(r.created_at), "dd/MM/yyyy"),
    format(new Date(r.created_at), "HH:mm:ss"),
    r.user_email ?? r.user_name ?? r.user_id ?? "",
    r.profile_type ?? "",
    MODULE_LABELS[r.module ?? ""] ?? r.module ?? "",
    r.page ?? "",
    r.feature ?? "",
    r.operation_type ?? "",
    r.status,
    r.processing_ms ?? "",
    r.model ?? "",
    r.session_id ?? "",
    (r.prompt_summary ?? "").replace(/[\n\r,"]/g, " "),
    (r.error_message ?? "").replace(/[\n\r,"]/g, " "),
  ].map((v) => `"${v}"`).join(","));

  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `glm-historico-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJson(rows: GlmUsageRow[]) {
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `glm-historico-${format(new Date(), "yyyy-MM-dd")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Tab: Dashboard ───────────────────────────────────────────── */

function TabDashboard({ rows }: { rows: GlmUsageRow[] }) {
  const today    = startOfDay(new Date());
  const weekAgo  = subDays(today, 7);
  const monthAgo = subDays(today, 30);

  const todayRows  = rows.filter((r) => new Date(r.created_at) >= today);
  const weekRows   = rows.filter((r) => new Date(r.created_at) >= weekAgo);
  const monthRows  = rows.filter((r) => new Date(r.created_at) >= monthAgo);
  const totalRows  = rows;

  const successes = rows.filter((r) => r.status === "success").length;
  const errors    = rows.filter((r) => r.status === "error").length;
  const avgMs     = rows.filter((r) => r.processing_ms != null)
    .reduce((s, r, _, a) => s + (r.processing_ms! / a.length), 0);
  const maxMs     = Math.max(0, ...rows.map((r) => r.processing_ms ?? 0));
  const minMs     = rows.filter((r) => r.processing_ms != null).length > 0
    ? Math.min(...rows.filter((r) => r.processing_ms != null).map((r) => r.processing_ms!))
    : 0;

  // Daily usage chart (last 14 days)
  const dailyData = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "dd/MM");
      map[d] = 0;
    }
    rows.forEach((r) => {
      const d = format(new Date(r.created_at), "dd/MM");
      if (d in map) map[d]++;
    });
    return Object.entries(map).map(([data, usos]) => ({ data, usos }));
  }, [rows]);

  // Module pie
  const moduleData = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((r) => { const k = r.module ?? "plataforma"; map[k] = (map[k] ?? 0) + 1; });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name: MODULE_LABELS[name] ?? name, value }));
  }, [rows]);

  // Hourly heatmap (0–23h)
  const hourlyData = useMemo(() => {
    const map: number[] = Array(24).fill(0);
    rows.forEach((r) => { map[new Date(r.created_at).getHours()]++; });
    return map.map((usos, h) => ({ hora: `${String(h).padStart(2, "0")}h`, usos }));
  }, [rows]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Hoje"   value={todayRows.length}  sub="chamadas"      icon={Zap}          color="#FF6A00" />
        <KpiCard label="Semana" value={weekRows.length}   sub="chamadas"      icon={Clock}        color="#EAB308" />
        <KpiCard label="Mês"    value={monthRows.length}  sub="chamadas"      icon={BarChart3}    color="#3B82F6" />
        <KpiCard label="Total"  value={totalRows.length}  sub="registros"     icon={Brain}        color="#8B5CF6" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Sucesso"     value={successes}               icon={CheckCircle2} color="#10B981" />
        <KpiCard label="Erros"       value={errors}                  icon={XCircle}      color="#EF4444" />
        <KpiCard label="Tempo Médio" value={avgMs ? `${Math.round(avgMs)} ms` : "—"} icon={Timer}  color="#06B6D4" />
        <KpiCard label="Maior Tempo" value={maxMs ? `${maxMs} ms` : "—"} icon={TrendingUp} color="#F97316" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-[#13161B] border border-[#2A3038]/50 p-4">
          <p className="text-[10px] font-black text-[#FF6A00] uppercase tracking-widest mb-3">Uso Diário — Últimos 14 dias</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A3038" />
              <XAxis dataKey="data" tick={{ fill: "#A7B0BE", fontSize: 9 }} />
              <YAxis tick={{ fill: "#A7B0BE", fontSize: 9 }} />
              <Tooltip contentStyle={{ background: "#1B1F24", border: "1px solid #2A3038", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="usos" fill="#FF6A00" radius={[4, 4, 0, 0]} name="Chamadas" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl bg-[#13161B] border border-[#2A3038]/50 p-4">
          <p className="text-[10px] font-black text-[#EAB308] uppercase tracking-widest mb-3">Uso por Módulo</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={moduleData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={9}>
                {moduleData.map((_, i) => (
                  <Cell key={i} fill={MODULE_COLORS[i % MODULE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#1B1F24", border: "1px solid #2A3038", borderRadius: 8, fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Hourly heatmap */}
      <div className="rounded-2xl bg-[#13161B] border border-[#2A3038]/50 p-4">
        <p className="text-[10px] font-black text-[#3B82F6] uppercase tracking-widest mb-3">Horários de Utilização (0h–23h)</p>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={hourlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A3038" />
            <XAxis dataKey="hora" tick={{ fill: "#A7B0BE", fontSize: 8 }} interval={1} />
            <YAxis tick={{ fill: "#A7B0BE", fontSize: 9 }} />
            <Tooltip contentStyle={{ background: "#1B1F24", border: "1px solid #2A3038", borderRadius: 8, fontSize: 11 }} />
            <Bar dataKey="usos" fill="#3B82F6" radius={[3, 3, 0, 0]} name="Chamadas" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Status + min time */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Taxa de Sucesso" value={rows.length ? `${Math.round((successes / rows.length) * 100)}%` : "—"} icon={CheckCircle2} color="#10B981" />
        <KpiCard label="Menor Tempo"     value={minMs ? `${minMs} ms` : "—"} icon={Zap}  color="#8B5CF6" />
        <KpiCard label="Usuários Únicos" value={new Set(rows.map((r) => r.user_id).filter(Boolean)).size} icon={Users} color="#EC4899" />
      </div>
    </div>
  );
}

/* ─── Tab: Histórico ───────────────────────────────────────────── */

function TabHistorico({ rows, onView }: { rows: GlmUsageRow[]; onView: (r: GlmUsageRow) => void }) {
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;
  const paged = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Timeline header */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-[#A7B0BE]/60">{rows.length} registros encontrados</p>
        <p className="text-[10px] text-[#A7B0BE]/40">Página {page + 1} / {Math.max(1, totalPages)}</p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[#2A3038]/50">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#1B1F24] border-b border-[#2A3038]">
              {["Data/Hora", "Usuário", "Módulo", "Operação", "Status", "Tempo", "Modelo", ""].map((h) => (
                <th key={h} className="text-left px-3 py-2.5 text-[9px] font-black text-[#A7B0BE]/60 uppercase tracking-widest whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => (
              <tr key={r.id} className="border-b border-[#2A3038]/30 hover:bg-[#1B1F24]/50 transition-colors">
                <td className="px-3 py-2.5 text-[#A7B0BE] whitespace-nowrap">
                  <p className="font-bold text-white">{format(new Date(r.created_at), "dd/MM/yy")}</p>
                  <p className="text-[9px] text-[#A7B0BE]/50">{format(new Date(r.created_at), "HH:mm:ss")}</p>
                </td>
                <td className="px-3 py-2.5 max-w-[140px] truncate text-[#A7B0BE]">
                  {r.user_email ?? r.user_name ?? r.user_id?.slice(0, 8) ?? <span className="text-[#A7B0BE]/30 italic">anônimo</span>}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <ModuleBadge mod={r.module} />
                </td>
                <td className="px-3 py-2.5 text-[#A7B0BE] capitalize whitespace-nowrap">{r.operation_type ?? "chat"}</td>
                <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2.5 text-[#A7B0BE] whitespace-nowrap">
                  {r.processing_ms != null ? `${r.processing_ms} ms` : "—"}
                </td>
                <td className="px-3 py-2.5 text-[#A7B0BE]/70 whitespace-nowrap text-[9px]">{r.model ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <button onClick={() => onView(r)}
                    className="p-1.5 rounded-lg bg-[#FF6A00]/10 text-[#FF6A00] hover:bg-[#FF6A00]/20 transition-all">
                    <Eye className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-[#A7B0BE]/40 text-xs italic">Nenhum registro.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-center gap-2">
        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
          className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-[#1B1F24] text-[#A7B0BE] hover:bg-[#2A3038] disabled:opacity-30 transition-all">
          ← Anterior
        </button>
        <span className="text-[10px] text-[#A7B0BE]/50">{page + 1} / {Math.max(1, totalPages)}</span>
        <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
          className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-[#1B1F24] text-[#A7B0BE] hover:bg-[#2A3038] disabled:opacity-30 transition-all">
          Próximo →
        </button>
      </div>
    </div>
  );
}

/* ─── Tab: Linha do Tempo ──────────────────────────────────────── */

function TabTimelineMini({ rows, onView }: { rows: GlmUsageRow[]; onView: (r: GlmUsageRow) => void }) {
  const first50 = rows.slice(0, 50);
  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-2 top-0 bottom-0 w-px bg-[#FF6A00]/20" />
      <div className="space-y-3">
        {first50.map((r, i) => (
          <div key={r.id} className="relative flex items-start gap-3 group">
            <div className="absolute -left-[18px] top-1.5 w-2 h-2 rounded-full border-2"
              style={{ background: STATUS_COLOR[r.status] ?? "#6B7280", borderColor: STATUS_COLOR[r.status] ?? "#6B7280" }} />
            <div className="flex-1 rounded-xl bg-[#13161B] border border-[#2A3038]/50 px-3 py-2.5 hover:border-[#FF6A00]/30 transition-all cursor-pointer"
              onClick={() => onView(r)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-[#FF6A00] mb-0.5">
                    {format(new Date(r.created_at), "HH:mm:ss")}
                    {" · "}
                    <span className="text-[#A7B0BE]">{MODULE_LABELS[r.module ?? ""] ?? r.module ?? "IA"}</span>
                  </p>
                  <p className="text-[11px] text-white leading-snug truncate">
                    {r.feature ?? r.operation_type ?? "Chamada GLM"}{r.prompt_summary ? ` — ${r.prompt_summary.slice(0, 60)}…` : ""}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              {r.processing_ms != null && (
                <p className="text-[9px] text-[#A7B0BE]/40 mt-1">{r.processing_ms} ms · {r.model ?? "gpt-5-mini"}</p>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-[#A7B0BE]/40 text-xs italic py-8 text-center">Nenhum evento registrado.</p>
        )}
        {rows.length > 50 && (
          <p className="text-[10px] text-[#A7B0BE]/30 italic pl-2">+ {rows.length - 50} registros mais antigos (use a aba Histórico)</p>
        )}
      </div>
    </div>
  );
}

/* ─── Tab: Prompts ─────────────────────────────────────────────── */

function TabPrompts({ rows, onView }: { rows: GlmUsageRow[]; onView: (r: GlmUsageRow) => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const promptRows = rows.filter((r) => r.prompt_text);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[#A7B0BE]/60">{promptRows.length} prompts registrados</p>
      {promptRows.map((r) => {
        const isOpen = expandedId === r.id;
        return (
          <div key={r.id} className="rounded-xl bg-[#13161B] border border-[#2A3038]/50">
            <button
              onClick={() => setExpandedId(isOpen ? null : r.id)}
              className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[9px] text-[#A7B0BE]/50">{format(new Date(r.created_at), "dd/MM/yy HH:mm")}</span>
                  <ModuleBadge mod={r.module} />
                  {r.prompt_category && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] bg-[#8B5CF6]/15 text-[#8B5CF6] border border-[#8B5CF6]/25">
                      {r.prompt_category}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-white leading-snug line-clamp-2">
                  {r.prompt_summary ?? r.prompt_text?.slice(0, 120)}
                </p>
              </div>
              <div className="shrink-0 mt-0.5">
                {isOpen ? <ChevronUp className="w-4 h-4 text-[#A7B0BE]" /> : <ChevronDown className="w-4 h-4 text-[#A7B0BE]" />}
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 border-t border-[#2A3038]/30">
                <pre className="mt-3 text-[11px] text-[#A7B0BE] bg-[#0D0F12] border border-[#2A3038] rounded-xl p-3 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                  {r.prompt_text}
                </pre>
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => onView(r)}
                    className="text-[10px] font-black text-[#FF6A00] hover:underline">
                    Ver resposta completa →
                  </button>
                  <span className="text-[9px] text-[#A7B0BE]/40">
                    {r.user_email ?? r.user_name ?? "—"} · {r.model ?? "gpt-5-mini"}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {promptRows.length === 0 && (
        <p className="text-center text-[#A7B0BE]/40 text-xs italic py-12">Nenhum prompt registrado ainda.</p>
      )}
    </div>
  );
}

/* ─── Tab: Respostas ───────────────────────────────────────────── */

function TabRespostas({ rows, onView }: { rows: GlmUsageRow[]; onView: (r: GlmUsageRow) => void }) {
  const responseRows = rows.filter((r) => r.response_text);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[#A7B0BE]/60">{responseRows.length} respostas registradas</p>
      {responseRows.map((r) => (
        <div key={r.id} className="rounded-xl bg-[#13161B] border border-[#2A3038]/50 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="text-[9px] text-[#A7B0BE]/50">{format(new Date(r.created_at), "dd/MM/yy HH:mm")}</span>
                <ModuleBadge mod={r.module} />
                <StatusBadge status={r.status} />
                {r.response_ms != null && (
                  <span className="text-[9px] text-[#06B6D4]">{r.response_ms} ms</span>
                )}
              </div>
              <p className="text-[11px] text-white line-clamp-3 leading-relaxed">
                {r.response_text?.slice(0, 200)}
              </p>
            </div>
            <button onClick={() => onView(r)}
              className="shrink-0 p-1.5 rounded-lg bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/20 transition-all">
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
      {responseRows.length === 0 && (
        <p className="text-center text-[#A7B0BE]/40 text-xs italic py-12">Nenhuma resposta registrada ainda.</p>
      )}
    </div>
  );
}

/* ─── Tab: Estatísticas ────────────────────────────────────────── */

function TabEstatisticas({ rows }: { rows: GlmUsageRow[] }) {
  // By user
  const byUser = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((r) => {
      const k = r.user_email ?? r.user_name ?? r.user_id ?? "anônimo";
      map[k] = (map[k] ?? 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [rows]);

  // By profile
  const byProfile = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((r) => { const k = r.profile_type ?? "sem perfil"; map[k] = (map[k] ?? 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  // By model
  const byModel = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((r) => { const k = r.model ?? "desconhecido"; map[k] = (map[k] ?? 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  // Weekly trend (last 8 weeks)
  const weeklyData = useMemo(() => {
    const weeks: { semana: string; usos: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = subWeeks(new Date(), i);
      const weekEnd   = subWeeks(new Date(), i - 1);
      const count = rows.filter((r) => {
        const d = new Date(r.created_at);
        return d >= weekStart && d < weekEnd;
      }).length;
      weeks.push({ semana: `S${8 - i}`, usos: count });
    }
    return weeks;
  }, [rows]);

  return (
    <div className="space-y-6">
      {/* Weekly trend */}
      <div className="rounded-2xl bg-[#13161B] border border-[#2A3038]/50 p-4">
        <p className="text-[10px] font-black text-[#8B5CF6] uppercase tracking-widest mb-3">Tendência Semanal — Últimas 8 semanas</p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A3038" />
            <XAxis dataKey="semana" tick={{ fill: "#A7B0BE", fontSize: 9 }} />
            <YAxis tick={{ fill: "#A7B0BE", fontSize: 9 }} />
            <Tooltip contentStyle={{ background: "#1B1F24", border: "1px solid #2A3038", borderRadius: 8, fontSize: 11 }} />
            <Line type="monotone" dataKey="usos" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 3, fill: "#8B5CF6" }} name="Chamadas" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* By User */}
        <div className="rounded-2xl bg-[#13161B] border border-[#2A3038]/50 p-4">
          <p className="text-[10px] font-black text-[#FF6A00] uppercase tracking-widest mb-3">Top Usuários</p>
          <div className="space-y-2">
            {byUser.map(([user, count], i) => (
              <div key={user} className="flex items-center gap-2">
                <span className="text-[9px] font-black text-[#A7B0BE]/40 w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-white truncate max-w-[120px]">{user}</span>
                    <span className="text-[9px] font-black text-[#FF6A00]">{count}</span>
                  </div>
                  <div className="h-1 rounded-full bg-[#2A3038]">
                    <div className="h-1 rounded-full bg-[#FF6A00]" style={{ width: `${(count / byUser[0][1]) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
            {byUser.length === 0 && <p className="text-[10px] text-[#A7B0BE]/40 italic">Nenhum dado</p>}
          </div>
        </div>

        {/* By Profile */}
        <div className="rounded-2xl bg-[#13161B] border border-[#2A3038]/50 p-4">
          <p className="text-[10px] font-black text-[#EAB308] uppercase tracking-widest mb-3">Por Perfil</p>
          <div className="space-y-2">
            {byProfile.map(([profile, count], i) => (
              <div key={profile} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-white capitalize">{profile}</span>
                    <span className="text-[9px] font-black text-[#EAB308]">{count}</span>
                  </div>
                  <div className="h-1 rounded-full bg-[#2A3038]">
                    <div className="h-1 rounded-full bg-[#EAB308]" style={{ width: `${(count / (byProfile[0]?.[1] ?? 1)) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
            {byProfile.length === 0 && <p className="text-[10px] text-[#A7B0BE]/40 italic">Nenhum dado</p>}
          </div>
        </div>

        {/* By Model */}
        <div className="rounded-2xl bg-[#13161B] border border-[#2A3038]/50 p-4">
          <p className="text-[10px] font-black text-[#3B82F6] uppercase tracking-widest mb-3">Por Modelo IA</p>
          <div className="space-y-2">
            {byModel.map(([model, count]) => (
              <div key={model} className="flex items-center justify-between p-2 rounded-lg bg-[#1B1F24]">
                <span className="text-[10px] text-white font-bold">{model}</span>
                <span className="text-[9px] font-black text-[#3B82F6]">{count} chamadas</span>
              </div>
            ))}
            {byModel.length === 0 && <p className="text-[10px] text-[#A7B0BE]/40 italic">Nenhum dado</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Por Módulo ──────────────────────────────────────────── */

function TabModulos({ rows, onView }: { rows: GlmUsageRow[]; onView: (r: GlmUsageRow) => void }) {
  const moduleStats = useMemo(() => {
    const map: Record<string, { count: number; success: number; avgMs: number; msArr: number[] }> = {};
    rows.forEach((r) => {
      const k = r.module ?? "plataforma";
      if (!map[k]) map[k] = { count: 0, success: 0, avgMs: 0, msArr: [] };
      map[k].count++;
      if (r.status === "success") map[k].success++;
      if (r.processing_ms != null) map[k].msArr.push(r.processing_ms);
    });
    return Object.entries(map)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([mod, s]) => ({
        mod,
        label: MODULE_LABELS[mod] ?? mod,
        count: s.count,
        success: s.success,
        errorRate: s.count > 0 ? Math.round(((s.count - s.success) / s.count) * 100) : 0,
        avgMs: s.msArr.length > 0 ? Math.round(s.msArr.reduce((a, b) => a + b, 0) / s.msArr.length) : null,
      }));
  }, [rows]);

  const barData = moduleStats.map((m) => ({ modulo: m.label.slice(0, 10), usos: m.count }));

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-[#13161B] border border-[#2A3038]/50 p-4">
        <p className="text-[10px] font-black text-[#10B981] uppercase tracking-widest mb-3">Chamadas por Módulo</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#2A3038" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#A7B0BE", fontSize: 9 }} />
            <YAxis dataKey="modulo" type="category" tick={{ fill: "#A7B0BE", fontSize: 9 }} width={80} />
            <Tooltip contentStyle={{ background: "#1B1F24", border: "1px solid #2A3038", borderRadius: 8, fontSize: 11 }} />
            <Bar dataKey="usos" radius={[0, 4, 4, 0]} name="Chamadas">
              {barData.map((_, i) => (
                <Cell key={i} fill={MODULE_COLORS[i % MODULE_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#2A3038]/50">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#1B1F24] border-b border-[#2A3038]">
              {["Módulo", "Total", "Sucesso", "Erros", "Taxa Erro", "Tempo Médio"].map((h) => (
                <th key={h} className="text-left px-3 py-2.5 text-[9px] font-black text-[#A7B0BE]/60 uppercase tracking-widest whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {moduleStats.map((m, i) => (
              <tr key={m.mod} className="border-b border-[#2A3038]/30 hover:bg-[#1B1F24]/50 transition-colors">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: MODULE_COLORS[i % MODULE_COLORS.length] }} />
                    <span className="text-white font-bold">{m.label}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-[#FF6A00] font-black">{m.count}</td>
                <td className="px-3 py-2.5 text-[#10B981]">{m.success}</td>
                <td className="px-3 py-2.5 text-[#EF4444]">{m.count - m.success}</td>
                <td className="px-3 py-2.5">
                  <span className={m.errorRate > 0 ? "text-[#EF4444]" : "text-[#10B981]"}>
                    {m.errorRate}%
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[#A7B0BE]">{m.avgMs != null ? `${m.avgMs} ms` : "—"}</td>
              </tr>
            ))}
            {moduleStats.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-[#A7B0BE]/40 text-xs italic">Nenhum dado</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Tab: Pesquisa ────────────────────────────────────────────── */

function TabPesquisa({ rows, onView }: { rows: GlmUsageRow[]; onView: (r: GlmUsageRow) => void }) {
  const [filters, setFilters] = useState({
    keyword: "",
    module: "",
    profile: "",
    status: "",
    dateFrom: "",
    dateTo: "",
    opType: "",
  });

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filters.keyword) {
        const kw = filters.keyword.toLowerCase();
        const text = [r.prompt_text, r.response_text, r.user_email, r.user_name, r.feature].join(" ").toLowerCase();
        if (!text.includes(kw)) return false;
      }
      if (filters.module && r.module !== filters.module) return false;
      if (filters.profile && r.profile_type !== filters.profile) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.opType && r.operation_type !== filters.opType) return false;
      if (filters.dateFrom) {
        const d = new Date(r.created_at);
        if (d < new Date(filters.dateFrom)) return false;
      }
      if (filters.dateTo) {
        const d = new Date(r.created_at);
        if (d > new Date(filters.dateTo + "T23:59:59")) return false;
      }
      return true;
    });
  }, [rows, filters]);

  const modules   = [...new Set(rows.map((r) => r.module).filter(Boolean))];
  const profiles  = [...new Set(rows.map((r) => r.profile_type).filter(Boolean))];
  const opTypes   = [...new Set(rows.map((r) => r.operation_type).filter(Boolean))];

  const set = (k: keyof typeof filters, v: string) => setFilters((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-4">
      {/* Filters grid */}
      <div className="rounded-xl bg-[#13161B] border border-[#2A3038]/50 p-4 space-y-3">
        <p className="text-[10px] font-black text-[#FF6A00] uppercase tracking-widest">Filtros</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Keyword */}
          <div>
            <label className="text-[9px] text-[#A7B0BE]/60 uppercase tracking-widest block mb-1">Palavra-chave</label>
            <input value={filters.keyword} onChange={(e) => set("keyword", e.target.value)}
              placeholder="Buscar em prompts, respostas, usuários…"
              className="w-full bg-[#0D0F12] border border-[#2A3038] text-white text-xs rounded-xl px-3 py-2 placeholder-[#A7B0BE]/30 focus:outline-none focus:border-[#FF6A00]/50" />
          </div>

          {/* Module */}
          <div>
            <label className="text-[9px] text-[#A7B0BE]/60 uppercase tracking-widest block mb-1">Módulo</label>
            <select value={filters.module} onChange={(e) => set("module", e.target.value)}
              className="w-full bg-[#0D0F12] border border-[#2A3038] text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[#FF6A00]/50">
              <option value="">Todos</option>
              {modules.map((m) => <option key={m!} value={m!}>{MODULE_LABELS[m!] ?? m}</option>)}
            </select>
          </div>

          {/* Profile */}
          <div>
            <label className="text-[9px] text-[#A7B0BE]/60 uppercase tracking-widest block mb-1">Perfil</label>
            <select value={filters.profile} onChange={(e) => set("profile", e.target.value)}
              className="w-full bg-[#0D0F12] border border-[#2A3038] text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[#FF6A00]/50">
              <option value="">Todos</option>
              {profiles.map((p) => <option key={p!} value={p!}>{p}</option>)}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="text-[9px] text-[#A7B0BE]/60 uppercase tracking-widest block mb-1">Status</label>
            <select value={filters.status} onChange={(e) => set("status", e.target.value)}
              className="w-full bg-[#0D0F12] border border-[#2A3038] text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[#FF6A00]/50">
              <option value="">Todos</option>
              <option value="success">Sucesso</option>
              <option value="error">Erro</option>
              <option value="timeout">Timeout</option>
              <option value="pending">Pendente</option>
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="text-[9px] text-[#A7B0BE]/60 uppercase tracking-widest block mb-1">De</label>
            <input type="date" value={filters.dateFrom} onChange={(e) => set("dateFrom", e.target.value)}
              className="w-full bg-[#0D0F12] border border-[#2A3038] text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[#FF6A00]/50" />
          </div>

          {/* Date To */}
          <div>
            <label className="text-[9px] text-[#A7B0BE]/60 uppercase tracking-widest block mb-1">Até</label>
            <input type="date" value={filters.dateTo} onChange={(e) => set("dateTo", e.target.value)}
              className="w-full bg-[#0D0F12] border border-[#2A3038] text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[#FF6A00]/50" />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-[10px] text-[#A7B0BE]/50">{filtered.length} resultado(s)</p>
          <button onClick={() => setFilters({ keyword: "", module: "", profile: "", status: "", dateFrom: "", dateTo: "", opType: "" })}
            className="text-[10px] font-black text-[#A7B0BE]/50 hover:text-white transition-all">
            Limpar filtros
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="overflow-x-auto rounded-xl border border-[#2A3038]/50">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#1B1F24] border-b border-[#2A3038]">
              {["Data/Hora", "Usuário", "Módulo", "Prompt (resumo)", "Status", "Tempo", ""].map((h) => (
                <th key={h} className="text-left px-3 py-2.5 text-[9px] font-black text-[#A7B0BE]/60 uppercase tracking-widest whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((r) => (
              <tr key={r.id} className="border-b border-[#2A3038]/30 hover:bg-[#1B1F24]/50 transition-colors">
                <td className="px-3 py-2.5 text-[#A7B0BE] whitespace-nowrap">
                  <p className="font-bold text-white text-[10px]">{format(new Date(r.created_at), "dd/MM/yy")}</p>
                  <p className="text-[9px] text-[#A7B0BE]/50">{format(new Date(r.created_at), "HH:mm")}</p>
                </td>
                <td className="px-3 py-2.5 max-w-[120px] truncate text-[#A7B0BE] text-[10px]">
                  {r.user_email ?? r.user_name ?? "—"}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <ModuleBadge mod={r.module} />
                </td>
                <td className="px-3 py-2.5 max-w-[200px] truncate text-[#A7B0BE] text-[10px]">
                  {r.prompt_summary ?? r.prompt_text?.slice(0, 80) ?? "—"}
                </td>
                <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2.5 text-[#A7B0BE] whitespace-nowrap text-[10px]">
                  {r.processing_ms != null ? `${r.processing_ms} ms` : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <button onClick={() => onView(r)}
                    className="p-1.5 rounded-lg bg-[#FF6A00]/10 text-[#FF6A00] hover:bg-[#FF6A00]/20 transition-all">
                    <Eye className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-[#A7B0BE]/40 text-xs italic">Nenhum resultado.</td></tr>
            )}
          </tbody>
        </table>
        {filtered.length > 100 && (
          <div className="px-4 py-2 bg-[#1B1F24] text-center text-[9px] text-[#A7B0BE]/40">
            Exibindo 100 de {filtered.length} resultados. Use filtros mais específicos para refinar.
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────────────────── */

export default function AdminGLMHistoryPage() {
  const [activeTab, setActiveTab]     = useState<TabId>("dashboard");
  const [viewingRow, setViewingRow]   = useState<GlmUsageRow | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);

  const { data: rows = [], isLoading, error, refetch, isFetching } = useGlmHistory(1000);

  const handleExportCsv  = useCallback(() => exportCsv(rows),  [rows]);
  const handleExportJson = useCallback(() => exportJson(rows), [rows]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#8B5CF6] to-[#3B82F6] flex items-center justify-center shadow-lg shadow-[#8B5CF6]/25">
            <Brain className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#F5F7FA] tracking-tight uppercase">
              Histórico GLM
            </h1>
            <p className="text-sm text-[#A7B0BE] mt-0.5">Consumo completo de IA na plataforma</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1B1F24] border border-[#2A3038] text-[#A7B0BE] text-[10px] font-black uppercase tracking-wide hover:border-[#FF6A00]/40 hover:text-white transition-all disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <button onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#10B981]/10 border border-[#10B981]/25 text-[#10B981] text-[10px] font-black uppercase tracking-wide hover:bg-[#10B981]/15 transition-all">
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          <button onClick={handleExportJson}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3B82F6]/10 border border-[#3B82F6]/25 text-[#3B82F6] text-[10px] font-black uppercase tracking-wide hover:bg-[#3B82F6]/15 transition-all">
            <Download className="w-3.5 h-3.5" />
            JSON
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/25 text-[#8B5CF6] text-[10px] font-black uppercase tracking-wide hover:bg-[#8B5CF6]/15 transition-all">
            <Download className="w-3.5 h-3.5" />
            PDF
          </button>
        </div>
      </div>

      {/* ── Status bar ─────────────────────────────────────── */}
      {error ? (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-[11px] text-red-300">
            Erro ao carregar histórico. Verifique se a tabela <code className="font-mono">glm_usage_log</code> foi criada no Supabase.
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#1B1F24]">
          <Loader2 className="w-4 h-4 text-[#FF6A00] animate-spin shrink-0" />
          <p className="text-[11px] text-[#A7B0BE]">Carregando histórico de consumo GLM…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-[11px] text-amber-300">
            Nenhum registro encontrado. O histórico será preenchido automaticamente à medida que a IA for utilizada na plataforma.
          </p>
        </div>
      ) : null}

      {/* ── Tabs ───────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 p-1 rounded-2xl bg-[#13161B] border border-[#2A3038]/50">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all
                ${activeTab === tab.id
                  ? "bg-[#FF6A00] text-white shadow-lg shadow-[#FF6A00]/20"
                  : "text-[#A7B0BE] hover:text-white hover:bg-[#1B1F24]"
                }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ────────────────────────────────────── */}
      <div>
        {activeTab === "dashboard" && (
          <div className="space-y-4">
            <TabDashboard rows={rows} />
            {/* Mini timeline below dashboard */}
            <div className="rounded-2xl bg-[#13161B] border border-[#2A3038]/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest">Linha do Tempo Recente</p>
                <button onClick={() => setShowTimeline((v) => !v)}
                  className="text-[10px] text-[#FF6A00] hover:underline">
                  {showTimeline ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              {showTimeline && <TabTimelineMini rows={rows} onView={setViewingRow} />}
              {!showTimeline && (
                <p className="text-[11px] text-[#A7B0BE]/40 italic">Clique em "Mostrar" para ver a linha do tempo recente.</p>
              )}
            </div>
          </div>
        )}
        {activeTab === "historico"    && <TabHistorico  rows={rows} onView={setViewingRow} />}
        {activeTab === "prompts"      && <TabPrompts    rows={rows} onView={setViewingRow} />}
        {activeTab === "respostas"    && <TabRespostas  rows={rows} onView={setViewingRow} />}
        {activeTab === "estatisticas" && <TabEstatisticas rows={rows} />}
        {activeTab === "modulos"      && <TabModulos    rows={rows} onView={setViewingRow} />}
        {activeTab === "pesquisa"     && <TabPesquisa   rows={rows} onView={setViewingRow} />}
      </div>

      {/* ── Modal de detalhe ─────────────────────────────── */}
      {viewingRow && (
        <PromptModal row={viewingRow} onClose={() => setViewingRow(null)} />
      )}
    </div>
  );
}
