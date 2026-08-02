/**
 * /convenio-admin/auditoria — Comando Convênio Fase 1.
 * Logs reais de convenio_audit_log, populados automaticamente por triggers
 * (INSERT/UPDATE/DELETE nas tabelas de negócio) e pelas RPCs de acesso.
 */
import { useState } from "react";
import { ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConvenioAuditLog } from "@/hooks/convenio/useConvenioAuditLog";

export default function GestorAuditoriaPage() {
  const [page, setPage] = useState(0);
  const auditQuery = useConvenioAuditLog(page);
  const rows = auditQuery.data?.rows ?? [];

  return (
    <div>
      <GestorPageHeader icon={ShieldCheck} title="Auditoria" subtitle="Logs, histórico e rastreabilidade de eventos do módulo" />

      {auditQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
          <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-white/20" />
          <p className="text-sm text-white/40">Nenhum evento registrado ainda.</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">{entry.action}</p>
                  <p className="text-xs text-white/40">{entry.actor_email ?? "Sistema"}</p>
                </div>
                <span className="whitespace-nowrap text-xs text-white/40">
                  {new Date(entry.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button
              size="sm"
              variant="outline"
              className="gap-1 border-white/15 bg-transparent text-white/70"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <span className="text-xs text-white/40">Página {page + 1}</span>
            <Button
              size="sm"
              variant="outline"
              className="gap-1 border-white/15 bg-transparent text-white/70"
              disabled={!auditQuery.data?.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
