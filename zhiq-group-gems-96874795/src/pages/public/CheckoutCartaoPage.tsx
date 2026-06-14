/**
 * CheckoutCartaoPage — tela de pagamento com cartão embutida (Mercado Pago Brick).
 *
 * Rota: /pagamento/cartao?valor=280&email=cliente@email.com
 *
 * Renderiza o Payment Brick do Mercado Pago dentro do app, num layout
 * mobile-first (max-w-md), em vez de redirecionar para a página hospedada do MP
 * (que estourava a tela no celular).
 *
 * Para COBRAR de fato, conectar o `onSubmit` (formData tokenizado) a um endpoint
 * que chame POST /v1/payments no Mercado Pago.
 */
import { useSearchParams } from "react-router-dom";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { MercadoPagoBrickCheckout } from "@/components/payments/MercadoPagoBrickCheckout";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CheckoutCartaoPage() {
  const [params] = useSearchParams();
  const amount = Number(params.get("valor") ?? params.get("amount") ?? 10) || 10;
  const payerEmail = params.get("email") ?? undefined;
  const publicKey = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY as string | undefined;

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#FF6A00] text-white px-4 py-4 shadow-sm">
        <div className="max-w-md mx-auto flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          <div>
            <h1 className="text-base font-black leading-tight">Pagamento com cartão</h1>
            <p className="text-[11px] text-white/80">Ambiente seguro · Mercado Pago</p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-5">
        <div className="max-w-md mx-auto space-y-4">
          {/* Resumo do valor */}
          <div className="rounded-2xl bg-white border border-zinc-100 shadow-sm p-4 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-500">Total a pagar</span>
            <span className="text-2xl font-black text-zinc-900">{formatBRL(amount)}</span>
          </div>

          {!publicKey ? (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div className="text-xs leading-relaxed">
                <p className="font-bold">Chave pública do Mercado Pago não configurada.</p>
                <p className="mt-1">
                  Defina <code className="font-mono">VITE_MERCADOPAGO_PUBLIC_KEY</code> no arquivo
                  <code className="font-mono"> .env</code> (use a chave de teste
                  <code className="font-mono"> TEST-...</code> em sandbox) e reinicie o servidor.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-zinc-100 shadow-sm p-3">
              <MercadoPagoBrickCheckout
                publicKey={publicKey}
                amount={amount}
                payerEmail={payerEmail}
                onSubmit={async (formData) => {
                  // TODO(backend): enviar formData (token do cartão) para um endpoint
                  // que chame POST /v1/payments no Mercado Pago e confirme a cobrança.
                  console.log("[CheckoutCartao] formData tokenizado:", formData);
                  toast.success("Cartão validado! Falta conectar a cobrança no backend.", {
                    duration: 6000,
                  });
                }}
              />
            </div>
          )}

          <p className="text-center text-[10px] text-zinc-400 px-4">
            Seus dados de cartão são processados com segurança pelo Mercado Pago. A Viagg-TX8 não
            armazena o número do seu cartão.
          </p>
        </div>
      </main>
    </div>
  );
}
