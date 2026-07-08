/**
 * TravelerWalletTopup — "Adicionar saldo" da carteira do usuário viajante.
 *
 * Recarga em R$ via Mercado Pago que credita DIRETO no customer_wallet pay_*
 * (owner_type='customer', owner_id = auth.uid()) — a MESMA conta que os débitos
 * de corrida consomem e que MinhaCarteira.tsx lê. NÃO concede pontos/créditos de
 * módulo (metadata.kind='wallet_topup', sem grant_kind → sem desvio pra
 * platform_main).
 *
 * Reaproveita integralmente o fluxo já usado no lojista
 * (WalletTopupButton → usePaymentsOrchestrator.purchaseCredits → Edge Function
 * payments-charge → pay_payment_orders; webhook/reconcile confirma e credita).
 * A única diferença é o destino (customer_wallet) e o mínimo (R$ 35,00, o mesmo
 * exigido para chamar uma corrida).
 *
 * Backend necessário (rodar 1x no SQL Editor):
 *   supabase/migrations/20260707_pay_account_allow_customer_wallet.sql
 *   (libera customer_wallet no pay_get_or_create_account).
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePaymentsOrchestrator } from "@/hooks/usePaymentsOrchestrator";
import { openCheckoutUrl, getCheckoutBackUrl } from "@/lib/payments/openCheckout";
import { isEmbeddedCardCheckout, mercadoPagoPublicKey } from "@/lib/payments/checkoutConfig";
import { MercadoPagoBrickCheckout } from "@/components/payments/MercadoPagoBrickCheckout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  CheckCircle2,
  Copy,
  ExternalLink,
  AlertCircle,
  Clock,
} from "lucide-react";

type Step = "input" | "card" | "awaiting" | "confirmed" | "failed";

interface TopupOrder {
  id: string;
  pix_code: string | null;
  pix_qr: string | null;
  checkout_url: string | null;
}

/** Mínimo alinhado ao mínimo para chamar uma corrida. */
const MIN_REAIS = 35;
const PRESETS = [35, 50, 100];
const RETURN_TO = "/minha-carteira";

const formatBRL = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function TravelerWalletTopup({
  onSuccess,
  className,
  label = "Adicionar saldo",
}: {
  onSuccess?: () => void;
  className?: string;
  label?: string;
}) {
  const { user } = useAuth();
  const { purchaseCredits } = usePaymentsOrchestrator();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [reais, setReais] = useState("");
  const [processing, setProcessing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [order, setOrder] = useState<TopupOrder | null>(null);

  const reset = () => {
    setStep("input");
    setReais("");
    setOrder(null);
    setProcessing(false);
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) reset();
  };

  const previewCents = (() => {
    const val = parseFloat(reais.replace(",", "."));
    return Number.isFinite(val) ? Math.round(val * 100) : 0;
  })();

  const handleConfirm = async () => {
    const val = parseFloat(reais.replace(",", "."));
    if (!Number.isFinite(val) || val < MIN_REAIS) {
      toast.error(`Informe um valor de no mínimo R$ ${MIN_REAIS},00`);
      return;
    }
    if (!user?.id) {
      toast.error("Entre na sua conta para adicionar saldo.");
      return;
    }
    // Modo embutido (Payment Brick): coleta o cartão na própria tela.
    if (isEmbeddedCardCheckout() && mercadoPagoPublicKey()) {
      setStep("card");
      return;
    }
    const priceCents = Math.round(val * 100);
    setProcessing(true);
    try {
      const res = await purchaseCredits({
        merchant_owner_id: user.id, // reaproveitado como payer_owner_id
        payer_owner_type: "customer",
        account_type: "customer_wallet",
        package_price_cents: priceCents,
        package_name: `Recarga de Saldo — R$ ${formatBRL(priceCents)}`,
        method: "credit_card", // → Checkout Pro (cartão + PIX na página do MP)
        payer_email: user.email ?? undefined,
        metadata: { kind: "wallet_topup", back_url: getCheckoutBackUrl() },
      });
      const pp = res.charge.payment_payload ?? {};
      setOrder({
        id: res.order_id,
        pix_code: pp.pix_copy_paste ?? null,
        pix_qr: pp.pix_qr_base64 ?? null,
        checkout_url: pp.checkout_url ?? null,
      });
      if (pp.checkout_url) {
        openCheckoutUrl(pp.checkout_url, res.order_id, RETURN_TO);
      }
      setStep("awaiting");
      toast.info("Cobrança gerada! Aguardando pagamento...", { duration: 3000 });
    } catch (err: any) {
      toast.error("Erro ao gerar cobrança", { description: err?.message });
    } finally {
      setProcessing(false);
    }
  };

  // Cartão tokenizado pelo Brick (modo embutido) → cobra na hora via /v1/payments.
  const handleCardSubmit = async (formData: Record<string, unknown>) => {
    const val = parseFloat(reais.replace(",", "."));
    const priceCents = Math.round(val * 100);
    if (!user?.id) {
      toast.error("Entre na sua conta para adicionar saldo.");
      throw new Error("sem usuário");
    }
    try {
      const payer = formData.payer as { email?: string } | undefined;
      const res = await purchaseCredits({
        merchant_owner_id: user.id,
        payer_owner_type: "customer",
        account_type: "customer_wallet",
        package_price_cents: priceCents,
        package_name: `Recarga de Saldo — R$ ${formatBRL(priceCents)}`,
        method: "credit_card",
        payer_email: payer?.email ?? user.email ?? undefined,
        metadata: { kind: "wallet_topup" },
        card: formData,
      });
      const pp = res.charge.payment_payload ?? {};
      setOrder({
        id: res.order_id,
        pix_code: pp.pix_copy_paste ?? null,
        pix_qr: pp.pix_qr_base64 ?? null,
        checkout_url: pp.checkout_url ?? null,
      });
      // Cartão aprovado na hora → o backend já credita (syncedPaid). O poll
      // abaixo confirma pelo status da ordem; senão, "Já paguei" reconcilia.
      setStep(res.status === "paid" ? "confirmed" : "awaiting");
      if (res.status === "paid") {
        toast.success("Saldo adicionado à carteira! 🎉", { duration: 5000 });
        onSuccess?.();
      } else {
        toast.info("Pagamento enviado! Confirmando...", { duration: 3000 });
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "";
      const description = raw || "Falha no pagamento";
      toast.error("Não foi possível concluir o pagamento", { description });
      throw err; // deixa o Brick exibir o erro também
    }
  };

  // "Já paguei / verificar" — consulta o status REAL no MP e credita se aprovado
  // (sem depender do webhook, que pode não chegar em sandbox).
  const handleVerify = async () => {
    if (!order?.id) return;
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("payments-reconcile", {
        body: { order_id: order.id },
      });
      if (error) throw new Error(error.message);
      const status = (data as { status?: string; pending?: boolean } | null)?.status;
      if (status === "paid") {
        setStep("confirmed");
        toast.success("Saldo adicionado à carteira! 🎉", { duration: 5000 });
        onSuccess?.();
      } else if ((data as { pending?: boolean })?.pending) {
        toast.info("Pagamento ainda em processamento. Tente de novo em instantes.");
      } else {
        toast.info("Pagamento ainda não confirmado pelo Mercado Pago.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao verificar";
      toast.error("Não foi possível verificar agora", { description: msg });
    } finally {
      setVerifying(false);
    }
  };

  // Poll pay_payment_orders — webhook do MP confirma o pagamento.
  useEffect(() => {
    if (step !== "awaiting" || !order?.id) return;
    const interval = setInterval(async () => {
      const { data } = await (supabase.from("pay_payment_orders") as any)
        .select("status")
        .eq("id", order.id)
        .maybeSingle();
      const status = (data as { status?: string } | null)?.status ?? null;
      if (!status) return;
      if (status === "paid") {
        setStep("confirmed");
        toast.success("Saldo adicionado à carteira! 🎉", { duration: 5000 });
        onSuccess?.();
        clearInterval(interval);
      } else if (status === "failed" || status === "expired" || status === "cancelled") {
        setStep("failed");
        clearInterval(interval);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [step, order?.id, onSuccess]);

  return (
    <>
      <Button onClick={() => setOpen(true)} className={className}>
        <Plus className="mr-2 h-4 w-4" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FF6A00]/15 text-[#FF6A00]">
                <Plus className="h-5 w-5" />
              </span>
              Adicionar saldo
            </DialogTitle>
            <DialogDescription>
              Recarga em R$ via Mercado Pago. O valor entra na sua carteira e é
              usado para chamar suas corridas.
            </DialogDescription>
          </DialogHeader>

          {/* STEP: input */}
          {step === "input" && (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map((v) => {
                  const active = previewCents === v * 100;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setReais(String(v))}
                      className={`rounded-xl border p-3 text-center text-sm font-bold transition-all ${
                        active
                          ? "border-[#FF6A00] bg-[#FF6A00]/10 text-[#FF4500]"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-[#FF6A00]/40"
                      }`}
                    >
                      R$ {v}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Ou outro valor (mínimo R$ {MIN_REAIS},00)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-zinc-400">
                    R$
                  </span>
                  <Input
                    inputMode="decimal"
                    value={reais}
                    onChange={(e) => setReais(e.target.value)}
                    placeholder="0,00"
                    className="pl-10 text-lg font-bold"
                  />
                </div>
                <p className="text-xs text-zinc-500">
                  {previewCents >= MIN_REAIS * 100
                    ? `Você vai adicionar R$ ${formatBRL(previewCents)} de saldo`
                    : `Valor mínimo: R$ ${MIN_REAIS},00`}
                </p>
              </div>

              <Button
                onClick={handleConfirm}
                disabled={processing}
                size="lg"
                className="w-full font-bold text-white shadow-md"
                style={{ background: "linear-gradient(135deg, #FF6A00, #FF4500)" }}
              >
                {processing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  "Continuar para o pagamento"
                )}
              </Button>
            </div>
          )}

          {/* STEP: card (Payment Brick embutido) */}
          {step === "card" && (
            <div className="space-y-3 pt-1">
              <p className="text-xs text-zinc-500">
                Pagamento de{" "}
                <strong className="text-zinc-900">R$ {formatBRL(previewCents)}</strong>
              </p>
              <div className="flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2">
                <span aria-hidden className="text-amber-500">⚠️</span>
                <p className="text-xs text-amber-700">
                  Em alguns momentos o Mercado Pago pode apresentar uma{" "}
                  <strong>instabilidade temporária</strong> e recusar o cartão. Se
                  isso acontecer, aguarde alguns segundos e tente novamente — ou use
                  o PIX. Seu dinheiro não é cobrado quando o pagamento falha.
                </p>
              </div>
              {mercadoPagoPublicKey() ? (
                <div className="rounded-xl bg-white p-2">
                  <MercadoPagoBrickCheckout
                    publicKey={mercadoPagoPublicKey()!}
                    amount={previewCents / 100}
                    onSubmit={handleCardSubmit}
                  />
                </div>
              ) : (
                <p className="text-xs text-amber-600">
                  Configure <code>VITE_MERCADOPAGO_PUBLIC_KEY</code> para exibir o
                  formulário de cartão.
                </p>
              )}
              <Button
                variant="ghost"
                onClick={() => setStep("input")}
                className="w-full"
              >
                Voltar
              </Button>
            </div>
          )}

          {/* STEP: awaiting */}
          {step === "awaiting" && order && (
            <div className="space-y-4 pt-1">
              <div className="flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-50 p-3 text-amber-700">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-xs font-medium">
                  Abrimos o pagamento do Mercado Pago (PIX, cartão ou boleto). Após
                  pagar, o saldo entra automaticamente — pode deixar esta janela
                  aberta.
                </p>
              </div>

              {order.pix_qr && (
                <div className="flex justify-center">
                  <img
                    src={`data:image/png;base64,${order.pix_qr}`}
                    alt="QR Code PIX"
                    className="h-48 w-48 rounded-lg bg-white p-2"
                  />
                </div>
              )}

              {order.pix_code && (
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    PIX Copia e Cola
                  </Label>
                  <div className="flex gap-2">
                    <Input readOnly value={order.pix_code} className="text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(order.pix_code!);
                        toast.success("Código PIX copiado!");
                      }}
                      className="shrink-0"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {order.checkout_url && (
                <Button
                  variant="outline"
                  onClick={() => openCheckoutUrl(order.checkout_url, order.id, RETURN_TO)}
                  className="w-full font-bold"
                >
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  Abrir pagamento no Mercado Pago
                </Button>
              )}

              <Button
                onClick={handleVerify}
                disabled={verifying}
                size="lg"
                className="w-full font-bold text-white"
                style={{ background: "linear-gradient(135deg, #FF6A00, #FF4500)" }}
              >
                {verifying ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  "Já paguei — verificar agora"
                )}
              </Button>

              <Button
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                className="w-full"
              >
                Fechar (o pagamento continua válido)
              </Button>
            </div>
          )}

          {/* STEP: confirmed */}
          {step === "confirmed" && (
            <div className="flex flex-col items-center space-y-3 py-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <p className="text-base font-bold text-zinc-900">Saldo adicionado!</p>
              <p className="text-xs text-zinc-500">
                Seu saldo já está disponível para chamar corridas.
              </p>
              <Button
                onClick={() => handleOpenChange(false)}
                size="lg"
                className="mt-2 w-full font-bold text-white"
                style={{ background: "linear-gradient(135deg, #FF6A00, #FF4500)" }}
              >
                Concluir
              </Button>
            </div>
          )}

          {/* STEP: failed */}
          {step === "failed" && (
            <div className="flex flex-col items-center space-y-3 py-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100">
                <AlertCircle className="h-8 w-8 text-red-500" />
              </div>
              <p className="text-base font-bold text-zinc-900">
                Pagamento não concluído
              </p>
              <p className="text-xs text-zinc-500">
                A cobrança expirou ou foi cancelada. Tente novamente.
              </p>
              <Button
                onClick={reset}
                size="lg"
                className="mt-2 w-full font-bold text-white"
                style={{ background: "linear-gradient(135deg, #FF6A00, #FF4500)" }}
              >
                Tentar de novo
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
