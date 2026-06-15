/**
 * MercadoPagoBrickCheckout — monta o Payment Brick oficial do Mercado Pago.
 *
 * O Brick é responsivo: ocupa 100% da largura do container. Colocando-o num
 * container estreito (max-w-md) ele já renderiza em "modo celular", resolvendo
 * o problema da página hospedada que estourava a tela.
 *
 * Observação de backend: o `onSubmit` recebe os dados tokenizados do cartão
 * (`formData` com `token`, `payment_method_id`, `installments`, etc). Para COBRAR
 * de fato, esse `formData` precisa ser enviado a um endpoint que chame
 * POST /v1/payments no Mercado Pago. Aqui apenas expomos o callback.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { loadMercadoPagoSdk } from "@/lib/payments/mercadopagoSdk";

const BRICK_CONTAINER_ID = "mp-payment-brick-container";

export interface MercadoPagoBrickCheckoutProps {
  /** Chave pública do MP (TEST-... em sandbox | APP_USR-... em produção). */
  publicKey: string;
  /** Valor a cobrar, em reais (ex.: 280.00). */
  amount: number;
  /** E-mail do pagador (pré-preenche o Brick). */
  payerEmail?: string;
  /**
   * Chamado quando o usuário envia o formulário. Recebe o `formData` tokenizado.
   * Deve retornar uma Promise (o Brick mostra loading até resolver).
   */
  onSubmit?: (formData: Record<string, unknown>) => Promise<void> | void;
}

export function MercadoPagoBrickCheckout({
  publicKey,
  amount,
  payerEmail,
  onSubmit,
}: MercadoPagoBrickCheckoutProps) {
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let controller: any = null;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const MercadoPago = await loadMercadoPagoSdk();
        if (cancelled) return;

        const mp = new MercadoPago(publicKey, { locale: "pt-BR" });
        const bricks = mp.bricks();
        controller = await bricks.create("payment", BRICK_CONTAINER_ID, {
          initialization: {
            amount,
            ...(payerEmail ? { payer: { email: payerEmail } } : {}),
          },
          customization: {
            visual: {
              hidePaymentButton: false,
              // Botão "Pagar" no verde da marca (inclui o estado de carregando).
              style: {
                theme: "default",
                customVariables: {
                  baseColor: "#10b981",            // emerald-500 (botão Pagar)
                  baseColorFirstVariant: "#059669", // emerald-600 (hover)
                  baseColorSecondVariant: "#047857", // emerald-700 (ativo/loading)
                  buttonTextColor: "#ffffff",
                },
              },
            },
            paymentMethods: {
              creditCard: "all",
              debitCard: "all",
              ticket: "all",
              bankTransfer: "all",
            },
          },
          callbacks: {
            onReady: () => {
              if (!cancelled) setLoading(false);
            },
            onError: (err: { message?: string }) => {
              if (!cancelled) {
                setError(err?.message || "Erro no formulário de pagamento.");
                setLoading(false);
              }
            },
            onSubmit: async ({ formData }: { formData: Record<string, unknown> }) => {
              await onSubmitRef.current?.(formData);
            },
          },
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Falha ao iniciar o checkout.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        controller?.unmount?.();
      } catch {
        /* noop */
      }
    };
  }, [publicKey, amount, payerEmail]);

  return (
    <div className="w-full max-w-md mx-auto">
      {loading && (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-xs font-medium">Carregando pagamento seguro…</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p className="text-xs font-medium leading-relaxed">{error}</p>
        </div>
      )}

      {/* O Brick é injetado aqui pelo SDK do Mercado Pago */}
      <div id={BRICK_CONTAINER_ID} />
    </div>
  );
}

export default MercadoPagoBrickCheckout;
