import { AlertTriangle } from "lucide-react";

/**
 * Faixa de aviso compacta para exibir dentro de formulários, modais e drawers.
 * Lembra ao usuário que a plataforma não é responsável por pagamentos ou acordos.
 */
export function FormDisclaimerStrip() {
  return (
    <div className="flex items-start gap-2.5 bg-red-600 border border-red-700 rounded-xl px-4 py-3 animate-pulse shadow-md">
      <AlertTriangle className="w-5 h-5 text-[#F5E62B] shrink-0 mt-0.5" />
      <p className="text-sm text-[#F5E62B] leading-relaxed font-medium">
        <strong className="text-[#FFE800] font-black">Aviso:</strong> A Viagg-TX8 é uma vitrine digital e <strong className="text-[#FFE800] font-black">não intermediamos pagamentos</strong>, não garantimos qualidade de produtos/serviços e <strong className="text-[#FFE800] font-black">não somos responsáveis por acordos realizados entre as partes</strong>. Toda negociação é de responsabilidade exclusiva dos envolvidos.
      </p>
    </div>
  );
}
