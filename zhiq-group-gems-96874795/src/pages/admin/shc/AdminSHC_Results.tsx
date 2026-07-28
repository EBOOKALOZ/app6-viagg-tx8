import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { SHCLayout } from "./SHCLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, Calendar, GitBranch, GitCommit, FileCode, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, Loader2, Bot, Terminal } from "lucide-react";
import { useSHCRealtime } from "../../../hooks/useSHCRealtime";
import { format } from 'date-fns';
import type { SHCRun, SHCTest } from "../../../types/shc";

function formatDurationMs(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function decisionBadge(run: SHCRun) {
  if (run.decision === 'APPROVED') return { label: 'Aprovado', className: 'bg-emerald-500 hover:bg-emerald-600' };
  if (run.decision === 'APPROVED_WITH_WARNINGS') return { label: 'Aprovado c/ Ressalvas', className: 'bg-amber-500 hover:bg-amber-600' };
  if (run.decision === 'FAILED') return { label: 'Reprovado', className: 'bg-red-500 hover:bg-red-600' };
  if (run.status === 'running') return { label: 'Executando', className: 'bg-blue-500 hover:bg-blue-600' };
  return { label: 'Sem Decisão', className: 'bg-slate-400 hover:bg-slate-500' };
}

function testIcon(test: SHCTest) {
  if (test.result === 'passed') return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
  if (test.result === 'running' || test.result === 'pending') return <AlertTriangle className="w-5 h-5 text-amber-500" />;
  return <XCircle className="w-5 h-5 text-red-500" />;
}

export default function AdminSHC_Results() {
  // moduleId = SLUG do módulo; id = ID do RUN (rota /admin/shc/:moduleId/resultados/:id)
  const { moduleId = "geral", id } = useParams();
  const navigate = useNavigate();

  const { modules, runs, logs, getTestsForRun, isLoading, error } = useSHCRealtime();

  const run = runs.find(r => r.id === id) ?? null;
  const moduleData = modules.find(m => m.slug === moduleId) ?? (run ? modules.find(m => m.id === run.module_id) : null) ?? null;
  const tests = run
    ? getTestsForRun(run.id).slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    : [];
  const runLog = run ? logs.find(l => l.run_id === run.id) ?? null : null;
  const score = run?.report_json?.score ?? null;

  if (isLoading) {
    return (
      <SHCLayout>
        <div className="flex h-[400px] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </SHCLayout>
    );
  }

  if (error) {
    return (
      <SHCLayout>
        <Button variant="ghost" className="mb-4 gap-2 text-muted-foreground" onClick={() => navigate(`/admin/shc/${moduleId}`)}>
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Falha ao carregar dados do SHC</p>
            <p className="text-sm">{error.message}</p>
          </div>
        </div>
      </SHCLayout>
    );
  }

  if (!run) {
    return (
      <SHCLayout>
        <Button variant="ghost" className="mb-4 gap-2 text-muted-foreground" onClick={() => navigate(`/admin/shc/${moduleId}`)}>
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
        <div className="p-8 text-center text-muted-foreground">
          Execução não encontrada. Verifique o histórico do módulo.
        </div>
      </SHCLayout>
    );
  }

  const badge = decisionBadge(run);

  return (
    <SHCLayout>
      <Button variant="ghost" className="mb-4 gap-2 text-muted-foreground" onClick={() => navigate(`/admin/shc/${moduleId}`)}>
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">
              Resumo da Execução{moduleData ? ` — ${moduleData.name}` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3"/> Data</span>
              <p className="font-medium text-sm">{format(new Date(run.created_at), 'dd/MM/yyyy')}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3"/> Hora</span>
              <p className="font-medium text-sm">{format(new Date(run.created_at), 'HH:mm:ss')}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Versão</span>
              <p className="font-medium text-sm">{run.version ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1"><GitBranch className="w-3 h-3"/> Branch</span>
              <p className="font-medium text-sm">{run.branch ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1"><GitCommit className="w-3 h-3"/> Commit</span>
              <p className="font-medium text-sm font-mono">{run.commit_hash ? run.commit_hash.substring(0, 10) : '—'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1"><FileCode className="w-3 h-3"/> Score</span>
              <p className="font-medium text-sm">{score !== null ? `${score}%` : '—'}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20 flex flex-col justify-center items-center text-center p-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-2">Resultado Final</h3>
          <Badge className={`${badge.className} text-lg py-1 px-4 mb-4`}>{badge.label}</Badge>
          <div className="text-sm text-muted-foreground">
            Tempo Total: <span className="font-bold text-foreground">{formatDurationMs(run.total_duration_ms)}</span>
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Coordenador: <span className="font-bold text-foreground">{run.coordinator_ai ?? '—'}</span>
          </div>
          {run.decision_reason && (
            <p className="text-xs text-muted-foreground mt-3 max-w-xs" title={run.decision_reason}>
              {run.decision_reason}
            </p>
          )}
        </Card>
      </div>

      {/* Testes reais (shc_tests) da execução */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Testes Executados ({tests.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {tests.length === 0 && (
              <div className="text-center p-4 text-muted-foreground">Nenhum teste registrado para esta execução.</div>
            )}
            {tests.map((test) => (
              <div key={test.id} className="flex flex-col md:flex-row md:items-start justify-between p-4 bg-muted/50 rounded-lg border gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  {testIcon(test)}
                  <div className="min-w-0">
                    <h4 className="font-medium text-sm">{test.name}</h4>
                    {test.responsible_ai && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Bot className="w-3 h-3" /> {test.responsible_ai}
                      </p>
                    )}
                    {test.evidence && (
                      <pre className="text-xs bg-background p-2 mt-2 rounded border overflow-x-auto whitespace-pre-wrap break-words text-muted-foreground">
                        {test.evidence}
                      </pre>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Tempo</p>
                    <p className="text-sm font-medium">{formatDurationMs(test.duration_ms)}</p>
                  </div>
                  <div className="text-right min-w-[120px]">
                    <p className="text-xs text-muted-foreground mb-1">Resultado</p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${test.result === 'passed' ? 'text-emerald-500' : test.result === 'running' || test.result === 'pending' ? 'text-amber-500' : 'text-red-500'} bg-background`}
                    >
                      {test.result.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Log oficial da execução (shc_logs) */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Terminal className="w-5 h-5" /> Log da Execução
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!runLog && (
            <div className="text-center p-4 text-muted-foreground">Nenhum log registrado para esta execução.</div>
          )}
          {runLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Executado por</p>
                  <p className="text-sm font-medium">{runLog.executed_by}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Total de Testes</p>
                  <p className="text-sm font-medium">{runLog.total_tests ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Aprovados</p>
                  <p className="text-sm font-medium text-emerald-600">{runLog.passed_tests ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Reprovados</p>
                  <p className="text-sm font-medium text-red-600">{runLog.failed_tests ?? '—'}</p>
                </div>
              </div>
              {runLog.logs && (
                <pre className="text-xs bg-slate-50 p-3 rounded-md border border-slate-200 overflow-x-auto whitespace-pre-wrap break-words text-slate-700">
                  {runLog.logs}
                </pre>
              )}
              {runLog.evidence && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Evidência</p>
                  <pre className="text-xs bg-slate-50 p-3 rounded-md border border-slate-200 overflow-x-auto whitespace-pre-wrap break-words text-slate-700">
                    {runLog.evidence}
                  </pre>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </SHCLayout>
  );
}
