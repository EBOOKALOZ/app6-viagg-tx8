/**
 * /convenio-admin/mensagens — Comando Convênio Fase 1.
 * Mensagens internas do painel do Gestor (Gestor ↔ entidades credenciadas).
 */
import { MessageSquare } from "lucide-react";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorPlaceholderNotice } from "@/components/convenio/GestorPlaceholderNotice";

export default function GestorMensagensPage() {
  return (
    <div>
      <GestorPageHeader icon={MessageSquare} title="Mensagens" subtitle="Comunicação com entidades credenciadas e parceiros" />
      <GestorPlaceholderNotice text="Estrutura da Fase 1 — caixa de mensagens será habilitada em fase futura." />

      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
        <MessageSquare className="mx-auto mb-3 h-8 w-8 text-white/20" />
        <p className="text-sm text-white/40">Nenhuma mensagem ainda.</p>
      </div>
    </div>
  );
}
