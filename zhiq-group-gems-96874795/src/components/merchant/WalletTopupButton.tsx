/**
 * WalletTopupButton — "Comprar + Saldo" (recarga em R$ via Mercado Pago)
 *
 * Recarga avulsa em R$ que credita DIRETO no merchant_wallet pay_* — a mesma
 * conta debitada ao pagar o motoboy pela entrega (requestDelivery). NÃO concede
 * pontos/créditos (não manda grant_kind → pay_grant_legacy faz skip).
 *
 * Reaproveita exatamente o fluxo já usado em MerchantCredits.tsx
 * (usePaymentsOrchestrator.purchaseCredits → Edge Function payments-charge →
 * pay_payment_orders; webhook confirma o pagamento e credita o saldo).
 */
import { useState, useEffect } from "react";
import { useMerchantCredits } from "@/hooks/useMerchantCredits";
import { usePaymentsOrchestrator } from "@/hooks/usePaymentsOrchestrator";
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
  Banknote,
  Loader2,
  CheckCircle2,
  Copy,
  ExternalLink,
  AlertCircle,
  Clock,
} from "lucide-react";

type Step = "input" | "awaiting" | "confirmed" | "failed";

interface TopupOrder {
  id: string;
  pix_code: string | null;
  pix_qr: string | null;
  checkout_url: string | null;
}

const formatBRL = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function WalletTopupButton({
  onSuccess,
  className,
}: {
  onSuccess?: () => void;
  className?: string;
}) {
  const { storeId } = useMerchantCredits();
  const { purchaseCredits } = usePaymentsOrchestrator();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [reais, setReais] = useState("");
  const [processing, setProcessing] = useState(false);
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

  const handleConfirm = async () => {
    const val = parseFloat(reais.replace(",", "."));
    if (!Number.isFinite(val) || val < 5) {
      toast.error("Informe um valor de no mínimo R$ 5,00");
      return;
    }
    if (!storeId) {
      toast.error("Loja não encontrada");
      return;
    }
    const priceCents = Math.round(val * 100);
    setProcessing(true);
    try {
      // wallet-topup: SEM grant_kind → pay_grant_legacy faz skip; o webhook
      // credita o valor em R$ no merchant_wallet pay_* (target_account_id),
      // exatamente a conta debitada ao pagar o motoboy.
      //
      // method "credit_card" → Edge Function gera uma PREFERENCE (Checkout
      // Pro hospedado do MP), NÃO um PIX direto. O Checkout Pro já oferece
      // PIX/cartão/boleto dentro da página do MP e funciona no sandbox —
      // PIX direto (/v1/payments) falha no sandbox porque a conta de teste
      // não tem chave PIX habilitada p/ render do QR.
      const res = await purchaseCredits({
        merchant_owner_id: storeId,
        package_price_cents: priceCents,
        package_name: `Recarga de Saldo — R$ ${formatBRL(priceCents)}`,
        method: "credit_card",
        metadata: {},
      });
      const pp = res.charge.payment_payload ?? {};
      setOrder({
        id: res.order_id,
        pix_code: pp.pix_copy_paste ?? null,
        pix_qr: pp.pix_qr_base64 ?? null,
        checkout_url: pp.checkout_url ?? null,
      });
      if (pp.checkout_url) {
        window.open(pp.checkout_url, "_blank", "noopener");
      }
      setStep("awaiting");
      toast.info("Cobrança gerada! Aguardando pagamento...", { duration: 3000 });
    } catch (err: any) {
      toast.error("Erro ao gerar cobrança", { description: err?.message });
    } finally {
      setProcessing(false);
    }
  };

  // Poll pay_payment_orders — webhook do Mercado Pago confirma o pagamento.
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
      } else if (
        status === "failed" ||
        status === "expired" ||
        status === "cancelled"
      ) {
        setStep("failed");
        clearInterval(interval);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [step, order?.id, onSuccess]);

  const previewCents = (() => {
    const val = parseFloat(reais.replace(",", "."));
    return Number.isFinite(val) ? Math.round(val * 100) : 0;
  })();

  return (
    <>
      <Button onClick={() => setOpen(true)} className={className}>
        <Banknote className="h-4 w-4 mr-1.5" />
        Comprar + Saldo
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md bg-[#1B1F24] border-[#2A3038] text-[#F5F7FA]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#F5F7FA]">
              <Banknote className="h-5 w-5 text-emerald-400" />
              Comprar + Saldo
            </DialogTitle>
            <DialogDescription className="text-[#A7B0BE]">
              Recarga em R$ via Mercado Pago. O valor entra na sua carteira e é
              usado para pagar o motoboy pela entrega.
            </DialogDescription>
          </DialogHeader>

          {/* STEP: input */}
          {step === "input" && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-[#A7B0BE] text-xs uppercase tracking-wider font-bold">
                  Valor da recarga (mínimo R$ 5,00)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A7B0BE] font-bold">
                    R$
                  </span>
                  <Input
                    inputMode="decimal"
                    value={reais}
                    onChange={(e) => setReais(e.target.value)}
                    placeholder="0,00"
                    className="bg-[#0D0F12] border-[#2A3038] text-white placeholder:text-[#A7B0BE]/40 pl-10 text-lg font-bold"
                  />
                </div>
                <p className="text-xs text-[#A7B0BE]/70">
                  {previewCents >= 500
                    ? `Você vai adicionar R$ ${formatBRL(previewCents)} de saldo`
                    : "—"}
                </p>
              </div>
              <Button
                onClick={handleConfirm}
                disabled={processing}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
              >
                {processing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Continuar para o pagamento"
                )}
              </Button>
            </div>
          )}

          {/* STEP: awaiting */}
          {step === "awaiting" && order && (
            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300">
                <Clock className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="text-xs font-medium">
                  Abrimos o pagamento do Mercado Pago em outra aba (PIX, cartão
                  ou boleto). Após pagar, o saldo entra automaticamente — pode
                  deixar esta janela aberta.
                </p>
              </div>

              {order.pix_qr && (
                <div className="flex justify-center">
                  <img
                    src={`data:image/png;base64,${order.pix_qr}`}
                    alt="QR Code PIX"
                    className="w-48 h-48 rounded-lg bg-white p-2"
                  />
                </div>
              )}

              {order.pix_code && (
                <div className="space-y-2">
                  <Label className="text-[#A7B0BE] text-xs uppercase tracking-wider font-bold">
                    PIX Copia e Cola
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={order.pix_code}
                      className="bg-[#0D0F12] border-[#2A3038] text-white text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(order.pix_code!);
                        toast.success("Código PIX copiado!");
                      }}
                      className="border-[#2A3038] text-[#A7B0BE] hover:bg-[#2A3038] hover:text-white shrink-0"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {order.checkout_url && (
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(order.checkout_url!, "_blank", "noopener")
                  }
                  className="w-full border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10 hover:text-emerald-100 font-bold"
                >
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  Abrir pagamento no Mercado Pago
                </Button>
              )}

              <Button
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                className="w-full text-[#A7B0BE] hover:text-white hover:bg-[#2A3038]"
              >
                Fechar (o pagamento continua válido)
              </Button>
            </div>
          )}

          {/* STEP: confirmed */}
          {step === "confirmed" && (
            <div className="flex flex-col items-center text-center py-6 space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <p className="text-base font-bold text-[#F5F7FA]">
                Saldo adicionado!
              </p>
              <p className="text-xs text-[#A7B0BE]">
                Seu saldo já está disponível para pagar entregas.
              </p>
              <Button
                onClick={() => handleOpenChange(false)}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold mt-2"
              >
                Concluir
              </Button>
            </div>
          )}

          {/* STEP: failed */}
          {step === "failed" && (
            <div className="flex flex-col items-center text-center py-6 space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-red-400" />
              </div>
              <p className="text-base font-bold text-[#F5F7FA]">
                Pagamento não concluído
              </p>
              <p className="text-xs text-[#A7B0BE]">
                A cobrança expirou ou foi cancelada. Tente novamente.
              </p>
              <Button
                onClick={reset}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold mt-2"
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
