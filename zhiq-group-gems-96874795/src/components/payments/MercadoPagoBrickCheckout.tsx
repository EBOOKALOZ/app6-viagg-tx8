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
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { loadMercadoPagoSdk } from "@/lib/payments/mercadopagoSdk";

const BRICK_CONTAINER_ID = "mp-payment-brick-container";
// Sequencial p/ gerar um container novo a cada montagem do Brick.
let brickInstanceSeq = 0;

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

// ── Escudo local: se o Brick derrubar a renderização (removeChild/
// insertBefore de DOM que o SDK mexeu), o erro fica CONTIDO aqui —
// nunca mais derruba o app inteiro na tela "Algo deu errado".
class BrickBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { broken: boolean }
> {
  state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  componentDidCatch(error: Error) {
    console.error("Payment Brick quebrou a renderização:", error);
  }
  render() {
    if (this.state.broken) {
      return (
        <div className="w-full max-w-md mx-auto space-y-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-center">
          <p className="text-sm font-semibold text-amber-800">
            O formulário de pagamento travou.
          </p>
          <button
            type="button"
            onClick={this.props.onRetry}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
          >
            Recarregar formulário
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function MercadoPagoBrickCheckout(props: MercadoPagoBrickCheckoutProps) {
  const [epoch, setEpoch] = useState(0);
  return (
    <BrickBoundary key={epoch} onRetry={() => setEpoch((e) => e + 1)}>
      <MercadoPagoBrickCheckoutInner {...props} />
    </BrickBoundary>
  );
}

function MercadoPagoBrickCheckoutInner({
  publicKey,
  amount,
  payerEmail,
  onSubmit,
}: MercadoPagoBrickCheckoutProps) {
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let controller: any = null;
    // O Brick injeta iframes no container. Se o React for o dono desse nó,
    // qualquer re-render/desmonte dá "removeChild: o nó não é filho" (o MP
    // trocou os filhos por baixo). Solução: criar o container NA MÃO dentro
    // de um host estável e removê-lo nós mesmos no cleanup.
    let inner: HTMLDivElement | null = null;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const MercadoPago = await loadMercadoPagoSdk();
        if (cancelled || !hostRef.current) return;

        // Id ÚNICO por montagem: em dev o React monta o efeito 2x
        // (StrictMode) e, com id fixo, a montagem atrasada agarrava o
        // container da nova → guerra de removeChild entre os dois Bricks.
        const containerId = `${BRICK_CONTAINER_ID}-${++brickInstanceSeq}`;
        inner = document.createElement("div");
        inner.id = containerId;
        hostRef.current.appendChild(inner);

        const mp = new MercadoPago(publicKey, { locale: "pt-BR" });
        const bricks = mp.bricks();
        controller = await bricks.create("payment", containerId, {
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
        // create() resolveu depois do desmonte → desfaz na hora.
        if (cancelled) {
          try { controller?.unmount?.(); } catch { /* noop */ }
        }
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
      // Remove o container do Brick fora do React (é DOM nosso, não dele).
      try {
        inner?.parentNode?.removeChild(inner);
      } catch {
        /* noop */
      }
    };
  }, [publicKey, amount, payerEmail]);

  return (
    // translate="no": tradutor automático do navegador embrulha textos em
    // <font> e quebra o React (insertBefore/removeChild em nó órfão).
    <div className="w-full max-w-md mx-auto" translate="no">
      {/* Zona SÓ do React: aparece/some sem tocar nos irmãos do Brick.
          O React nunca insere/remove nada relativo à zona do MP abaixo. */}
      <div>
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
      </div>

      {/* Zona SÓ do MP: o container do Brick é criado/removido manualmente
          dentro do host (nunca pelo React) — evita removeChild/insertBefore. */}
      <div ref={hostRef} />
    </div>
  );
}

export default MercadoPagoBrickCheckout;
