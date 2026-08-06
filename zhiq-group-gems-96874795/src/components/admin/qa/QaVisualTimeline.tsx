/**
 * ORION-QA Fase 2 — Timeline visual do ciclo de vida.
 * Stepper gráfico Criado → Em análise → Desenvolvimento → Homologação →
 * Resolvido → Fechado com data/hora, usuário, ícone e cor por etapa;
 * reaberturas aparecem como marcador de alerta.
 */
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CheckCircle2,
  CircleDot,
  FilePlus2,
  FlaskConical,
  Hammer,
  Lock,
  RotateCcw,
  SearchCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { QaIssueHistory } from "@/services/qa/types";

interface QaVisualTimelineProps {
  history: QaIssueHistory[]; // qualquer ordem
  currentStatus: string;
  /** resolve nome do autor (actor_id → nome) */
  actorName: (userId: string | null) => string;
}

interface Stage {
  key: string;
  title: string;
  statuses: string[];
  icon: React.ElementType;
  doneClass: string;
}

const STAGES: Stage[] = [
  { key: "criado", title: "Criado", statuses: ["novo"], icon: FilePlus2, doneClass: "bg-blue-500 border-blue-500" },
  { key: "analise", title: "Em análise", statuses: ["em_analise"], icon: SearchCheck, doneClass: "bg-yellow-500 border-yellow-500" },
  { key: "desenvolvimento", title: "Desenvolvimento", statuses: ["em_desenvolvimento", "aguardando_teste"], icon: Hammer, doneClass: "bg-orange-500 border-orange-500" },
  { key: "homologacao", title: "Homologação", statuses: ["em_homologacao"], icon: FlaskConical, doneClass: "bg-cyan-600 border-cyan-600" },
  { key: "resolvido", title: "Resolvido", statuses: ["homologado"], icon: CheckCircle2, doneClass: "bg-green-600 border-green-600" },
  { key: "fechado", title: "Fechado", statuses: ["fechado"], icon: Lock, doneClass: "bg-gray-500 border-gray-500" },
];

interface StageHit {
  at: string;
  actor: string | null;
}

export function QaVisualTimeline({ history, currentStatus, actorName }: QaVisualTimelineProps) {
  const events = [...history]
    .filter((h) => ["criacao", "mudanca_status", "fechamento", "reabertura"].includes(h.event_type))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Última vez que cada etapa foi alcançada
  const hits = new Map<string, StageHit>();
  const reopenings: { at: string; actor: string | null }[] = [];
  for (const event of events) {
    if (event.event_type === "reabertura") {
      reopenings.push({ at: event.created_at, actor: event.actor_id });
    }
    const status = event.new_value;
    if (!status) continue;
    const stage = STAGES.find((s) => s.statuses.includes(status));
    if (stage) hits.set(stage.key, { at: event.created_at, actor: event.actor_id });
  }

  const currentStageIdx = STAGES.findIndex((s) => s.statuses.includes(currentStatus));
  const isReopened = currentStatus === "reaberto";

  return (
    <div className="space-y-4">
      {isReopened && (
        <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          <RotateCcw className="h-4 w-4 shrink-0" />
          Problema <strong>reaberto</strong> — o ciclo recomeça a partir da análise.
        </div>
      )}
      <ol className="flex flex-col md:flex-row md:items-stretch gap-0">
        {STAGES.map((stage, idx) => {
          const hit = hits.get(stage.key);
          const isCurrent = idx === currentStageIdx;
          const reached = !!hit || isCurrent;
          const Icon = reached ? stage.icon : CircleDot;
          return (
            <li key={stage.key} className="relative flex md:flex-col items-start md:items-center flex-1 min-w-0 pb-6 md:pb-0">
              {/* conector */}
              {idx < STAGES.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute bg-border",
                    "left-[15px] top-8 h-full w-0.5 md:left-1/2 md:top-4 md:h-0.5 md:w-full",
                    (hits.get(STAGES[idx + 1].key) || currentStageIdx > idx) && "bg-primary/50",
                  )}
                />
              )}
              <span
                className={cn(
                  "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-white",
                  reached ? stage.doneClass : "bg-muted border-border text-muted-foreground",
                  isCurrent && "ring-2 ring-primary ring-offset-2",
                )}
                title={stage.title}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="ml-3 md:ml-0 md:mt-2 md:text-center min-w-0">
                <p className={cn("text-xs font-semibold", reached ? "text-foreground" : "text-muted-foreground")}>
                  {stage.title}
                </p>
                {hit ? (
                  <>
                    <p className="text-[11px] text-muted-foreground">
                      {format(new Date(hit.at), "dd/MM/yyyy", { locale: ptBR })}
                      {" · "}
                      {format(new Date(hit.at), "HH:mm", { locale: ptBR })}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate" title={actorName(hit.actor)}>
                      {actorName(hit.actor)}
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground/60 italic">
                    {isCurrent ? "etapa atual" : "pendente"}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {reopenings.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          <RotateCcw className="h-3 w-3 inline mr-1" />
          {reopenings.length} reabertura(s):{" "}
          {reopenings
            .map((r) => `${format(new Date(r.at), "dd/MM HH:mm", { locale: ptBR })} (${actorName(r.actor)})`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
