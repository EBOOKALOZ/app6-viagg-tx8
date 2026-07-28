import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SHCLayout } from "./SHCLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle, ArrowLeft, Bot, CheckCircle2, CircleDashed, Clock,
  FileText, Hash, Loader2, Rocket, ShieldCheck, Terminal, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useSHCRealtime } from "@/hooks/useSHCRealtime";
import { runModuleAudit } from "@/services/shc/executor";
import { getModuleEvidence } from "@/services/shc/evidence";
import type { SHCDecision } from "@/types/shc";

const DECISION_META: Record<SHCDecision, { label: string; className: string }> = {
  APPROVED: { label: "APROVADO", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  APPROVED_WITH_WARNINGS: { label: "APROVADO COM RESSALVAS", className: "bg-amber-100 text-amber-700 border-amber-200" },
  FAILED: { label: "REPROVADO", className: "bg-red-100 text-red-700 border-red-200" },
};

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function testBadgeClass(result: string | null): string {
  if (result === "passed") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (result === "failed" || result === "error") return "bg-red-100 text-red-700 border-red-200";
  if (result === "running") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-500 border-slate-200";
}

export default function AdminSHC_Audit() {
  const { moduleId } = useParams();
  const { modules, logs, isLoading, error, getLatestRunForModule, getTestsForRun } = useSHCRealtime();
  const [executing, setExecuting] = useState(false);

  const handleExecute = async () => {
    if (!moduleId || executing) return;
    setExecuting(true);
    try {
      const result = await runModuleAudit(moduleId, getModuleEvidence(moduleId));
      if (!result.ok) {
        toast.error(result.error || "Falha ao executar a homologação server-side.");
        return;
      }
      const label = result.decision ? DECISION_META[result.decision].label : "CONCLUÍDA";
      const scoreTxt = typeof result.score === "number" ? ` — score ${result.score}` : "";
      if (result.decision === "FAILED") {
        toast.error(`Homologação: ${label}${scoreTxt}`);
      } else {
        toast.success(`Homologação: ${label}${scoreTxt}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setExecuting(false);
    }
  };

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

  const latestRun = getLatestRunForModule(module.id);
  const runTests = latestRun
    ? [...getTestsForRun(latestRun.id)].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    : [];
  const runLog = latestRun ? logs.find(l => l.run_id === latestRun.id) : undefined;
  const decisionMeta = latestRun?.decision ? DECISION_META[latestRun.decision] : null;
  const score = latestRun?.report_json?.score ?? null;

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

        {/* Execução Server-Side */}
        <Card className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">
                  Execução do SHC
                </h3>
                <div className="text-2xl font-black text-[#111827] mb-2">{module.name}</div>
                <p className="text-sm text-slate-500 font-medium max-w-xl">
                  A homologação roda inteiramente no servidor (Edge Function shc-executor → RPC atômica).
                  O resultado e as evidências chegam a esta tela automaticamente via Realtime.
                </p>
              </div>
              <div className="shrink-0">
                <Button
                  onClick={handleExecute}
                  disabled={executing}
                  className="text-lg py-6 px-8 bg-[#16A34A] hover:bg-[#15803d] text-white rounded-xl shadow-lg transition-all flex items-center gap-3 disabled:opacity-80"
                >
                  {executing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Rocket className="w-5 h-5" />}
                  <span className="font-bold">
                    {executing ? "Executando homologação server-side..." : "Executar Homologação (Server-Side)"}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Última execução real */}
        {!latestRun ? (
          <Card className="bg-white rounded-2xl shadow-sm border border-slate-200">
            <CardContent className="p-10 text-center text-slate-500">
              <CircleDashed className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="font-semibold text-slate-700">Nenhuma execução registrada para este módulo.</p>
              <p className="text-sm mt-1">Dispare a primeira homologação pelo botão acima.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="bg-white rounded-2xl shadow-sm border border-slate-200">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg font-bold text-[#111827] flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-[#16A34A]" />
                      Última Execução
                    </CardTitle>
                    <CardDescription className="text-slate-500">
                      {format(new Date(latestRun.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                      {latestRun.executed_by ? ` • executor: ${latestRun.executed_by}` : ""}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className={`${decisionMeta?.className ?? "bg-slate-100 text-slate-500 border-slate-200"} rounded-full font-bold border px-4 py-1 text-xs uppercase tracking-wider`}>
                    {decisionMeta?.label ?? (latestRun.status === "running" ? "EXECUTANDO" : "SEM DECISÃO")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-slate-50/60 rounded-xl border border-slate-100 p-4">
                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Score</div>
                    <div className="text-2xl font-black text-[#111827]">{score != null ? score : "—"}</div>
                  </div>
                  <div className="bg-slate-50/60 rounded-xl border border-slate-100 p-4">
                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Duração
                    </div>
                    <div className="text-2xl font-black font-mono text-[#111827]">{formatMs(latestRun.total_duration_ms)}</div>
                  </div>
                  <div className="bg-slate-50/60 rounded-xl border border-slate-100 p-4">
                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Erros críticos</div>
                    <div className={`text-2xl font-black ${(latestRun.critical ?? 0) > 0 ? "text-red-600" : "text-[#111827]"}`}>
                      {latestRun.critical ?? 0}
                    </div>
                  </div>
                  <div className="bg-slate-50/60 rounded-xl border border-slate-100 p-4">
                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Ressalvas</div>
                    <div className={`text-2xl font-black ${(latestRun.warnings ?? 0) > 0 ? "text-amber-600" : "text-[#111827]"}`}>
                      {latestRun.warnings ?? 0}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  {latestRun.decision_reason && (
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-bold text-slate-500 text-xs uppercase tracking-wider block mb-0.5">Motivo da decisão</span>
                        <span className="text-slate-700">{latestRun.decision_reason}</span>
                      </div>
                    </div>
                  )}
                  {latestRun.decision_hash && (
                    <div className="flex items-start gap-2">
                      <Hash className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-bold text-slate-500 text-xs uppercase tracking-wider block mb-0.5">Hash da decisão</span>
                        <span className="font-mono text-xs text-slate-700 break-all">{latestRun.decision_hash}</span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Testes reais da execução */}
            <Card className="bg-white rounded-2xl shadow-sm border border-slate-200">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                <CardTitle className="text-lg font-bold text-[#111827]">
                  Testes da Execução ({runTests.length})
                </CardTitle>
                <CardDescription className="text-slate-500">
                  Registros reais de shc_tests desta run.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {runTests.length === 0 ? (
                  <div className="text-center text-slate-500 text-sm py-6">
                    Nenhum teste registrado para esta execução.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {runTests.map(test => {
                      const passed = test.result === "passed";
                      const failed = test.result === "failed" || test.result === "error";
                      return (
                        <div key={test.id} className="flex flex-col gap-2 p-4 bg-slate-50/60 rounded-xl border border-slate-100">
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
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-xs font-mono text-slate-400">{formatMs(test.duration_ms)}</span>
                              <Badge variant="outline" className={`${testBadgeClass(test.result)} text-[10px] font-bold uppercase`}>
                                {test.status ?? test.result}
                              </Badge>
                            </div>
                          </div>
                          {test.evidence && (
                            <p className="text-xs text-slate-600 font-mono whitespace-pre-wrap break-words bg-white rounded-lg border border-slate-100 p-2.5">
                              {test.evidence}
                            </p>
                          )}
                          {test.responsible_ai && (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                              <Bot className="w-3 h-3" /> {test.responsible_ai}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Log oficial da execução */}
            <Card className="bg-white rounded-2xl shadow-sm border border-slate-200">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                <CardTitle className="text-lg font-bold text-[#111827] flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-slate-500" />
                  Registro de Execução (shc_logs)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {!runLog ? (
                  <div className="text-center text-slate-500 text-sm py-6">
                    Nenhum registro de log gravado para esta execução.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Executado por</span>
                        <span className="font-semibold text-slate-700">{runLog.executed_by}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Resultado</span>
                        <Badge variant="outline" className={`${testBadgeClass(runLog.result)} text-[10px] font-bold uppercase`}>
                          {runLog.result}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Testes (total / pass / fail)</span>
                        <span className="font-semibold text-slate-700">
                          {runLog.total_tests ?? "—"} / {runLog.passed_tests ?? "—"} / {runLog.failed_tests ?? "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Duração</span>
                        <span className="font-mono font-semibold text-slate-700">{formatMs(runLog.duration_ms)}</span>
                      </div>
                    </div>
                    {runLog.logs && (
                      <div className="bg-[#0f172a] rounded-xl p-4 font-mono text-xs text-slate-300 max-h-64 overflow-y-auto border border-slate-800 whitespace-pre-wrap break-words">
                        {runLog.logs}
                      </div>
                    )}
                    {runLog.evidence && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Evidência</span>
                        <p className="text-xs text-slate-600 font-mono whitespace-pre-wrap break-words bg-slate-50 rounded-lg border border-slate-100 p-3">
                          {runLog.evidence}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </SHCLayout>
  );
}
