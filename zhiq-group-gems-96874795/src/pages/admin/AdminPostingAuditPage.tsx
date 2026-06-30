/**
 * AdminPostingAuditPage — Auditoria Operacional das Postagens
 * Painel de saúde do sistema: verifica se campanhas foram executadas,
 * em qual grupo, quando e com qual resultado. Foco operacional, não vigilância.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2, XCircle, Clock, Search, Download, RefreshCw,
  Loader2, Shield, TrendingUp, BarChart3, Users, AlertTriangle,
  Calendar, Send, Filter, FileText, Activity, Timer,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays, startOfDay, endOfDay, startOfToday, endOfToday, startOfYesterday, endOfYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// ── Tipos ─────────────────────────────────────────────────────────
interface AuditEntry {
  id: string;
  created_at: string;
  started_at: string | null;
  posted_at: string | null;
  final_status: string;
  profile_type: string;
  platform: string;
  attempt_count: number | null;
  elapsed_ms: number | null;
  whatsapp_group_id: string | null;
  group_name: string | null;
  campaign_queue_id: string | null;
  campaign_title: string | null;
  campaign_type: string | null;
  message_text: string | null;
  execution_notes: string | null;
  error_message: string | null;
  error_code: string | null;
  proof_url: string | null;
  proof_type: string | null;
  operator_user_id: string | null;
  operator_name: string | null;
}

interface GroupStat {
  whatsapp_group_id: string;
  group_name: string;
  total_postings: number;
  success_count: number;
  error_count: number;
  success_rate_pct: number;
  last_posted_at: string | null;
  avg_elapsed_ms: number | null;
}

// ── Date range helper ─────────────────────────────────────────────
type DateRange = "today" | "yesterday" | "7d" | "30d" | "custom";

function getDateRange(range: DateRange, customStart: string, customEnd: string): { from: string; to: string } {
  const now = new Date();
  switch (range) {
    case "today":
      return { from: startOfToday().toISOString(), to: endOfToday().toISOString() };
    case "yesterday":
      return { from: startOfYesterday().toISOString(), to: endOfYesterday().toISOString() };
    case "7d":
      return { from: startOfDay(subDays(now, 6)).toISOString(), to: endOfToday().toISOString() };
    case "30d":
      return { from: startOfDay(subDays(now, 29)).toISOString(), to: endOfToday().toISOString() };
    case "custom":
      return {
        from: customStart ? startOfDay(new Date(customStart)).toISOString() : startOfDay(subDays(now, 29)).toISOString(),
        to:   customEnd   ? endOfDay(new Date(customEnd)).toISOString()     : endOfToday().toISOString(),
      };
  }
}

// ── Safe query ────────────────────────────────────────────────────
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

// ── Hooks ─────────────────────────────────────────────────────────
function useAuditEntries(from: string, to: string) {
  return useQuery<AuditEntry[]>({
    queryKey: ["audit", "entries", from, to],
    queryFn: async () => {
      const { data } = await safe(
        () => (supabase.from("posting_audit_full_view") as any)
          .select("*")
          .gte("created_at", from)
          .lte("created_at", to)
          .order("created_at", { ascending: false })
          .limit(500),
        { data: [] },
      );
      return (data ?? []) as AuditEntry[];
    },
    staleTime: 30_000,
  });
}

function useGroupStats() {
  return useQuery<GroupStat[]>({
    queryKey: ["audit", "group-stats"],
    queryFn: async () => {
      const { data } = await safe(
        () => (supabase.from("posting_audit_group_stats") as any)
          .select("*").order("total_postings", { ascending: false }).limit(50),
        { data: [] },
      );
      return (data ?? []) as GroupStat[];
    },
    staleTime: 60_000,
  });
}

// ── Status badge ──────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  sent:      { label: "Enviada",      cls: "bg-green-500/15 text-green-700 border-green-500/30",   icon: CheckCircle2 },
  posted:    { label: "Postada",      cls: "bg-green-500/15 text-green-700 border-green-500/30",   icon: CheckCircle2 },
  confirmed: { label: "Confirmada",   cls: "bg-green-500/15 text-green-700 border-green-500/30",   icon: CheckCircle2 },
  success:   { label: "Sucesso",      cls: "bg-green-500/15 text-green-700 border-green-500/30",   icon: CheckCircle2 },
  error:     { label: "Erro",         cls: "bg-red-500/15 text-red-700 border-red-500/30",         icon: XCircle },
  failed:    { label: "Falhou",       cls: "bg-red-500/15 text-red-700 border-red-500/30",         icon: XCircle },
  failure:   { label: "Falhou",       cls: "bg-red-500/15 text-red-700 border-red-500/30",         icon: XCircle },
  cancelled: { label: "Cancelada",    cls: "bg-gray-500/15 text-gray-600 border-gray-400/30",      icon: XCircle },
  pending:   { label: "Pendente",     cls: "bg-amber-500/15 text-amber-700 border-amber-500/30",   icon: Clock },
  unknown:   { label: "Desconhecido", cls: "bg-gray-500/15 text-gray-600 border-gray-400/30",      icon: Clock },
};

function StatusBadge({ status }: { status: string }) {
  const s = (status ?? "unknown").toLowerCase();
  const cfg = STATUS_CFG[s] ?? STATUS_CFG.unknown;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cn("text-[10px] font-semibold gap-1", cfg.cls)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

const PROFILE_LABEL: Record<string, string> = {
  postador: "Postador",
  motoboy:  "Motoboy",
  mototaxi: "Moto-Táxi",
  driver:   "Motorista",
  system:   "Sistema",
};

const PROFILE_COLORS: Record<string, string> = {
  postador: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  motoboy:  "bg-blue-500/15 text-blue-700 border-blue-500/30",
  mototaxi: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  driver:   "bg-green-500/15 text-green-700 border-green-500/30",
  system:   "bg-gray-500/15 text-gray-600 border-gray-400/30",
};

function ProfileBadge({ profile }: { profile: string }) {
  const p = (profile ?? "system").toLowerCase();
  return (
    <Badge variant="outline" className={cn("text-[10px] font-semibold", PROFILE_COLORS[p] ?? PROFILE_COLORS.system)}>
      {PROFILE_LABEL[p] ?? profile}
    </Badge>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, color = "text-primary", sub, loading }: {
  label: string; value: string | number; icon: React.ElementType;
  color?: string; sub?: string; loading?: boolean;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">{label}</p>
            {loading
              ? <div className="h-7 w-14 bg-muted animate-pulse rounded mt-1" />
              : <p className={cn("text-2xl font-black mt-0.5", color)}>{value}</p>}
            {sub && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
          </div>
          <Icon className={cn("h-8 w-8 shrink-0 opacity-15 mt-0.5", color)} />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Timeline Row ──────────────────────────────────────────────────
function AuditRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const isSuccess = ["sent", "posted", "confirmed", "success"].includes(entry.final_status?.toLowerCase() ?? "");
  const isError   = ["error", "failed", "failure"].includes(entry.final_status?.toLowerCase() ?? "");

  return (
    <>
      <TableRow
        className={cn(
          "hover:bg-muted/20 cursor-pointer transition-colors",
          isError && "bg-red-500/[0.02]",
        )}
        onClick={() => setExpanded(e => !e)}
      >
        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          {entry.created_at
            ? format(new Date(entry.created_at), "dd/MM/yy HH:mm:ss")
            : "—"}
        </TableCell>
        <TableCell><ProfileBadge profile={entry.profile_type} /></TableCell>
        <TableCell className="text-xs max-w-[130px] truncate">
          {entry.group_name ?? "—"}
        </TableCell>
        <TableCell className="text-xs max-w-[160px] truncate text-muted-foreground">
          {entry.campaign_title ?? "—"}
        </TableCell>
        <TableCell><StatusBadge status={entry.final_status} /></TableCell>
        <TableCell className="text-[10px] text-muted-foreground">
          {entry.elapsed_ms != null ? `${entry.elapsed_ms}ms` : "—"}
        </TableCell>
        <TableCell>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="bg-muted/10">
          <TableCell colSpan={7} className="py-3 px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {[
                { label: "ID Auditoria",   value: entry.id?.slice(0, 16) + "…" },
                { label: "Operador",       value: entry.operator_name ?? "—" },
                { label: "Plataforma",     value: entry.platform ?? "whatsapp" },
                { label: "Tentativas",     value: entry.attempt_count ?? 1 },
                { label: "Início",         value: entry.started_at ? format(new Date(entry.started_at), "HH:mm:ss") : "—" },
                { label: "Conclusão",      value: entry.posted_at  ? format(new Date(entry.posted_at),  "HH:mm:ss") : "—" },
                { label: "Prova",          value: entry.proof_type ?? "—" },
                { label: "Cód. Erro",      value: entry.error_code ?? "—" },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">{f.label}</p>
                  <p className="mt-0.5 font-medium">{String(f.value)}</p>
                </div>
              ))}
              {entry.error_message && (
                <div className="col-span-2 md:col-span-4">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Mensagem de Erro</p>
                  <p className="mt-0.5 text-red-600">{entry.error_message}</p>
                </div>
              )}
              {entry.execution_notes && (
                <div className="col-span-2 md:col-span-4">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Notas</p>
                  <p className="mt-0.5 text-muted-foreground">{entry.execution_notes}</p>
                </div>
              )}
              {entry.proof_url && (
                <div className="col-span-2 md:col-span-4">
                  <a href={entry.proof_url} target="_blank" rel="noopener noreferrer"
                    className="text-primary underline text-xs" onClick={e => e.stopPropagation()}>
                    Ver prova de postagem →
                  </a>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ── Exports CSV ───────────────────────────────────────────────────
function exportCsv(data: AuditEntry[]) {
  const headers = ["data", "hora", "perfil", "grupo", "campanha", "status", "tempo_ms", "erro"];
  const rows = data.map(e => [
    e.created_at ? format(new Date(e.created_at), "dd/MM/yyyy") : "",
    e.created_at ? format(new Date(e.created_at), "HH:mm:ss")  : "",
    e.profile_type ?? "",
    e.group_name ?? "",
    e.campaign_title ?? "",
    e.final_status ?? "",
    e.elapsed_ms ?? "",
    e.error_message ?? "",
  ]);
  const csv = [headers, ...rows].map(r => r.join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `auditoria-postagens-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Componentes de seção ──────────────────────────────────────────
const BAR_COLORS = { success: "#10b981", error: "#ef4444", cancelled: "#9ca3af" };

function StatsCharts({ data }: { data: AuditEntry[] }) {
  // Last 7 days
  const barData = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d    = subDays(new Date(), 6 - i);
    const iso  = format(d, "yyyy-MM-dd");
    const day  = data.filter(e => e.created_at?.startsWith(iso));
    return {
      label:  format(d, "dd/MM"),
      sucesso: day.filter(e => ["sent","posted","confirmed","success"].includes(e.final_status?.toLowerCase() ?? "")).length,
      erro:    day.filter(e => ["error","failed","failure"].includes(e.final_status?.toLowerCase() ?? "")).length,
    };
  }), [data]);

  // By profile
  const profiles = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach(e => { const p = e.profile_type ?? "system"; counts[p] = (counts[p] ?? 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name: PROFILE_LABEL[name] ?? name, value }));
  }, [data]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
      <Card className="border-border/60">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-sm">Postagens — Últimos 7 dias</CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="sucesso" name="Sucesso" fill={BAR_COLORS.success} radius={[3,3,0,0]} stackId="a" />
              <Bar dataKey="erro"    name="Erro"    fill={BAR_COLORS.error}   radius={[3,3,0,0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-sm">Distribuição por Perfil</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2.5">
          {profiles.length === 0
            ? <p className="text-xs text-muted-foreground py-8 text-center">Sem dados</p>
            : profiles.map(p => {
                const total = profiles.reduce((s, x) => s + x.value, 0);
                const pct   = total > 0 ? Math.round(p.value / total * 100) : 0;
                return (
                  <div key={p.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{p.name}</span>
                      <span className="font-medium">{p.value} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
        </CardContent>
      </Card>
    </div>
  );
}

function GroupStatsSection({ groups }: { groups: GroupStat[] }) {
  if (groups.length === 0) return null;
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-600" />
          Histórico por Grupo
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs pl-4">Grupo</TableHead>
              <TableHead className="text-xs text-center">Total</TableHead>
              <TableHead className="text-xs text-center">Sucesso</TableHead>
              <TableHead className="text-xs text-center">Erros</TableHead>
              <TableHead className="text-xs text-center">Taxa</TableHead>
              <TableHead className="text-xs">Última Postagem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.slice(0, 20).map(g => (
              <TableRow key={g.whatsapp_group_id ?? g.group_name} className="hover:bg-muted/20">
                <TableCell className="pl-4 text-xs font-medium truncate max-w-[160px]">{g.group_name}</TableCell>
                <TableCell className="text-xs text-center font-bold">{g.total_postings}</TableCell>
                <TableCell className="text-xs text-center text-green-600 font-bold">{g.success_count}</TableCell>
                <TableCell className="text-xs text-center text-red-600 font-bold">{g.error_count}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className={cn("text-[10px]",
                    (g.success_rate_pct ?? 0) >= 90 ? "bg-green-500/15 text-green-700 border-green-500/30" :
                    (g.success_rate_pct ?? 0) >= 70 ? "bg-amber-500/15 text-amber-700 border-amber-500/30" :
                    "bg-red-500/15 text-red-700 border-red-500/30"
                  )}>
                    {g.success_rate_pct ?? 0}%
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {g.last_posted_at ? format(new Date(g.last_posted_at), "dd/MM/yy HH:mm") : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Página principal ──────────────────────────────────────────────
const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: "today",     label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d",        label: "Últimos 7 dias" },
  { value: "30d",       label: "Últimos 30 dias" },
  { value: "custom",    label: "Personalizado" },
];

const PROFILE_FILTERS = [
  { value: "all",       label: "Todos os perfis" },
  { value: "postador",  label: "Postador" },
  { value: "motoboy",   label: "Motoboy" },
  { value: "mototaxi",  label: "Moto-Táxi" },
  { value: "driver",    label: "Motorista" },
];

const STATUS_FILTERS = [
  { value: "all",    label: "Todos" },
  { value: "success",label: "Sucesso" },
  { value: "error",  label: "Erro" },
  { value: "pending",label: "Pendente" },
];

export default function AdminPostingAuditPage() {
  const [dateRange, setDateRange]     = useState<DateRange>("7d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd]     = useState("");
  const [search, setSearch]           = useState("");
  const [profileFilter, setProfile]   = useState("all");
  const [statusFilter, setStatus]     = useState("all");
  const [activeTab, setActiveTab]     = useState<"historico" | "stats" | "grupos">("historico");

  const { from, to } = getDateRange(dateRange, customStart, customEnd);
  const { data: entries = [], isLoading, refetch } = useAuditEntries(from, to);
  const { data: groupStats = [] }                  = useGroupStats();

  // Filtros client-side
  const filtered = useMemo(() => entries.filter(e => {
    if (search) {
      const q = search.toLowerCase();
      const hay = [e.group_name, e.campaign_title, e.operator_name, e.error_message, e.id].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (profileFilter !== "all") {
      if ((e.profile_type ?? "").toLowerCase() !== profileFilter) return false;
    }
    if (statusFilter !== "all") {
      const s = (e.final_status ?? "").toLowerCase();
      if (statusFilter === "success" && !["sent","posted","confirmed","success"].includes(s)) return false;
      if (statusFilter === "error"   && !["error","failed","failure"].includes(s))            return false;
      if (statusFilter === "pending" && s !== "pending")                                      return false;
    }
    return true;
  }), [entries, search, profileFilter, statusFilter]);

  // KPIs
  const isSuccess = (e: AuditEntry) => ["sent","posted","confirmed","success"].includes((e.final_status ?? "").toLowerCase());
  const isError   = (e: AuditEntry) => ["error","failed","failure"].includes((e.final_status ?? "").toLowerCase());

  const total     = filtered.length;
  const successes = filtered.filter(isSuccess).length;
  const errors    = filtered.filter(isError).length;
  const rate      = total > 0 ? Math.round(successes / total * 100) : 0;
  const lastOk    = filtered.find(isSuccess);
  const lastErr   = filtered.find(isError);
  const avgElapsed = (() => {
    const with_ms = filtered.filter(e => e.elapsed_ms != null);
    return with_ms.length > 0
      ? Math.round(with_ms.reduce((s, e) => s + (e.elapsed_ms ?? 0), 0) / with_ms.length)
      : null;
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0">
          <Shield className="h-6 w-6 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-black">Auditoria das Postagens</h1>
          <p className="text-sm text-muted-foreground">Saúde operacional — campanhas executadas, grupos alcançados e resultados</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isLoading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Filtros de data */}
      <div className="flex flex-wrap items-center gap-2">
        {DATE_RANGES.map(r => (
          <button key={r.value} onClick={() => setDateRange(r.value)}
            className={cn("px-3 py-1 rounded-full text-xs font-medium border transition-colors",
              dateRange === r.value
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            )}
          >{r.label}</button>
        ))}
        {dateRange === "custom" && (
          <div className="flex items-center gap-1.5 ml-2">
            <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="h-7 text-xs w-32" />
            <span className="text-xs text-muted-foreground">até</span>
            <Input type="date" value={customEnd}   onChange={e => setCustomEnd(e.target.value)}   className="h-7 text-xs w-32" />
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <KpiCard label="Total"          value={total}      icon={Send}        color="text-primary"     loading={isLoading} />
        <KpiCard label="Enviadas"       value={successes}  icon={CheckCircle2} color="text-green-600" loading={isLoading} />
        <KpiCard label="Falhas"         value={errors}     icon={XCircle}     color="text-red-600"     loading={isLoading} />
        <KpiCard label="Taxa de Sucesso" value={`${rate}%`} icon={TrendingUp}  color={rate >= 90 ? "text-green-600" : rate >= 70 ? "text-amber-600" : "text-red-600"} loading={isLoading} />
        <KpiCard label="Tempo Médio"    value={avgElapsed != null ? `${avgElapsed}ms` : "—"} icon={Timer} color="text-blue-600" loading={isLoading} />
        <KpiCard label="Grupos"         value={groupStats.length} icon={Users} color="text-violet-600" />
      </div>

      {/* Status rápido */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className={cn("flex items-center gap-3 p-3 rounded-xl border",
          lastOk ? "bg-green-500/5 border-green-500/20" : "bg-muted/20 border-border/40"
        )}>
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-green-700">Última postagem bem-sucedida</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {lastOk
                ? `${lastOk.group_name ?? "—"} — ${format(new Date(lastOk.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}`
                : "Nenhuma no período"}
            </p>
          </div>
        </div>
        <div className={cn("flex items-center gap-3 p-3 rounded-xl border",
          lastErr ? "bg-red-500/5 border-red-500/20" : "bg-muted/20 border-border/40"
        )}>
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-red-700">Última falha registrada</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {lastErr
                ? `${lastErr.error_message ?? lastErr.group_name ?? "—"} — ${format(new Date(lastErr.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}`
                : "Nenhuma no período"}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/60">
        {([
          { id: "historico", label: "Histórico", icon: FileText },
          { id: "stats",     label: "Gráficos",  icon: BarChart3 },
          { id: "grupos",    label: "Por Grupo",  icon: Users },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: Histórico */}
      {activeTab === "historico" && (
        <div className="space-y-3">
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar campanha, grupo, usuário..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <select value={profileFilter} onChange={e => setProfile(e.target.value)}
              className="h-8 px-2 rounded-md border border-border bg-background text-xs">
              {PROFILE_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatus(e.target.value)}
              className="h-8 px-2 rounded-md border border-border bg-background text-xs">
              {STATUS_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
              onClick={() => exportCsv(filtered)} disabled={filtered.length === 0}>
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {filtered.length} registro{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
            {filtered.length !== entries.length && ` (de ${entries.length} no período)`}
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <Shield className="h-10 w-10 opacity-20 mb-3" />
              <p className="text-sm font-medium">Nenhum registro encontrado</p>
              <p className="text-xs mt-1 opacity-70">
                {entries.length === 0
                  ? "Execute a migration SQL para ativar a auditoria automática."
                  : "Tente ajustar os filtros."}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs">Data / Hora</TableHead>
                    <TableHead className="text-xs">Perfil</TableHead>
                    <TableHead className="text-xs">Grupo</TableHead>
                    <TableHead className="text-xs">Campanha</TableHead>
                    <TableHead className="text-xs">Resultado</TableHead>
                    <TableHead className="text-xs">Tempo</TableHead>
                    <TableHead className="w-6" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(e => <AuditRow key={e.id} entry={e} />)}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* TAB: Stats */}
      {activeTab === "stats" && <StatsCharts data={filtered} />}

      {/* TAB: Grupos */}
      {activeTab === "grupos" && <GroupStatsSection groups={groupStats} />}

      {/* Nota sobre a migration */}
      {entries.length === 0 && !isLoading && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-amber-700">Migration pendente</p>
              <p className="text-muted-foreground mt-1">
                Execute o arquivo <code className="bg-amber-500/10 px-1 rounded">supabase/migrations/20260629_posting_audit_trail.sql</code> no
                SQL Editor do Supabase para ativar a auditoria automática.
                Após a migration, toda postagem será registrada automaticamente via trigger de banco de dados.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
