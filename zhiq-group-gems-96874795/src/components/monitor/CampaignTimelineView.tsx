import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CheckCircle2, AlertCircle, Loader2, Brain, Clock,
  Send, Zap, List, Eye, MousePointerClick, BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineEvent } from "@/hooks/usePostingMonitor";

function eventIcon(event: TimelineEvent) {
  const cls = "w-3.5 h-3.5";
  if (event.error)                          return <AlertCircle className={cn(cls, "text-red-400")} />;
  if (event.stage === "published")          return <CheckCircle2 className={cn(cls, "text-emerald-400")} />;
  if (event.stage === "publishing")         return <Zap className={cn(cls, "text-amber-400")} />;
  if (event.stage === "sent_to_postador")   return <Send className={cn(cls, "text-sky-400")} />;
  if (event.event_type === "ai_call")       return <Brain className={cn(cls, "text-violet-400")} />;
  if (event.event_type === "ai_decision")   return <Brain className={cn(cls, "text-purple-400")} />;
  if (event.event_type === "view")          return <Eye className={cn(cls, "text-zinc-400")} />;
  if (event.event_type === "click")         return <MousePointerClick className={cn(cls, "text-blue-400")} />;
  if (event.stage === "queued")             return <List className={cn(cls, "text-amber-400")} />;
  if (event.stage === "in_analysis")        return <Brain className={cn(cls, "text-violet-400 animate-pulse")} />;
  if (event.stage === "scheduling")         return <Clock className={cn(cls, "text-sky-400")} />;
  return <BarChart2 className={cn(cls, "text-zinc-400")} />;
}

function dotColor(event: TimelineEvent): string {
  if (event.error)                        return "bg-red-500";
  if (event.stage === "published")        return "bg-emerald-500";
  if (event.stage === "publishing")       return "bg-amber-400";
  if (event.stage === "sent_to_postador") return "bg-sky-400";
  if (event.event_type === "ai_call")     return "bg-violet-500";
  if (event.event_type === "ai_decision") return "bg-purple-500";
  return "bg-zinc-600";
}

function fmtDuration(ms: number | null): string {
  if (!ms || ms < 0) return "";
  if (ms < 1000)     return `${ms}ms`;
  if (ms < 60_000)   return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}min`;
}

interface Props {
  events: TimelineEvent[];
  isLoading?: boolean;
}

export function CampaignTimelineView({ events, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-zinc-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Carregando linha do tempo…
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="py-6 text-sm text-zinc-500 text-center">
        Nenhum evento registrado ainda.
      </div>
    );
  }

  return (
    <div className="relative pl-5">
      {/* Vertical line */}
      <div className="absolute left-[9px] top-0 bottom-0 w-px bg-zinc-800" />

      <div className="space-y-0">
        {events.map((ev, i) => {
          const isLast = i === events.length - 1;
          const ts = new Date(ev.occurred_at);

          return (
            <div key={i} className="relative flex gap-3 pb-4">
              {/* Dot */}
              <div className={cn(
                "absolute left-[-16px] top-1 w-2 h-2 rounded-full border border-zinc-900 flex-shrink-0",
                dotColor(ev)
              )} />

              {/* Content */}
              <div className={cn(
                "flex-1 min-w-0",
                !isLast && "border-b border-zinc-800/60 pb-3"
              )}>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {eventIcon(ev)}
                    <span className="text-[13px] font-medium text-zinc-200 truncate">
                      {ev.title}
                    </span>
                    {ev.duration_ms != null && ev.duration_ms > 0 && (
                      <span className="text-[11px] text-zinc-600 ml-1 flex-shrink-0">
                        {fmtDuration(ev.duration_ms)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    <span className="text-[11px] font-mono text-zinc-500">
                      {format(ts, "HH:mm:ss", { locale: ptBR })}
                    </span>
                    <span className="text-[10px] text-zinc-700">
                      {format(ts, "dd/MM/yy", { locale: ptBR })}
                    </span>
                  </div>
                </div>

                {ev.notes && (
                  <p className="mt-0.5 text-[12px] text-zinc-500 leading-relaxed">
                    {ev.notes}
                  </p>
                )}

                {ev.error && (
                  <p className="mt-1 text-[12px] text-red-400 leading-relaxed">
                    ⚠ {ev.error}
                  </p>
                )}

                {/* Responsible badge */}
                {ev.responsible && ev.responsible !== "system" && (
                  <span className="mt-1 inline-block text-[10px] font-mono text-zinc-600 border border-zinc-800 rounded px-1.5 py-0.5">
                    {ev.responsible}
                  </span>
                )}

                {/* AI Decision metadata */}
                {ev.event_type === "ai_decision" && ev.metadata?.position && (
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                    {[
                      { l: "Posição",   v: `${ev.metadata.position}/${ev.metadata.total}` },
                      { l: "Score",     v: `${ev.metadata.score} pts`  },
                      { l: "Plano",     v: ev.metadata.plan_level as string ?? "—" },
                    ].map(({ l, v }) => (
                      <div key={l} className="bg-zinc-900 rounded px-2 py-1">
                        <div className="text-[10px] text-zinc-600">{l}</div>
                        <div className="text-[12px] text-zinc-300 font-mono">{v}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* AI Call metadata */}
                {ev.event_type === "ai_call" && ev.metadata?.model && (
                  <div className="mt-1 flex gap-2 flex-wrap">
                    <span className="text-[10px] font-mono text-violet-400/70">
                      {ev.metadata.model as string}
                    </span>
                    {ev.metadata.latency_ms && (
                      <span className="text-[10px] text-zinc-600">
                        {fmtDuration(ev.metadata.latency_ms as number)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
