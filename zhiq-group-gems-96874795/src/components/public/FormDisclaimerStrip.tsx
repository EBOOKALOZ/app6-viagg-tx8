import { AlertTriangle } from "lucide-react";

/**
 * Faixa de aviso compacta para exibir dentro de formulários, modais e drawers.
 * Lembra ao usuário que a plataforma não é responsável por pagamentos ou acordos.
 */
export function FormDisclaimerStrip() {
  return (
    <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
      <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
      <p className="text-[10px] text-red-700 leading-relaxed font-medium">
        <strong>Aviso:</strong> A Viagg-TX8 é uma vitrine digital e <strong>não intermediamos pagamentos</strong>, não garantimos qualidade de produtos/serviços e <strong>não somos responsáveis por acordos realizados entre as partes</strong>. Toda negociação é de responsabilidade exclusiva dos envolvidos.
      </p>
    </div>
  );
}
