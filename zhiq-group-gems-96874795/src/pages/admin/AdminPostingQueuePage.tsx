import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity, RefreshCw, Loader2, ListOrdered, Zap, CheckCircle2,
  AlertCircle, PauseCircle, Clock, TrendingUp, Users, BarChart2,
  ChevronDown, ChevronUp, Brain, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useAdminPostingQueue,
  MONITOR_STATUS_CONFIG,
  type AdminQueueItem,
} from "@/hooks/usePostingMonitor";
import { CampaignPipelineFlow } from "@/components/monitor/CampaignPipelineFlow";
import { AIDecisionButton } from "@/components/monitor/AIDecisionModal";

// ── Admin KPI strip ───────────────────────────────────────────

function AdminKpiStrip({ items, total }: { items: AdminQueueItem[]; total: number }) {
  const active  = items.filter(c => ["queued","generating","posting","waiting"].includes(c.status)).length;
  const posting = items.filter(c => c.status === "posting").length;
  const errors  = items.filter(c => c.status === "error").length;
  const avgScore = items.length
    ? Math.round(items.reduce((s, c) => s + c.priority_score, 0) / items.length)
    : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {[
        { label: "Total na fila",   value: total,     icon: <ListOrdered className="w-4 h-4" />, hl: false, color: "text-zinc-200"     },
        { label: "Em processamento",value: active,    icon: <Activity className="w-4 h-4" />,    hl: active > 0,  color: "text-amber-400"    },
        { label: "Publicando",      value: posting,   icon: <Zap className="w-4 h-4" />,         hl: posting > 0, color: "text-emerald-400"  },
        { label: "Com erro",        value: errors,    icon: <AlertCircle className="w-4 h-4" />, hl: errors > 0,  color: "text-red-400"      },
        { label: "Score médio",     value: avgScore,  icon: <TrendingUp className="w-4 h-4" />,  hl: false, color: "text-zinc-300"     },
      ].map(({ label, value, icon, hl, color }) => (
        <div key={label} className={cn(
          "rounded-lg p-3 border",
          hl ? "bg-zinc-800/80 border-zinc-700" : "bg-zinc-900 border-zinc-800"
        )}>
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
            {icon}{label}
          </div>
          <div className={cn("text-xl font-bold font-mono", color)}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Priority score bar ────────────────────────────────────────

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (score / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] font-mono text-zinc-400 w-10 text-right flex-shrink-0">
        {score}
      </span>
    </div>
  );
}

// ── Queue row ─────────────────────────────────────────────────

function QueueRow({
  item,
  maxScore,
  isExpanded,
  onToggle,
}: {
  item: AdminQueueItem;
  maxScore: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const cfg = MONITOR_STATUS_CONFIG[item.status] ?? MONITOR_STATUS_CONFIG.draft;

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      {/* Main row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-800/30 transition-colors"
        onClick={onToggle}
      >
        {/* Position */}
        <div className="w-8 text-center">
          <span className="text-[12px] font-mono font-bold text-amber-400">#{item.position}</span>
        </div>

        {/* Status dot */}
        <div className={cn("w-2 h-2 rounded-full flex-shrink-0", cfg.dot)} />

        {/* Name + user */}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-zinc-200 truncate">
            {item.name || "Sem nome"}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-zinc-600 font-mono">
              {item.user_id.slice(0, 8)}…
            </span>
            <span className={cn("text-[10px] font-mono px-1 py-0.5 rounded", cfg.bg, cfg.color)}>
              {cfg.label}
            </span>
            {item.plan_level && (
              <span className="text-[10px] text-zinc-600 font-mono bg-zinc-800 px-1 py-0.5 rounded">
                {item.plan_level}
              </span>
            )}
          </div>
        </div>

        {/* Score bar */}
        <div className="hidden sm:block w-32">
          <ScoreBar score={item.priority_score} max={maxScore} />
        </div>

        {/* Starvation */}
        {item.starvation_ticks > 0 && (
          <div className="hidden md:flex items-center gap-1 text-[11px] text-rose-400">
            <Clock className="w-3 h-3" />
            {item.starvation_ticks}t
          </div>
        )}

        {/* Pipeline compact */}
        <div className="hidden lg:block">
          <CampaignPipelineFlow status={item.status} compact />
        </div>

        {/* Estimate */}
        {item.estimated_at && (
          <div className="hidden md:flex items-center gap-1 text-[11px] text-amber-400/70">
            <Clock className="w-3 h-3" />
            {format(new Date(item.estimated_at), "HH:mm", { locale: ptBR })}
          </div>
        )}

        {/* Expand */}
        <div className="text-zinc-600 flex-shrink-0">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-zinc-800 bg-zinc-950/60 p-4 space-y-4">
          {/* Full pipeline */}
          <CampaignPipelineFlow status={item.status} />

          {/* Metadata grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Score",          value: `${item.priority_score} pts`     },
              { label: "Starvation",     value: `${item.starvation_ticks} ticks` },
              { label: "Créditos",       value: item.credits_available ?? "—"    },
              { label: "Limite diário",  value: item.daily_limit ?? "—"          },
              { label: "Usados hoje",    value: item.daily_used ?? 0             },
              { label: "Criado em",      value: format(new Date(item.created_at), "dd/MM HH:mm", { locale: ptBR }) },
              { label: "Iniciado em",    value: item.started_at ? format(new Date(item.started_at), "dd/MM HH:mm", { locale: ptBR }) : "—" },
              { label: "ID",             value: item.id.slice(0, 12) + "…"       },
            ].map(({ label, value }) => (
              <div key={label} className="bg-zinc-900 rounded p-2">
                <div className="text-[10px] text-zinc-600 uppercase tracking-wide">{label}</div>
                <div className="text-[12px] font-mono text-zinc-300 mt-0.5">{value}</div>
              </div>
            ))}
          </div>

          {/* Last AI explanation */}
          {item.explanation && (
            <div className="text-[12px] text-violet-400/80 bg-violet-950/20 border border-violet-900/30 rounded p-3 flex items-start gap-2">
              <Brain className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
              {item.explanation}
            </div>
          )}

          <AIDecisionButton campaignId={item.id} className="text-xs" />
        </div>
      )}
    </div>
  );
}

// ── Sort config ───────────────────────────────────────────────

type SortKey = "position" | "score" | "starvation" | "created";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "position",   label: "Posição"     },
  { value: "score",      label: "Score"       },
  { value: "starvation", label: "Starvation"  },
  { value: "created",    label: "Mais antigo" },
];

// ── Status filter ─────────────────────────────────────────────

const STATUS_OPTS = [
  { value: "all",        label: "Todos os status" },
  { value: "queued",     label: "Na fila"         },
  { value: "generating", label: "Gerando IA"      },
  { value: "posting",    label: "Publicando"      },
  { value: "waiting",    label: "Aguardando"      },
  { value: "error",      label: "Com erro"        },
  { value: "paused",     label: "Pausados"        },
];

// ── Main Page ─────────────────────────────────────────────────

export default function AdminPostingQueuePage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey]        = useState<SortKey>("position");
  const [statusFilter, setStatus]    = useState("all");
  const [limit, setLimit]            = useState(50);

  const { data, isLoading, refetch, isFetching } = useAdminPostingQueue(limit);

  const rawItems = data?.items ?? [];

  // client-side filter + sort
  const items = [...rawItems]
    .filter(c => statusFilter === "all" || c.status === statusFilter)
    .sort((a, b) => {
      if (sortKey === "position")   return a.position - b.position;
      if (sortKey === "score")      return b.priority_score - a.priority_score;
      if (sortKey === "starvation") return b.starvation_ticks - a.starvation_ticks;
      if (sortKey === "created")    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return 0;
    });

  const maxScore = Math.max(...items.map(c => c.priority_score), 1);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-amber-400" />
              <h1 className="text-lg font-bold text-zinc-100">Fila de Postador — Admin</h1>
              {isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />}
            </div>
            <p className="text-[12px] text-zinc-500 mt-0.5">
              Visão completa da plataforma • Atualização automática a cada 15s
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] text-zinc-500">ao vivo</span>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-7 px-2 text-zinc-500">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* KPI strip */}
        {data && <AdminKpiStrip items={rawItems} total={data.total} />}

        {/* Filters + controls */}
        <div className="flex gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-40 text-sm bg-zinc-900 border-zinc-800 text-zinc-200">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-zinc-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              {STATUS_OPTS.map(o => (
                <SelectItem key={o.value} value={o.value} className="text-sm text-zinc-300">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-8 w-36 text-sm bg-zinc-900 border-zinc-800 text-zinc-200">
              <TrendingUp className="w-3.5 h-3.5 mr-1.5 text-zinc-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              {SORT_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value} className="text-sm text-zinc-300">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(limit)} onValueChange={v => setLimit(Number(v))}>
            <SelectTrigger className="h-8 w-24 text-sm bg-zinc-900 border-zinc-800 text-zinc-200">
              <Users className="w-3.5 h-3.5 mr-1.5 text-zinc-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              {[25, 50, 100].map(n => (
                <SelectItem key={n} value={String(n)} className="text-sm text-zinc-300">
                  Top {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filter summary */}
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-600 self-center ml-1">
            Exibindo <strong className="text-zinc-400">{items.length}</strong> de{" "}
            <strong className="text-zinc-400">{data?.total ?? 0}</strong>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-16 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Carregando fila…</span>
          </div>
        )}

        {/* Empty */}
        {!isLoading && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-zinc-500">
            <CheckCircle2 className="w-8 h-8 text-zinc-700" />
            <p className="text-sm">
              {statusFilter !== "all"
                ? "Nenhuma campanha com esse status."
                : "A fila está vazia."}
            </p>
          </div>
        )}

        {/* Queue list */}
        <div className="space-y-2">
          {items.map(c => (
            <QueueRow
              key={c.id}
              item={c}
              maxScore={maxScore}
              isExpanded={expandedId === c.id}
              onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
            />
          ))}
        </div>

        {/* Load more */}
        {data && data.total > limit && (
          <div className="pt-2 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLimit(l => l + 50)}
              className="text-zinc-400 border-zinc-800"
            >
              Carregar mais {Math.min(50, data.total - limit)} itens
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
