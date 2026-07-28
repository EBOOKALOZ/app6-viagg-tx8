import { Link, useParams } from "react-router-dom";
import { SHCLayout } from "./SHCLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle, ArrowLeft, Bot, CheckCircle2, CircleDashed, Clock,
  History, Loader2, ShieldCheck, Terminal, Wrench, XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useSHCRealtime } from "@/hooks/useSHCRealtime";
import type { SHCDecision } from "@/types/shc";

const DECISION_META: Record<SHCDecision, { label: string; className: string }> = {
  APPROVED: { label: "APROVADO", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  APPROVED_WITH_WARNINGS: { label: "APROVADO COM RESSALVAS", className: "bg-amber-100 text-amber-700 border-amber-200" },
  FAILED: { label: "REPROVADO", className: "bg-red-100 text-red-700 border-red-200" },
};

function runStatusMeta(status: string | null): { label: string; className: string } {
  switch (status) {
    case "passed":
      return { label: "Aprovada", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    case "failed":
      return { label: "Reprovada", className: "bg-red-100 text-red-700 border-red-200" };
    case "error":
      return { label: "Erro", className: "bg-red-100 text-red-700 border-red-200" };
    case "running":
      return { label: "Executando", className: "bg-blue-100 text-blue-700 border-blue-200" };
    default:
      return { label: status ?? "—", className: "bg-slate-100 text-slate-500 border-slate-200" };
  }
}

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function getScoreColor(score: number | null): string {
  if (score == null) return "#94A3B8";
  if (score >= 90) return "#22C55E";
  if (score >= 70) return "#F59E0B";
  return "#EF4444";
}

export default function AdminSHC_Overview() {
  const { moduleId } = useParams();
  const { modules, runs, corrections, logs, isLoading, error, getTestsForRun } = useSHCRealtime();

  if (isLoading) {
    return (
      <SHCLayout>
        <div className="flex h-[400px] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#16A34A]" />
        </div>
      </SHCLayout>
    );
  }

  const module = modules.find(m => m.slug === moduleId);

  if (!module) {
    return (
      <SHCLayout>
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erro ao carregar dados do SHC</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        <Card className="bg-white rounded-2xl shadow-sm border border-slate-200">
          <CardContent className="p-12 text-center">
            <AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-700 mb-2">Módulo não encontrado</h3>
            <p className="text-slate-500 text-sm mb-6">
              Nenhum módulo com o identificador "{moduleId}" foi localizado no banco.
            </p>
            <Button asChild variant="outline" className="rounded-xl gap-2">
              <Link to="/admin/shc">
                <ArrowLeft className="w-4 h-4" /> Voltar para o SHC
              </Link>
            </Button>
          </CardContent>
        </Card>
      </SHCLayout>
    );
  }

  const moduleRuns = runs
    .filter(r => r.module_id === module.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const latestRun = moduleRuns[0] ?? null;
  const recentRuns = moduleRuns.slice(0, 5);

  const score = latestRun?.report_json?.score ?? module.quality_score ?? null;
  const criticalCount = latestRun?.critical ?? 0;
  const warningsCount = latestRun?.warnings ?? 0;
  const correctionsCount = corrections.filter(c => c.module_id === module.id).length;
  const duration = latestRun?.total_duration_ms ?? null;

  const latestTests = latestRun
    ? [...getTestsForRun(latestRun.id)].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    : [];
  const latestLog = latestRun ? logs.find(l => l.run_id === latestRun.id) : undefined;

  const statusMeta = latestRun ? runStatusMeta(latestRun.status) : null;
  const decisionMeta = latestRun?.decision ? DECISION_META[latestRun.decision] : null;

  return (
    <SHCLayout>
      <div className="space-y-6 font-inter pb-20">

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erro ao carregar dados do SHC</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {/* Linha 1 — KPIs reais */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Score */}
          <Card className="bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getScoreColor(score) }} />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Score</span>
              </div>
              <div className="text-3xl font-black" style={{ color: getScoreColor(score) }}>
                {score != null ? score : "—"}
              </div>
            </CardContent>
          </Card>

          {/* Erros críticos */}
          <Card className="bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Erros Críticos</span>
              </div>
              <div className={`text-3xl font-black ${criticalCount > 0 ? "text-red-600" : "text-[#111827]"}`}>
                {criticalCount}
              </div>
            </CardContent>
          </Card>

          {/* Ressalvas */}
          <Card className="bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ressalvas</span>
              </div>
              <div className={`text-3xl font-black ${warningsCount > 0 ? "text-amber-600" : "text-[#111827]"}`}>
                {warningsCount}
              </div>
            </CardContent>
          </Card>

          {/* Correções */}
          <Card className="bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Wrench className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Correções</span>
              </div>
              <div className="text-3xl font-black text-[#111827]">{correctionsCount}</div>
            </CardContent>
          </Card>

          {/* Duração */}
          <Card className="bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-purple-500" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Duração</span>
              </div>
              <div className="text-3xl font-black font-mono text-[#111827]">{formatMs(duration)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Status da última execução */}
        <Card className="bg-white rounded-2xl shadow-sm border border-slate-100">
          <CardContent className="p-6">
            {latestRun ? (
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                      Última Homologação
                    </span>
                    <span className="text-sm text-slate-600">
                      {format(new Date(latestRun.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      {latestRun.executed_by ? ` • ${latestRun.executed_by}` : ""}
                    </span>
                    {latestRun.decision_reason && (
                      <p className="text-xs text-slate-500 mt-1 max-w-xl">{latestRun.decision_reason}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {statusMeta && (
                    <Badge variant="outline" className={`${statusMeta.className} rounded-full font-bold border px-3 py-1 text-[10px] uppercase tracking-wider`}>
                      {statusMeta.label}
                    </Badge>
                  )}
                  <Badge variant="outline" className={`${decisionMeta?.className ?? "bg-slate-100 text-slate-500 border-slate-200"} rounded-full font-bold border px-3 py-1 text-[10px] uppercase tracking-wider`}>
                    {decisionMeta?.label ?? "SEM DECISÃO"}
                  </Badge>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-500 py-4">
                <CircleDashed className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="font-semibold text-slate-700">Nenhuma execução registrada para este módulo.</p>
                <p className="text-sm mt-1">Dispare a primeira homologação na aba Auditoria.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Evidências da última execução */}
        <Card className="bg-white rounded-2xl shadow-sm border border-slate-100">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-lg font-bold text-[#111827] flex items-center gap-2">
              <Terminal className="w-5 h-5 text-slate-500" />
              Evidências da Última Execução
            </CardTitle>
            <CardDescription className="text-slate-500">
              Testes (shc_tests) e registro de execução (shc_logs) gravados pelo motor server-side.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {!latestRun ? (
              <div className="text-center text-slate-500 text-sm py-6">
                Sem evidências — nenhuma execução registrada.
              </div>
            ) : (
              <div className="space-y-6">
                {/* Testes reais */}
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">
                    Testes ({latestTests.length})
                  </h4>
                  {latestTests.length === 0 ? (
                    <div className="text-sm text-slate-500">Nenhum teste registrado para esta execução.</div>
                  ) : (
                    <div className="space-y-2">
                      {latestTests.map(test => {
                        const passed = test.result === "passed";
                        const failed = test.result === "failed" || test.result === "error";
                        return (
                          <div key={test.id} className="flex flex-col gap-1.5 p-3 bg-slate-50/60 rounded-xl border border-slate-100">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                {passed ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                ) : failed ? (
                                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                                ) : (
                                  <CircleDashed className="w-4 h-4 text-slate-400 shrink-0" />
                                )}
                                <span className="font-semibold text-sm text-[#111827] truncate">{test.name}</span>
                              </div>
                              <Badge
                                variant="outline"
                                className={`${passed
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                  : failed
                                    ? "bg-red-100 text-red-700 border-red-200"
                                    : "bg-slate-100 text-slate-500 border-slate-200"} text-[10px] font-bold uppercase shrink-0`}
                              >
                                {test.status ?? test.result}
                              </Badge>
                            </div>
                            {test.evidence && (
                              <p className="text-xs text-slate-600 font-mono whitespace-pre-wrap break-words">
                                {test.evidence}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Registro shc_logs real */}
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">
                    Registro de Execução
                  </h4>
                  {!latestLog ? (
                    <div className="text-sm text-slate-500">Nenhum registro de log gravado para esta execução.</div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 mb-0.5">
                            <Bot className="w-3 h-3" /> Executado por
                          </span>
                          <span className="font-semibold text-slate-700">{latestLog.executed_by}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Total</span>
                          <span className="font-semibold text-slate-700">{latestLog.total_tests ?? "—"}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Aprovados</span>
                          <span className="font-semibold text-emerald-600">{latestLog.passed_tests ?? "—"}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Reprovados</span>
                          <span className={`font-semibold ${(latestLog.failed_tests ?? 0) > 0 ? "text-red-600" : "text-slate-700"}`}>
                            {latestLog.failed_tests ?? "—"}
                          </span>
                        </div>
                      </div>
                      {latestLog.logs && (
                        <div className="bg-[#0f172a] rounded-xl p-4 font-mono text-xs text-slate-300 max-h-56 overflow-y-auto border border-slate-800 whitespace-pre-wrap break-words">
                          {latestLog.logs}
                        </div>
                      )}
                      {latestLog.evidence && (
                        <p className="text-xs text-slate-600 font-mono whitespace-pre-wrap break-words bg-slate-50 rounded-lg border border-slate-100 p-3">
                          {latestLog.evidence}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Histórico curto — últimas 5 runs reais */}
        <Card className="bg-white rounded-2xl shadow-sm border border-slate-100">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-lg font-bold text-[#111827] flex items-center gap-2">
              <History className="w-5 h-5 text-slate-500" />
              Últimas Execuções
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {recentRuns.length === 0 ? (
              <div className="text-center text-slate-500 text-sm py-4">Nenhuma execução registrada.</div>
            ) : (
              <div className="space-y-2">
                {recentRuns.map(run => {
                  const meta = run.decision ? DECISION_META[run.decision] : null;
                  return (
                    <div key={run.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-50/60 rounded-xl border border-slate-100">
                      <div className="text-sm font-medium text-[#111827]">
                        {format(new Date(run.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-500">
                          Score: <span className="font-bold text-slate-700">{run.report_json?.score ?? "—"}</span>
                        </span>
                        <span className="text-xs font-mono text-slate-500">{formatMs(run.total_duration_ms)}</span>
                        <Badge variant="outline" className={`${meta?.className ?? "bg-slate-100 text-slate-500 border-slate-200"} text-[10px] font-bold uppercase`}>
                          {meta?.label ?? runStatusMeta(run.status).label}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </SHCLayout>
  );
}
