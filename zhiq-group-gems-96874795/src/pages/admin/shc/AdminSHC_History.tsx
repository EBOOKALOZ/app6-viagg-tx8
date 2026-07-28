import React, { useState } from "react";
import { SHCLayout } from "./SHCLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, FileText, ChevronRight, AlertTriangle } from "lucide-react";
import { useSHCRealtime } from "../../../hooks/useSHCRealtime";
import { format } from 'date-fns';
import { useParams, useNavigate } from "react-router-dom";
import type { SHCRun } from "../../../types/shc";

export default function AdminSHC_History() {
  const { moduleId = "geral" } = useParams();
  const navigate = useNavigate();
  const { runs, modules, isLoading, error } = useSHCRealtime();
  const [searchQuery, setSearchQuery] = useState('');

  const formatDurationMs = (ms: number | null) => {
    if (!ms) return '—';
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m > 0 ? `${m}m ` : ''}${s}s`;
  };

  const getModuleName = (runModuleId: string | null) => {
    const mod = modules.find(m => m.id === runModuleId);
    return mod?.name ?? '—';
  };

  const getScore = (run: SHCRun): number | null => run.report_json?.score ?? null;

  const getDecisionBadge = (run: SHCRun) => {
    if (run.decision === 'APPROVED') {
      return { label: 'Aprovado', className: 'border-[#22C55E] text-[#166534] bg-[#22C55E]/10' };
    }
    if (run.decision === 'APPROVED_WITH_WARNINGS') {
      return { label: 'Aprovado c/ Ressalvas', className: 'border-amber-400 text-amber-700 bg-amber-400/10' };
    }
    if (run.decision === 'FAILED') {
      return { label: 'Reprovado', className: 'border-[#EF4444] text-[#991B1B] bg-[#EF4444]/10' };
    }
    if (run.status === 'running') {
      return { label: 'Executando', className: 'border-[#3B82F6] text-[#1D4ED8] bg-[#3B82F6]/10' };
    }
    return { label: 'Sem Decisão', className: 'border-slate-300 text-slate-500 bg-slate-100' };
  };

  const dbModule = modules.find(m => m.slug === moduleId);
  const moduleRuns = runs
    .filter(r => r.module_id === dbModule?.id)
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const filteredRuns = moduleRuns.filter(run => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      getModuleName(run.module_id).toLowerCase().includes(q) ||
      (run.decision ?? '').toLowerCase().includes(q) ||
      (run.status ?? '').toLowerCase().includes(q) ||
      (run.decision_reason ?? '').toLowerCase().includes(q) ||
      (run.coordinator_ai ?? '').toLowerCase().includes(q)
    );
  });

  if (isLoading) {
    return (
      <SHCLayout>
        <div className="flex h-[400px] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#16A34A]" />
        </div>
      </SHCLayout>
    );
  }

  return (
    <SHCLayout>
      {error && (
        <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Falha ao carregar dados do SHC</p>
            <p className="text-sm">{error.message}</p>
          </div>
        </div>
      )}

      <Card className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden font-inter">
        <CardHeader className="border-b border-slate-100 pb-4 bg-slate-50/50 flex flex-col md:flex-row items-start md:items-center justify-between">
          <CardTitle className="text-lg font-bold text-[#111827]">Histórico de Execuções</CardTitle>
          <div className="relative w-full md:w-72 mt-3 md:mt-0">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              type="search"
              placeholder="Buscar por decisão, status..."
              className="pl-9 bg-white border-slate-200 focus-visible:ring-[#16A34A] rounded-xl"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead className="font-semibold text-slate-500 py-4 px-6">Data / Hora</TableHead>
                  <TableHead className="font-semibold text-slate-500 py-4">Coordenador (IA)</TableHead>
                  <TableHead className="font-semibold text-slate-500 py-4">Score</TableHead>
                  <TableHead className="font-semibold text-slate-500 py-4">Decisão</TableHead>
                  <TableHead className="font-semibold text-slate-500 py-4">Tempo</TableHead>
                  <TableHead className="font-semibold text-slate-500 py-4">Motivo</TableHead>
                  <TableHead className="font-semibold text-slate-500 py-4 text-right pr-6">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRuns.map((run) => {
                  const badge = getDecisionBadge(run);
                  const score = getScore(run);
                  return (
                    <TableRow
                      key={run.id}
                      className="group border-slate-100 transition-colors hover:bg-slate-50/80 even:bg-slate-50/30"
                    >
                      <TableCell className="px-6 py-4">
                        <div className="font-medium text-[#111827]">{format(new Date(run.created_at), 'dd/MM/yyyy')}</div>
                        <div className="text-sm text-slate-500">{format(new Date(run.created_at), 'HH:mm')}</div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 text-xs font-semibold">
                          {run.coordinator_ai ?? '—'}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <span className="font-bold text-[#111827]">{score !== null ? `${score}%` : '—'}</span>
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge variant="outline" className={badge.className}>
                          {badge.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4 text-slate-600 font-medium">
                        {formatDurationMs(run.total_duration_ms)}
                      </TableCell>
                      <TableCell className="py-4 max-w-[280px]">
                        <span className="text-sm text-slate-500 block truncate" title={run.decision_reason ?? undefined}>
                          {run.decision_reason ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 pr-6 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[#16A34A] hover:text-[#166534] hover:bg-[#16A34A]/10 font-semibold gap-1"
                          onClick={() => navigate(`/admin/shc/${moduleId}/resultados/${run.id}`)}
                        >
                          Ver Relatório <ChevronRight className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredRuns.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-500">
                      <div className="flex flex-col items-center justify-center">
                        <FileText className="w-8 h-8 text-slate-300 mb-3" />
                        <p>{moduleRuns.length === 0 ? 'Nenhuma execução registrada ainda para este módulo.' : 'Nenhum resultado encontrado para a busca.'}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </SHCLayout>
  );
}
