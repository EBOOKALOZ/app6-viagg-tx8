import { Construction } from "lucide-react";

interface GestorPlaceholderNoticeProps {
  text?: string;
}

/**
 * Aviso padrão exibido nas telas de estrutura da Fase 1 (sem operação
 * financeira real / dados ainda simulados), conforme escopo do prompt.
 */
export function GestorPlaceholderNotice({
  text = "Estrutura da Fase 1 — sem operação financeira real. Dados de exemplo para validação de layout e fluxo.",
}: GestorPlaceholderNoticeProps) {
  return (
    <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
      <Construction className="h-4 w-4 flex-shrink-0 text-amber-400" />
      <p className="text-xs font-medium text-amber-200/80">{text}</p>
    </div>
  );
}
