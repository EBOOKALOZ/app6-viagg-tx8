import { CheckCircle2, Circle, Loader2, AlertCircle, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Stage {
  key: string;
  label: string;
}

const STAGES: Stage[] = [
  { key: "queued",           label: "Na Fila"        },
  { key: "in_analysis",      label: "Análise IA"     },
  { key: "approved",         label: "Aprovado"       },
  { key: "scheduling",       label: "Scheduler"      },
  { key: "sent_to_postador", label: "Enviado"        },
  { key: "publishing",       label: "Publicando"     },
  { key: "published",        label: "Publicado"      },
];

const ACTIVE_STAGES_BY_STATUS: Record<string, string> = {
  ready:      "queued",
  queued:     "queued",
  generating: "in_analysis",
  waiting:    "scheduling",
  posting:    "publishing",
  completed:  "published",
};

function stageIndex(key: string) {
  return STAGES.findIndex(s => s.key === key);
}

interface Props {
  status: string;
  currentStage?: string;
  compact?: boolean;
}

export function CampaignPipelineFlow({ status, currentStage, compact = false }: Props) {
  const isError    = status === "error";
  const isPaused   = status === "paused";
  const isCancelled = status === "cancelled" || status === "expired";

  const activeKey  = currentStage ?? ACTIVE_STAGES_BY_STATUS[status] ?? "queued";
  const activeIdx  = stageIndex(activeKey);
  const isComplete = status === "completed";

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {STAGES.map((s, i) => {
          const done    = isComplete || i < activeIdx;
          const active  = i === activeIdx && !isError && !isPaused && !isCancelled;
          const errored = isError && i === activeIdx;
          const paused  = isPaused && i === activeIdx;
          return (
            <div key={s.key} className="flex items-center gap-1">
              <div className={cn(
                "h-1.5 w-4 rounded-full transition-colors",
                done      && "bg-emerald-500",
                active    && "bg-amber-400 animate-pulse",
                errored   && "bg-red-500",
                paused    && "bg-zinc-500",
                !done && !active && !errored && !paused && "bg-zinc-700"
              )} />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-start min-w-max gap-0">
        {STAGES.map((s, i) => {
          const done    = isComplete || i < activeIdx;
          const active  = i === activeIdx && !isError && !isPaused && !isCancelled;
          const errored = isError && i === activeIdx;
          const paused  = isPaused && i === activeIdx;
          const future  = i > activeIdx || (isCancelled && !done);
          const isLast  = i === STAGES.length - 1;

          return (
            <div key={s.key} className="flex items-center">
              {/* Node */}
              <div className="flex flex-col items-center gap-1">
                <div className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-full border-2 transition-all",
                  done     && "border-emerald-500 bg-emerald-500/15",
                  active   && "border-amber-400 bg-amber-400/15",
                  errored  && "border-red-500 bg-red-500/15",
                  paused   && "border-zinc-500 bg-zinc-800",
                  future   && "border-zinc-700 bg-zinc-900",
                )}>
                  {done    && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  {active  && <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
                  {errored && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                  {paused  && <PauseCircle className="w-3.5 h-3.5 text-zinc-400" />}
                  {future  && <Circle className="w-3.5 h-3.5 text-zinc-700" />}
                </div>
                <span className={cn(
                  "text-[10px] font-medium text-center w-16 leading-tight",
                  done    && "text-emerald-400",
                  active  && "text-amber-400",
                  errored && "text-red-400",
                  future  && "text-zinc-600",
                  paused  && "text-zinc-500",
                )}>
                  {s.label}
                </span>
              </div>

              {/* Connector */}
              {!isLast && (
                <div className={cn(
                  "h-0.5 w-8 mt-[-1rem]",
                  done  ? "bg-emerald-500/50" : "bg-zinc-700"
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
