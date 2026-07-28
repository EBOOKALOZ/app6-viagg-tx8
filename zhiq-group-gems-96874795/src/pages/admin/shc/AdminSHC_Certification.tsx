import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { SHCLayout } from "./SHCLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Award, ShieldCheck, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { useSHCRealtime } from "../../../hooks/useSHCRealtime";
import { format } from 'date-fns';

function formatDurationMs(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function AdminSHC_Certification() {
  // moduleId = SLUG do módulo; id = ID do certificado OU do run correspondente
  const { moduleId = "geral", id } = useParams();
  const navigate = useNavigate();

  const { modules, certificates, isLoading, error } = useSHCRealtime();

  // Busca por id do certificado; se não achar, por run_id (emissão é exclusiva do motor server-side)
  const certificate = certificates.find(c => c.id === id) ?? certificates.find(c => c.run_id === id) ?? null;
  const moduleData = modules.find(m => m.slug === moduleId)
    ?? (certificate ? modules.find(m => m.id === certificate.module_id) : null)
    ?? null;

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

  if (!certificate) {
    return (
      <SHCLayout>
        <Button variant="ghost" className="mb-4 gap-2 text-muted-foreground" onClick={() => navigate(`/admin/shc/${moduleId}`)}>
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-4">
          <ShieldCheck className="w-16 h-16 text-muted-foreground/30" />
          <p className="font-medium text-lg">Certificado não encontrado</p>
          <p className="text-sm text-center max-w-md">
            Nenhum certificado emitido com este identificador. A emissão é exclusiva do motor
            oficial de homologação — execute uma homologação aprovada para gerar o certificado.
          </p>
          <Button variant="outline" onClick={() => navigate(`/admin/shc/${moduleId}`)}>
            Voltar ao Módulo
          </Button>
        </div>
      </SHCLayout>
    );
  }

  return (
    <SHCLayout>
      <Button variant="ghost" className="mb-4 gap-2 text-muted-foreground" onClick={() => navigate(`/admin/shc/${moduleId}`)}>
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Button>

      <div className="flex justify-center items-center py-8">
        <Card className="w-full max-w-3xl overflow-hidden border-2 border-emerald-500/30 relative">
          <div className="absolute -top-32 -right-32 w-64 h-64 bg-emerald-500/10 blur-3xl rounded-full" />
          <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-blue-500/10 blur-3xl rounded-full" />

          <CardContent className="p-12 relative z-10 text-center flex flex-col items-center">

            <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 border border-emerald-500/30 shadow-lg shadow-emerald-500/20">
              <Award className="w-12 h-12 text-emerald-500" />
            </div>

            <h2 className="text-sm font-bold tracking-[0.3em] text-emerald-500 mb-2">CERTIFICADO PELO SHC — VIAGG-TX8</h2>
            <h1 className="text-4xl font-black text-foreground uppercase tracking-tight mb-8">
              Módulo: {moduleData?.name ?? '—'}
            </h1>

            <div className="flex items-center gap-2 mb-8 bg-emerald-500/10 text-emerald-500 px-4 py-2 rounded-full border border-emerald-500/20">
              <ShieldCheck className="w-5 h-5" />
              <span className="font-semibold">Padrões de Qualidade Atingidos ({certificate.quality_score}%)</span>
            </div>

            <div className="w-full grid grid-cols-2 md:grid-cols-5 gap-4 text-left border-y border-border/50 py-8 mb-8">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Emitido em</p>
                <p className="font-medium text-sm">
                  {certificate.issued_at
                    ? `${format(new Date(certificate.issued_at), 'dd/MM/yyyy')} às ${format(new Date(certificate.issued_at), 'HH:mm:ss')}`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Versão</p>
                <p className="font-medium text-sm">{certificate.version}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Testes</p>
                <p className="font-medium text-sm">{certificate.total_tests} executados</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Score</p>
                <p className="font-bold text-emerald-500">{certificate.quality_score}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Tempo</p>
                <p className="font-medium text-sm">{formatDurationMs(certificate.duration_ms)}</p>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center space-y-2 mb-8">
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Coordenador da Homologação</p>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="font-medium">{certificate.coordinator_ai}</span>
              </div>
            </div>

            <div className="w-full flex flex-col md:flex-row justify-between items-start gap-4 mt-4 pt-4 border-t border-border/10">
              <div className="text-left">
                <p className="text-[10px] text-muted-foreground font-mono">ID do Certificado:</p>
                <p className="text-xs font-mono text-muted-foreground/80">{certificate.id}</p>
              </div>
              <div className="text-left md:text-right">
                <p className="text-[10px] text-muted-foreground font-mono">Hash de Validação:</p>
                <p className="text-xs font-mono text-muted-foreground/80">{certificate.hash ?? '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </SHCLayout>
  );
}
