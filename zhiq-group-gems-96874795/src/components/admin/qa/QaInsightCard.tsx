/**
 * ORION-QA Fase 2 — card "Análise Inteligente" (causa raiz por regras internas;
 * motor isolado em services/qa/insightEngine p/ futura troca por OpenAI).
 */
import { BrainCircuit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { QaInsight } from "@/services/qa/insightEngine";

const RISK_COLORS: Record<QaInsight["risk"], string> = {
  Baixo: "bg-green-100 text-green-800 border-green-300",
  Médio: "bg-yellow-100 text-yellow-800 border-yellow-300",
  Alto: "bg-orange-100 text-orange-800 border-orange-300",
  Crítico: "bg-red-100 text-red-800 border-red-300 font-bold",
};

const COMPLEXITY_COLORS: Record<QaInsight["complexity"], string> = {
  Baixa: "bg-green-100 text-green-800 border-green-300",
  Média: "bg-yellow-100 text-yellow-800 border-yellow-300",
  Alta: "bg-orange-100 text-orange-800 border-orange-300",
};

function InsightRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
      <div className="text-sm mt-0.5">{children}</div>
    </div>
  );
}

export function QaInsightCard({ insight }: { insight: QaInsight }) {
  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-primary" />
          Análise Inteligente
        </CardTitle>
        <CardDescription>
          Diagnóstico automático por regras internas — preparado para IA na Fase 3.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <InsightRow label="Provável causa">{insight.probableCause}</InsightRow>
        <InsightRow label="Impacto estimado">{insight.estimatedImpact}</InsightRow>
        <InsightRow label="Área afetada">{insight.affectedArea}</InsightRow>
        <div className="grid grid-cols-3 gap-3">
          <InsightRow label="Complexidade">
            <Badge variant="outline" className={COMPLEXITY_COLORS[insight.complexity]}>
              {insight.complexity}
            </Badge>
          </InsightRow>
          <InsightRow label="Tempo estimado">{insight.estimatedFixTime}</InsightRow>
          <InsightRow label="Risco">
            <Badge variant="outline" className={RISK_COLORS[insight.risk]}>{insight.risk}</Badge>
          </InsightRow>
        </div>
      </CardContent>
    </Card>
  );
}
