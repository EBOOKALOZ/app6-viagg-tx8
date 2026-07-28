import React, { useMemo } from "react";
import { SHCLayout } from "./SHCLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, Clock, AlertTriangle, Wrench, Activity } from "lucide-react";
import { useSHCRealtime } from "../../../hooks/useSHCRealtime";
import { useParams } from "react-router-dom";
import { format } from "date-fns";

function BarChart({ data, color, valueLabel }: { data: { label: string; value: number }[]; color: string; valueLabel?: (v: number) => string }) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const formatVal = valueLabel || ((v: number) => String(v));

  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-medium w-20 text-right shrink-0 truncate">{d.label}</span>
          <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden relative">
            <div
              className="h-full rounded-full transition-all duration-700 flex items-center justify-end pr-2"
              style={{ width: `${Math.max((d.value / maxVal) * 100, 8)}%`, backgroundColor: color }}
            >
              <span className="text-[10px] font-bold text-white drop-shadow-sm">{formatVal(d.value)}</span>
            </div>
          </div>
        </div>
      ))}
      {data.length === 0 && (
        <div className="text-center py-6 text-slate-400 text-sm">Sem dados disponíveis</div>
      )}
    </div>
  );
}

function StabilityGauge({ value }: { value: number }) {
  const getColor = (v: number) => {
    if (v >= 90) return "#22C55E";
    if (v >= 70) return "#F59E0B";
    if (v >= 50) return "#EF4444";
    return "#94A3B8";
  };

  return (
    <div className="flex flex-col items-center py-6">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="42" fill="none" stroke="#E2E8F0" strokeWidth="10" />
          <circle
            cx="50" cy="50" r="42" fill="none"
            stroke={getColor(value)}
            strokeWidth="10"
            strokeDasharray={`${(value / 100) * 264} 264`}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black" style={{ color: getColor(value) }}>{value}%</span>
          <span className="text-[10px] text-slate-400 font-semibold uppercase">Estabilidade</span>
        </div>
      </div>
      <div className="mt-3 text-sm font-semibold" style={{ color: getColor(value) }}>
        {value >= 90 ? "Excelente" : value >= 70 ? "Boa" : value >= 50 ? "Regular" : "Crítica"}
      </div>
    </div>
  );
}

export default function AdminSHC_Evolution() {
  const { moduleId = "geral" } = useParams();
  const { runs, modules, corrections, isLoading, error } = useSHCRealtime();

  const chartData = useMemo(() => {
    const dbModule = modules.find(m => m.slug === moduleId);
    const moduleRuns = runs
      .filter(r => r.module_id === dbModule?.id && r.status !== 'running')
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(-10); // Últimas 10 execuções

    // Score REAL da decisão do motor (shc_runs.report_json.score)
    const scoreData = moduleRuns
      .filter(r => r.report_json?.score !== undefined && r.report_json?.score !== null)
      .map(r => ({
        label: format(new Date(r.created_at), 'dd/MM'),
        value: r.report_json ? r.report_json.score : 0,
      }));

    // Duração REAL (shc_runs.total_duration_ms), em segundos
    const durationData = moduleRuns
      .filter(r => r.total_duration_ms !== null && r.total_duration_ms > 0)
      .map(r => ({
        label: format(new Date(r.created_at), 'dd/MM'),
        value: Math.round((r.total_duration_ms ?? 0) / 1000),
      }));

    // Falhas críticas REAIS (shc_runs.critical)
    const criticalData = moduleRuns.map(r => ({
      label: format(new Date(r.created_at), 'dd/MM'),
      value: r.critical ?? 0,
    }));

    // Correções REAIS registradas em shc_corrections por run
    const correctionData = moduleRuns.map(r => ({
      label: format(new Date(r.created_at), 'dd/MM'),
      value: corrections.filter(c => c.run_id === r.id).length,
    }));

    // Estabilidade: média dos scores reais das últimas 5 execuções com score
    const lastFiveScores = scoreData.slice(-5);
    const stability = lastFiveScores.length > 0
      ? Math.round(lastFiveScores.reduce((s, d) => s + d.value, 0) / lastFiveScores.length)
      : null;

    // Duração média real
    const avgDuration = durationData.length > 0
      ? Math.round(durationData.reduce((s, d) => s + d.value, 0) / durationData.length)
      : null;

    // Aprovação: % de runs com decisão APPROVED/APPROVED_WITH_WARNINGS entre as decididas
    const decidedRuns = moduleRuns.filter(r => r.decision !== null);
    const approvalRate = decidedRuns.length > 0
      ? Math.round(decidedRuns.filter(r => r.decision === 'APPROVED' || r.decision === 'APPROVED_WITH_WARNINGS').length / decidedRuns.length * 100)
      : null;

    return { scoreData, durationData, criticalData, correctionData, stability, avgDuration, approvalRate, totalRuns: moduleRuns.length };
  }, [runs, modules, corrections, moduleId]);

  if (isLoading) {
    return (
      <SHCLayout>
        <div className="flex h-[400px] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#16A34A]" />
        </div>
      </SHCLayout>
    );
  }

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m${sec}s` : `${sec}s`;
  };

  return (
    <SHCLayout>
      <div className="space-y-6 font-inter">

        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Falha ao carregar dados do SHC</p>
              <p className="text-sm">{error.message}</p>
            </div>
          </div>
        )}

        {/* Summary Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <CardContent className="p-5 text-center">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Execuções</div>
              <div className="text-3xl font-black text-[#111827]">{chartData.totalRuns}</div>
            </CardContent>
          </Card>
          <Card className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <CardContent className="p-5 text-center">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Estabilidade</div>
              <div className="text-3xl font-black text-emerald-600">
                {chartData.stability !== null ? `${chartData.stability}%` : "—"}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <CardContent className="p-5 text-center">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tempo Médio</div>
              <div className="text-3xl font-black text-[#111827]">
                {chartData.avgDuration !== null ? formatDuration(chartData.avgDuration) : "—"}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <CardContent className="p-5 text-center">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Aprovação</div>
              <div className="text-3xl font-black text-emerald-600">
                {chartData.approvalRate !== null ? `${chartData.approvalRate}%` : "—"}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Score por Execução (report_json.score) */}
          <Card className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                <CardTitle className="text-base font-bold text-[#111827]">Score por Execução</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <BarChart data={chartData.scoreData} color="#22C55E" valueLabel={v => `${v}%`} />
            </CardContent>
          </Card>

          {/* Tempo por Execução (total_duration_ms) */}
          <Card className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-500" />
                <CardTitle className="text-base font-bold text-[#111827]">Tempo por Execução</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <BarChart data={chartData.durationData} color="#8B5CF6" valueLabel={v => formatDuration(v)} />
            </CardContent>
          </Card>

          {/* Falhas críticas reais (shc_runs.critical) */}
          <Card className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <CardTitle className="text-base font-bold text-[#111827]">Falhas Críticas por Execução</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <BarChart data={chartData.criticalData} color="#EF4444" />
            </CardContent>
          </Card>

          {/* Correções reais registradas (shc_corrections) */}
          <Card className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-blue-500" />
                <CardTitle className="text-base font-bold text-[#111827]">Correções Registradas por Execução</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <BarChart data={chartData.correctionData} color="#3B82F6" />
            </CardContent>
          </Card>
        </div>

        {/* Estabilidade Gauge */}
        <Card className="bg-white rounded-2xl shadow-sm border border-slate-100">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-500" />
              <CardTitle className="text-base font-bold text-[#111827]">Evolução da Estabilidade</CardTitle>
            </div>
            <p className="text-sm text-slate-500">Média dos scores reais dos últimos 5 ciclos de homologação</p>
          </CardHeader>
          <CardContent>
            {chartData.stability !== null ? (
              <StabilityGauge value={chartData.stability} />
            ) : (
              <div className="text-center py-10 text-slate-400 text-sm">
                Sem execuções com score registrado para calcular a estabilidade.
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </SHCLayout>
  );
}
