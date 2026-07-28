import React, { useState } from "react";
import { SHCLayout } from "./SHCLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileCode, Check, Filter, Loader2, CheckCircle2, AlertTriangle, Bot } from "lucide-react";
import { useSHCRealtime } from "../../../hooks/useSHCRealtime";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useParams } from "react-router-dom";
import type { SHCCorrectionStatus, SHCSeverity } from "../../../types/shc";

export default function AdminSHC_Corrections() {
  const { moduleId = "geral" } = useParams();
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const { corrections, modules, runs, isLoading, error } = useSHCRealtime();
  const { toast } = useToast();

  const dbModule = modules.find(m => m.slug === moduleId);
  const moduleRunIds = new Set(runs.filter(r => r.module_id === dbModule?.id).map(r => r.id));

  // Correções do módulo: por module_id direto (coluna real) ou via run do módulo
  const moduleCorrections = corrections.filter(c =>
    (dbModule && c.module_id === dbModule.id) || (c.run_id !== null && moduleRunIds.has(c.run_id))
  );

  const filteredCorrections = moduleCorrections.filter(c => {
    if (filterSeverity !== "all" && c.severity !== filterSeverity) return false;
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    return true;
  });

  const handleMarkAsFixed = async (correctionId: string) => {
    setResolvingId(correctionId);
    try {
      // Enum real: pending | fixing | fixed | validated. updated_at é trigger do banco.
      const { error: updateError } = await supabase
        .from('shc_corrections')
        .update({ status: 'fixed' })
        .eq('id', correctionId);

      if (updateError) throw updateError;

      toast({
        title: "Correção resolvida",
        description: "Status atualizado para 'fixed' no banco.",
      });
    } catch (err) {
      toast({
        title: "Erro ao marcar como resolvido",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setResolvingId(null);
    }
  };

  const getSeverityColor = (sev: SHCSeverity) => {
    switch (sev) {
      case 'critical': return '#dc2626';
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      default: return '#3b82f6';
    }
  };

  const formatSeverity = (sev: SHCSeverity) => {
    switch (sev) {
      case 'critical': return 'Crítica';
      case 'high': return 'Alta';
      case 'medium': return 'Média';
      case 'low': return 'Baixa';
      default: return sev;
    }
  };

  const formatStatus = (status: SHCCorrectionStatus | null) => {
    switch (status) {
      case 'pending': return 'Pendente';
      case 'fixing': return 'Em Correção';
      case 'fixed': return 'Corrigido';
      case 'validated': return 'Validado';
      default: return '—';
    }
  };

  const statusBadgeClass = (status: SHCCorrectionStatus | null) => {
    switch (status) {
      case 'pending': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'fixing': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'fixed': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'validated': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    }
  };

  if (isLoading) {
    return (
      <SHCLayout>
        <div className="flex h-[400px] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
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

      <Card className="mb-6">
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-end">
          <div className="space-y-1 w-full md:w-1/4">
            <label className="text-xs text-muted-foreground font-medium">Gravidade</label>
            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Gravidades</SelectItem>
                <SelectItem value="critical">Crítica</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 w-full md:w-1/4">
            <label className="text-xs text-muted-foreground font-medium">Status</label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="fixing">Em Correção</SelectItem>
                <SelectItem value="fixed">Corrigido</SelectItem>
                <SelectItem value="validated">Validado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full md:w-1/4">
            <Button className="w-full gap-2" variant="outline" onClick={() => { setFilterSeverity('all'); setFilterStatus('all'); }}>
              <Filter className="w-4 h-4"/> Limpar Filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {filteredCorrections.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <CheckCircle2 className="w-16 h-16 text-emerald-500/30 mb-4" />
          <p className="font-medium text-lg">Nenhuma correção encontrada</p>
          <p className="text-sm mt-1">
            {moduleCorrections.length === 0
              ? 'Nenhuma correção registrada para este módulo. Execute uma homologação para gerar recomendações.'
              : 'Nenhuma correção corresponde aos filtros selecionados.'}
          </p>
        </div>
      )}

      <div className="space-y-4">
        {filteredCorrections.map(cor => (
          <Card key={cor.id} className="overflow-hidden border-l-4" style={{ borderLeftColor: getSeverityColor(cor.severity) }}>
            <CardHeader className="bg-muted/30 pb-3">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={cor.severity === 'critical' || cor.severity === 'high' ? 'destructive' : 'outline'}>
                      {formatSeverity(cor.severity)}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">{cor.id.substring(0, 8).toUpperCase()}</span>
                    {cor.responsible_ai && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        <Bot className="w-3.5 h-3.5" /> {cor.responsible_ai}
                      </span>
                    )}
                  </div>
                  <CardTitle className="text-base leading-tight mt-2">{cor.failure_description}</CardTitle>
                </div>
                <Badge variant="outline" className={statusBadgeClass(cor.status)}>
                  {formatStatus(cor.status)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                {cor.technical_description && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Descrição Técnica
                    </h4>
                    <p className="text-sm">{cor.technical_description}</p>
                  </div>
                )}
                {cor.affected_file && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                      <FileCode className="w-4 h-4" /> Arquivo Afetado
                    </h4>
                    <div className="font-mono text-sm bg-background p-2 rounded border">
                      {cor.affected_file}
                      {cor.affected_line !== null && <span className="text-primary font-bold ml-2">L{cor.affected_line}</span>}
                    </div>
                  </div>
                )}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Detectado em</h4>
                  <p className="text-sm">{format(new Date(cor.created_at), 'dd/MM/yyyy HH:mm:ss')}</p>
                </div>
              </div>

              <div className="space-y-4">
                {cor.auto_suggestion && (
                  <div className="bg-primary/5 p-4 rounded-lg border border-primary/20 space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
                      <Check className="w-4 h-4" /> Sugestão Automática
                    </h4>
                    <p className="text-sm">{cor.auto_suggestion}</p>
                  </div>
                )}

                {(cor.status === 'pending' || cor.status === 'fixing') && (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resolvingId === cor.id}
                      onClick={() => handleMarkAsFixed(cor.id)}
                    >
                      {resolvingId === cor.id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Marcar como Resolvido
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </SHCLayout>
  );
}
