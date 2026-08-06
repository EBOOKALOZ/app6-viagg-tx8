/**
 * ORION-QA Fase 2 — chip de Prioridade IA (score 0–100 + nível + cor dinâmica).
 * Tooltip mostra a composição do score (transparência do motor de regras).
 */
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { QA_PRIORITY_LEVEL_COLORS, type QaPriorityScore } from "@/services/qa/priorityScore";

interface QaPriorityBadgeProps {
  result: QaPriorityScore;
  /** compacto = só "97/100"; completo = "97/100 · Crítica" */
  compact?: boolean;
}

export function QaPriorityBadge({ result, compact = false }: QaPriorityBadgeProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`${QA_PRIORITY_LEVEL_COLORS[result.level]} font-mono text-[11px] cursor-default`}
          >
            {result.score}/100{compact ? "" : ` · ${result.label}`}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[240px]">
          <p className="font-semibold text-xs mb-1">Composição do score</p>
          <ul className="text-xs space-y-0.5">
            {result.breakdown.map((item) => (
              <li key={item.factor} className="flex justify-between gap-3">
                <span>{item.factor}</span>
                {item.points > 0 && <span className="font-mono">+{item.points}</span>}
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
