import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity, Search, Filter, RefreshCw, ChevronDown, ChevronUp,
  Clock, AlertCircle, CheckCircle2, ListOrdered, Loader2,
  Eye, ArrowUp, ArrowDown, Minus, Calendar, Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useAdvertiserCampaignsMonitor,
  useCampaignQueueStatus,
  useCampaignTimeline,
  MONITOR_STATUS_CONFIG,
  type CampaignMonitorItem,
} from "@/hooks/usePostingMonitor";
import { CampaignPipelineFlow } from "@/components/monitor/CampaignPipelineFlow";
import { CampaignTimelineView } from "@/components/monitor/CampaignTimelineView";
import { AIDecisionButton } from "@/components/monitor/AIDecisionModal";

// ── Status filter options ─────────────────────────────────────

const STATUS_FILTERS = [
  { value: "all",       label: "Todos"       },
  { value: "queued",    label: "Na Fila"     },
  { value: "generating",label: "Gerando"      },
  { value: "posting",   label: "Publicando"  },
  { value: "completed", label: "Concluídas"  },
  { value: "error",     label: "Com Erro"    },
  { value: "paused",    label: "Pausadas"    },
];

// ── Queue position badge ──────────────────────────────────────

function QueueBadge({ position, prev }: { position: number | null; prev?: number | null }) {
  if (!position) return null;
  const moved = prev != null && prev !== position ? (position < prev ? "up" : "down") : null;
  return (
    <div className="flex items-center gap-1">
      <div className="bg-amber-500/15 border border-amber-500/30 rounded px-2 py-0.5 flex items-center gap-1">
        <ListOrdered className="w-3 h-3 text-amber-400" />
        <span className="text-[12px] font-mono font-bold text-amber-400">#{position}</span>
      </div>
      {moved === "up"   && <ArrowUp   className="w-3 h-3 text-emerald-400" />}
      {moved === "down" && <ArrowDown className="w-3 h-3 text-red-400"     />}
      {!moved           && prev != null && <Minus className="w-3 h-3 text-zinc-600" />}
    </div>
  );
}

// ── Campaign Detail Panel ─────────────────────────────────────

function CampaignDetailPanel({ campaign }: { campaign: CampaignMonitorItem }) {
  const [tab, setTab] = useState<"pipeline" | "timeline" | "queue">("pipeline");

  const { data: queueStatus, isLoading: qLoading } = useCampaignQueueStatus(campaign.id);
  const { data: timeline = [], isLoading: tLoading } = useCampaignTimeline(
    tab === "timeline" ? campaign.id : null
  );

  return (
    <div className="border-t border-zinc-800 bg-zinc-950/60">
      {/* Tabs */}
      <div className="flex gap-0 border-b border-zinc-800">
        {(["pipeline", "timeline", "queue"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-[12px] font-medium transition-colors border-b-2 -mb-px",
              tab === t
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            )}
          >
            {t === "pipeline" && "Pipeline"}
            {t === "timeline" && "Linha do Tempo"}
            {t === "queue"    && "Posição na Fila"}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* Pipeline tab */}
        {tab === "pipeline" && (
          <div className="space-y-4">
            <CampaignPipelineFlow status={campaign.status} />

            {/* Stage info cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Criado em",     value: format(new Date(campaign.created_at), "dd/MM HH:mm", { locale: ptBR }) },
                { label: "Iniciado em",   value: campaign.started_at   ? format(new Date(campaign.started_at),   "dd/MM HH:mm", { locale: ptBR }) : "—" },
                { label: "Concluído em",  value: campaign.completed_at ? format(new Date(campaign.completed_at), "dd/MM HH:mm", { locale: ptBR }) : "—" },
                { label: "Retentativas",  value: campaign.retry_count > 0 ? `${campaign.retry_count}x` : "Nenhuma" },
              ].map(({ label, value }) => (
                <div key={label} className="bg-zinc-900 rounded p-2.5">
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wide">{label}</div>
                  <div className="text-[13px] text-zinc-300 font-mono mt-0.5">{value}</div>
                </div>
              ))}
            </div>

            {campaign.final_error && (
              <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-900/50 rounded text-sm text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium mb-0.5">Motivo do erro</div>
                  <div className="text-xs text-red-400/80">{campaign.final_error}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Timeline tab */}
        {tab === "timeline" && (
          <CampaignTimelineView events={timeline} isLoading={tLoading} />
        )}

        {/* Queue tab */}
        {tab === "queue" && (
          <div className="space-y-4">
            {qLoading && (
              <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
              </div>
            )}

            {queueStatus && (
              <>
                {/* Queue stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: "Posição atual",    value: `#${queueStatus.queue_position}`,          hl: true  },
                    { label: "Total na fila",    value: `${queueStatus.total_in_queue} anúncios`,  hl: false },
                    { label: "Score final",      value: `${queueStatus.priority_score} pts`,       hl: false },
                    { label: "Saldo créditos",   value: queueStatus.credits_available ?? "—",     hl: false },
                  ].map(({ label, value, hl }) => (
                    <div key={label} className={cn("rounded p-2.5", hl ? "bg-amber-500/10 border border-amber-500/20" : "bg-zinc-900")}>
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wide">{label}</div>
                      <div className={cn("text-[14px] font-mono font-bold mt-0.5", hl ? "text-amber-400" : "text-zinc-300")}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Priority breakdown */}
                {queueStatus.criteria_json?.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                      Composição do score
                    </div>
                    <div className="space-y-1.5">
                      {queueStatus.criteria_json.map((c, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-28 text-[11px] text-zinc-500 truncate">{c.label}</div>
                          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full">
                            <div
                              className={cn("h-full rounded-full", c.positive ? "bg-emerald-500" : "bg-red-500")}
                              style={{ width: `${Math.min(100, (c.contribution / 100) * 100)}%` }}
                            />
                          </div>
                          <div className="text-[11px] font-mono text-zinc-400 w-14 text-right">
                            {c.contribution > 0 ? "+" : ""}{c.contribution} pts
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Estimated time */}
                {queueStatus.estimated_publish_at && (
                  <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded p-2.5">
                    <Clock className="w-4 h-4 flex-shrink-0" />
                    Estimativa de publicação:{" "}
                    <strong className="font-mono">
                      {format(new Date(queueStatus.estimated_publish_at), "dd/MM HH:mm", { locale: ptBR })}
                    </strong>
                  </div>
                )}

                {/* Plan info */}
                <div className="flex flex-wrap gap-2 text-[12px] text-zinc-500">
                  <span className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1">
                    Plano: <strong className="text-zinc-300">{queueStatus.plan_level ?? "—"}</strong>
                  </span>
                  <span className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1">
                    Limite diário: <strong className="text-zinc-300">{queueStatus.daily_limit ?? "—"}</strong>
                  </span>
                  <span className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1">
                    Publicados hoje: <strong className="text-zinc-300">{queueStatus.daily_used ?? 0}</strong>
                  </span>
                </div>

                {/* AI Decision button */}
                <AIDecisionButton campaignId={campaign.id} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Campaign Card ─────────────────────────────────────────────

function CampaignCard({ campaign }: { campaign: CampaignMonitorItem }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = MONITOR_STATUS_CONFIG[campaign.status] ?? MONITOR_STATUS_CONFIG.draft;

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-zinc-800/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Status dot */}
        <div className={cn("w-2 h-2 rounded-full flex-shrink-0", cfg.dot)} />

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-medium text-zinc-200 truncate">
              {campaign.name || "Campanha sem nome"}
            </span>
            <span className={cn("chip text-[11px] font-mono px-1.5 py-0.5 rounded", cfg.bg, cfg.color)}>
              {cfg.label}
            </span>
            {campaign.priority && campaign.priority !== "normal" && (
              <span className="text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded font-mono">
                {campaign.priority}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[11px] text-zinc-600 font-mono">
              {format(new Date(campaign.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
            </span>
            {campaign.priority_score > 0 && (
              <span className="text-[11px] text-zinc-600">
                Score: <span className="text-zinc-400">{campaign.priority_score}</span>
              </span>
            )}
          </div>
        </div>

        {/* Queue position */}
        {campaign.queue_position != null && (
          <QueueBadge position={campaign.queue_position} />
        )}

        {/* Pipeline compact */}
        <div className="hidden sm:block">
          <CampaignPipelineFlow status={campaign.status} compact />
        </div>

        {/* Expand toggle */}
        <div className="flex-shrink-0 text-zinc-600">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* Estimated time strip */}
      {campaign.estimated_at && campaign.status !== "completed" && (
        <div className="px-4 pb-2 flex items-center gap-1.5 text-[11px] text-amber-400/70">
          <Clock className="w-3 h-3" />
          Estimativa de publicação:{" "}
          <span className="font-mono">{format(new Date(campaign.estimated_at), "dd/MM HH:mm", { locale: ptBR })}</span>
        </div>
      )}

      {/* Expanded panel */}
      {expanded && <CampaignDetailPanel campaign={campaign} />}
    </div>
  );
}

// ── KPI bar ───────────────────────────────────────────────────

function KpiBar({ total, items }: { total: number; items: CampaignMonitorItem[] }) {
  const byStatus = (s: string) => items.filter(c => c.status === s).length;
  const inQueue  = items.filter(c => ["ready","queued","generating","waiting","posting"].includes(c.status)).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {[
        { label: "Total",      value: total,              icon: <Activity className="w-3.5 h-3.5" />,      hl: false },
        { label: "Na Fila",    value: inQueue,            icon: <ListOrdered className="w-3.5 h-3.5" />,   hl: inQueue > 0 },
        { label: "Publicando", value: byStatus("posting"),icon: <Zap className="w-3.5 h-3.5" />,           hl: byStatus("posting") > 0 },
        { label: "Concluídas", value: byStatus("completed"),icon: <CheckCircle2 className="w-3.5 h-3.5" />,hl: false },
      ].map(({ label, value, icon, hl }) => (
        <div key={label} className={cn("rounded p-3 border", hl ? "bg-amber-500/10 border-amber-500/20" : "bg-zinc-900 border-zinc-800")}>
          <div className={cn("flex items-center gap-1.5 text-[10px] uppercase tracking-wide mb-1", hl ? "text-amber-400" : "text-zinc-500")}>
            {icon}{label}
          </div>
          <div className={cn("text-xl font-bold font-mono", hl ? "text-amber-400" : "text-zinc-200")}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function AdvertiserPostingMonitorPage() {
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatus] = useState("all");

  const statusArray = statusFilter === "all" ? undefined : [statusFilter];
  const { data, isLoading, refetch, isFetching } = useAdvertiserCampaignsMonitor({ status: statusArray });

  const items = (data?.items ?? []).filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-400" />
              <h1 className="text-lg font-bold text-zinc-100">Monitor de Divulgação</h1>
              {isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />}
            </div>
            <p className="text-[12px] text-zinc-500 mt-0.5">
              Acompanhe o ciclo completo dos seus anúncios em tempo real
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] text-zinc-500">ao vivo</span>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="ml-1 h-7 px-2 text-zinc-500">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* KPI bar */}
        {data && <KpiBar total={data.total} items={data.items} />}

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <Input
              placeholder="Buscar campanha…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm bg-zinc-900 border-zinc-800 text-zinc-200 placeholder:text-zinc-600"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-36 text-sm bg-zinc-900 border-zinc-800 text-zinc-200">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-zinc-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              {STATUS_FILTERS.map(f => (
                <SelectItem key={f.value} value={f.value} className="text-sm text-zinc-300">
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Campaign list */}
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-12 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Carregando campanhas…</span>
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-zinc-500">
            <Eye className="w-8 h-8 text-zinc-700" />
            <p className="text-sm">
              {search || statusFilter !== "all"
                ? "Nenhuma campanha encontrada com esses filtros."
                : "Você ainda não tem campanhas de divulgação."}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {items.map(c => <CampaignCard key={c.id} campaign={c} />)}
        </div>

      </div>
    </div>
  );
}
