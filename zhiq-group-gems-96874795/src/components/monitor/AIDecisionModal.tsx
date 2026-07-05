import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Brain, Loader2, AlertCircle, CheckCircle2, TrendingUp, Lightbulb, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAIDecisionExplainer } from "@/hooks/usePostingMonitor";
import type { AIDecisionResult, CriteriaItem } from "@/hooks/usePostingMonitor";

// ── CriteriaBar ───────────────────────────────────────────────

function CriteriaBar({ item }: { item: CriteriaItem }) {
  const pct = Math.min(100, Math.max(0, (item.contribution / 100) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 text-[11px] text-zinc-400 truncate flex-shrink-0" title={item.label}>
        {item.label}
      </div>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", item.positive ? "bg-emerald-500" : "bg-red-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-12 text-right text-[11px] font-mono text-zinc-400 flex-shrink-0">
        {item.contribution > 0 ? "+" : ""}{item.contribution} pts
      </div>
    </div>
  );
}

// ── Trigger Button ───────────────────────────────────────────

interface TriggerProps {
  campaignId: string;
  className?: string;
}

export function AIDecisionButton({ campaignId, className }: TriggerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn("gap-1.5 text-xs border-violet-800/50 text-violet-400 hover:bg-violet-900/20", className)}
      >
        <Brain className="w-3.5 h-3.5" />
        Como a IA decidiu?
      </Button>
      <AIDecisionModal
        campaignId={campaignId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

// ── Modal ─────────────────────────────────────────────────────

interface ModalProps {
  campaignId: string;
  open: boolean;
  onClose: () => void;
}

export function AIDecisionModal({ campaignId, open, onClose }: ModalProps) {
  const { mutate, data, isPending, error, reset } = useAIDecisionExplainer();
  const [showDetails, setShowDetails] = useState(false);

  function handleOpen() {
    if (!data && !isPending) {
      mutate(campaignId);
    }
  }

  // Trigger load when dialog opens
  if (open && !data && !isPending && !error) {
    handleOpen();
  }

  const result = data as AIDecisionResult | undefined;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); reset(); setShowDetails(false); } }}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Brain className="w-4 h-4 text-violet-400" />
            Como a IA decidiu?
          </DialogTitle>
        </DialogHeader>

        {isPending && (
          <div className="flex flex-col items-center gap-3 py-8 text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
            <p className="text-sm">Motor de IA gerando explicação…</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-950/40 rounded border border-red-900/50 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error.message}</span>
          </div>
        )}

        {result && !isPending && (
          <div className="space-y-4">
            {/* Position summary */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Posição",    value: `${result.queue_position}/${result.total_in_queue}` },
                { label: "Score",      value: `${result.priority_score} pts`                      },
                { label: "Estimativa", value: result.estimated_minutes
                  ? `~${result.estimated_minutes} min`
                  : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="bg-zinc-900 border border-zinc-800 rounded p-2 text-center">
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wide">{label}</div>
                  <div className="text-[13px] font-mono font-semibold text-zinc-200 mt-0.5">{value}</div>
                </div>
              ))}
            </div>

            {/* Explanation text */}
            {result.explanation && (
              <div className="bg-violet-950/30 border border-violet-900/40 rounded p-3">
                <p className="text-sm text-zinc-300 leading-relaxed">{result.explanation}</p>
              </div>
            )}

            {/* Highlights */}
            {result.highlights && result.highlights.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                  Pontos positivos
                </div>
                <ul className="space-y-1">
                  {result.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Tips */}
            {result.tips && result.tips.filter(Boolean).length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                  Como melhorar
                </div>
                <ul className="space-y-1">
                  {result.tips.filter(Boolean).map((t, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-amber-400">
                      <Lightbulb className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Criteria detail (expandable) */}
            {result.criteria_json && result.criteria_json.length > 0 && (
              <div>
                <button
                  className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  onClick={() => setShowDetails(!showDetails)}
                >
                  <TrendingUp className="w-3 h-3" />
                  Critérios detalhados
                  {showDetails
                    ? <ChevronUp className="w-3 h-3" />
                    : <ChevronDown className="w-3 h-3" />
                  }
                </button>
                {showDetails && (
                  <div className="mt-2 space-y-1.5">
                    {result.criteria_json.map((c, i) => (
                      <CriteriaBar key={i} item={c} />
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="text-[10px] text-zinc-700 border-t border-zinc-800 pt-3">
              Explicação gerada pelo Motor Central de IA da Viagg. Critérios sem dados históricos não são considerados.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
