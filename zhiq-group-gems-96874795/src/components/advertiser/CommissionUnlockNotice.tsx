/**
 * CommissionUnlockNotice — aviso ÚNICO da comissão de 2% na liberação de contato.
 * Fonte de verdade da mensagem (evita 3 cópias divergentes). Usado em Leads,
 * Mensagens e Carteira do anunciante. O valor é calculado 100% no backend
 * (wallet_unlock_charge_cents: 2% do valor anunciado, piso R$9, cobrança única
 * por interessado). Este componente é só informativo — não faz cobrança.
 */
import { Unlock } from "lucide-react";

export function CommissionUnlockNotice({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-xl border border-[#FF6A00]/30 bg-[#FF6A00]/[0.06] px-4 py-3 flex items-start gap-3 ${className}`}
    >
      <Unlock className="w-5 h-5 text-[#FF6A00] shrink-0 mt-0.5" />
      <div className="text-[13px] leading-relaxed text-[#C7CFDA]">
        <span className="font-black text-[#F5F7FA]">Como funciona a liberação de contato:</span>{" "}
        ao liberar um interessado, debitamos da sua carteira uma comissão de{" "}
        <span className="font-black text-[#FF6A00]">2% do valor anunciado</span>{" "}
        (mínimo <span className="font-bold text-[#F5F7FA]">R$ 9</span>). É{" "}
        <span className="font-bold text-emerald-400">cobrança única por interessado</span>{" "}
        — o mesmo contato nunca é cobrado duas vezes, mesmo após recarregar a página.
        O valor é calculado automaticamente pela plataforma a partir do preço do seu anúncio.
      </div>
    </div>
  );
}

export default CommissionUnlockNotice;
