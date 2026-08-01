/**
 * /convenio-admin/auditoria — Comando Convênio Fase 1.
 * Logs, auditorias, histórico e rastreabilidade das ações do Gestor.
 */
import { ShieldCheck } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorPlaceholderNotice } from "@/components/convenio/GestorPlaceholderNotice";
import { SIMULATED_AUDIT_LOG } from "@/lib/convenio/simulatedData";

export default function GestorAuditoriaPage() {
  return (
    <div>
      <GestorPageHeader icon={ShieldCheck} title="Auditoria" subtitle="Logs, histórico e rastreabilidade de eventos do módulo" />
      <GestorPlaceholderNotice text="Estrutura da Fase 1 — eventos abaixo são simulados. Em produção, alimentado por convenio_audit_log." />

      <div className="space-y-2">
        {SIMULATED_AUDIT_LOG.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">{entry.action}</p>
              <p className="text-xs text-white/40">{entry.actor}</p>
            </div>
            <span className="whitespace-nowrap text-xs text-white/40">{entry.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
