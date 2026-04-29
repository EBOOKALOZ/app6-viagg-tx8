/**
 * PixPaymentModal
 *
 * Exibe o estado de pagamento PIX para uma compra de créditos.
 * 
 * Estados:
 *  - awaiting_payment: mostra copia-e-cola, QR code e polling automático
 *  - paid: confirmação visual + fecha após 2s
 *  - failed/expired: mensagem de erro com opção de nova tentativa
 *
 * Integração:
 *  - Recebe checkout_payload (do banco) com pix_copia_cola, pix_qr_code_base64, etc.
 *  - Faz polling via pollPurchaseStatus a cada 5s
 *  - Sinal de paid chega via Realtime (webhook do gateway confirma)
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Clock,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  QrCode,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { PurchaseStatusType, CheckoutPayload } from "@/hooks/useAdvertiserLeadsDashboard";

// ─── Props ────────────────────────────────────────────────────────────────────

interface PixPaymentModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  purchaseId: string | null;
  packageName: string;
  creditsTotal: number;
  amountBrl: number;
  checkoutPayload: CheckoutPayload;
  initialStatus: PurchaseStatusType;
  onPollStatus: (purchaseId: string) => Promise<PurchaseStatusType | null>;
  onConfirmed: () => void;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function PixPaymentModal({
  open,
  onOpenChange,
  purchaseId,
  packageName,
  creditsTotal,
  amountBrl,
  checkoutPayload,
  initialStatus,
  onPollStatus,
  onConfirmed,
}: PixPaymentModalProps) {
  const [status, setStatus] = useState<PurchaseStatusType>(initialStatus);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Polling de status a cada 5s ──────────────────────────────────────────
  useEffect(() => {
    if (!open || !purchaseId || status === "paid" || status === "failed" || status === "expired" || status === "cancelled") {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    pollingRef.current = setInterval(async () => {
      const newStatus = await onPollStatus(purchaseId);
      if (newStatus && newStatus !== status) {
        setStatus(newStatus);
        if (newStatus === "paid") {
          setTimeout(() => {
            onConfirmed();
            onOpenChange(false);
          }, 2000);
        }
      }
    }, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [open, purchaseId, status, onPollStatus, onConfirmed, onOpenChange]);

  // ── Countdown de expiração ────────────────────────────────────────────────
  useEffect(() => {
    if (!checkoutPayload.pix_expiration) return;
    const expiry = new Date(checkoutPayload.pix_expiration).getTime();

    const update = () => {
      const diff = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      setTimeLeft(diff);
      if (diff === 0 && status === "awaiting_payment") {
        setStatus("expired");
      }
    };

    update();
    timerRef.current = setInterval(update, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [checkoutPayload.pix_expiration, status]);

  // ── Reset quando abre ────────────────────────────────────────────────────
  useEffect(() => {
    if (open) setStatus(initialStatus);
  }, [open, initialStatus]);

  const handleCopy = async () => {
    if (!checkoutPayload.pix_copia_cola) return;
    await navigator.clipboard.writeText(checkoutPayload.pix_copia_cola);
    setCopied(true);
    toast.success("PIX copiado! Cole no seu app de banco.");
    setTimeout(() => setCopied(false), 3000);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const formatBRL = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // ── Conteúdo por status ───────────────────────────────────────────────────

  const renderContent = () => {
    if (status === "paid") {
      return (
        <div className="flex flex-col items-center gap-6 py-10 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center animate-in zoom-in-50 duration-500">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <div className="space-y-2">
            <p className="text-2xl font-black text-zinc-900">Pagamento Confirmado!</p>
            <p className="text-sm text-emerald-600 font-bold">
              {creditsTotal} créditos adicionados ao seu saldo
            </p>
          </div>
          <div className="bg-emerald-50 rounded-2xl px-6 py-4 border border-emerald-100">
            <p className="text-xs text-emerald-700 font-medium">
              Seus créditos já estão disponíveis para desbloquear contatos.
            </p>
          </div>
        </div>
      );
    }

    if (status === "failed" || status === "cancelled") {
      return (
        <div className="flex flex-col items-center gap-6 py-10 text-center">
          <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center">
            <XCircle className="w-10 h-10 text-red-500" />
          </div>
          <div className="space-y-2">
            <p className="text-xl font-black text-zinc-900">Pagamento não processado</p>
            <p className="text-sm text-zinc-500 font-medium">
              O pagamento falhou ou foi cancelado. Tente novamente com um novo pedido.
            </p>
          </div>
          <Button
            onClick={() => onOpenChange(false)}
            className="h-12 px-8 rounded-2xl bg-zinc-900 text-white font-black text-xs uppercase tracking-widest"
          >
            Fechar e Tentar Novamente
          </Button>
        </div>
      );
    }

    if (status === "expired") {
      return (
        <div className="flex flex-col items-center gap-6 py-10 text-center">
          <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center">
            <Clock className="w-10 h-10 text-amber-500" />
          </div>
          <div className="space-y-2">
            <p className="text-xl font-black text-zinc-900">PIX Expirado</p>
            <p className="text-sm text-zinc-500 font-medium">
              O tempo para pagamento encerrou. Crie um novo pedido para continuar.
            </p>
          </div>
          <Button
            onClick={() => onOpenChange(false)}
            className="h-12 px-8 rounded-2xl bg-orange-600 text-white font-black text-xs uppercase tracking-widest"
          >
            Fazer Novo Pedido
          </Button>
        </div>
      );
    }

    // Estado: pending ou awaiting_payment
    const pixCode = checkoutPayload.pix_copia_cola;
    const qrBase64 = checkoutPayload.pix_qr_code_base64;

    return (
      <div className="space-y-6">
        {/* Info do pedido */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-50 rounded-2xl p-4 space-y-1">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Pacote</p>
            <p className="font-black text-zinc-900 text-sm">{packageName}</p>
          </div>
          <div className="bg-zinc-50 rounded-2xl p-4 space-y-1">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Créditos</p>
            <p className="font-black text-orange-600 text-sm">{creditsTotal} créditos</p>
          </div>
          <div className="bg-orange-50 rounded-2xl p-4 space-y-1 col-span-2">
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Valor a Pagar</p>
            <p className="font-black text-zinc-900 text-2xl">{formatBRL(amountBrl)}</p>
          </div>
        </div>

        {/* QR Code (se disponível) */}
        {qrBase64 && (
          <div className="flex flex-col items-center gap-3 p-4 bg-white border-2 border-zinc-100 rounded-2xl">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
              <QrCode className="w-3.5 h-3.5" /> QR Code PIX
            </p>
            <img
              src={`data:image/png;base64,${qrBase64}`}
              alt="QR Code PIX"
              className="w-48 h-48 rounded-xl"
            />
          </div>
        )}

        {/* Copia e Cola */}
        {pixCode ? (
          <div className="space-y-2">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">PIX Copia e Cola</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 font-mono text-xs text-zinc-600 overflow-hidden">
                <span className="block truncate">{pixCode}</span>
              </div>
              <Button
                onClick={handleCopy}
                size="icon"
                className={cn(
                  "w-12 h-12 rounded-2xl shrink-0 transition-all",
                  copied
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-900 text-white hover:bg-zinc-800"
                )}
              >
                {copied ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        ) : (
          /* Se não tem PIX ainda — modo manual (sem gateway integrado) */
          <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100 space-y-3">
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
              Instruções de Pagamento
            </p>
            <p className="text-sm text-amber-800 font-medium leading-relaxed">
              {checkoutPayload.instructions ||
                "Entre em contato com o suporte para finalizar o pagamento deste pacote. Informe o ID do pedido abaixo."}
            </p>
            <div className="bg-white rounded-xl px-4 py-2 border border-amber-200">
              <p className="text-[10px] text-amber-500 font-black uppercase tracking-widest mb-0.5">ID do Pedido</p>
              <p className="font-mono text-xs text-zinc-700">{purchaseId}</p>
            </div>
          </div>
        )}

        {/* Countdown + polling indicator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <p className="text-xs font-bold text-zinc-500">
              Aguardando confirmação do pagamento...
            </p>
          </div>
          {timeLeft !== null && (
            <div className={cn(
              "flex items-center gap-1.5 text-xs font-black tabular-nums",
              timeLeft < 120 ? "text-red-500" : "text-zinc-400"
            )}>
              <Clock className="w-3.5 h-3.5" />
              {formatTime(timeLeft)}
            </div>
          )}
        </div>

        {/* Manual check */}
        <Button
          onClick={async () => {
            const s = await onPollStatus(purchaseId!);
            if (s) setStatus(s);
            if (s === "paid") {
              setTimeout(() => { onConfirmed(); onOpenChange(false); }, 1500);
            } else {
              toast.info("Pagamento ainda não confirmado. Aguarde alguns instantes.");
            }
          }}
          variant="outline"
          size="sm"
          className="w-full h-10 rounded-2xl font-black text-[10px] uppercase tracking-widest border-zinc-200 text-zinc-600 hover:border-orange-300 hover:text-orange-600"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Verificar pagamento agora
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-[36px] border-0 shadow-2xl p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 px-8 pt-8 pb-6">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-500/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <DialogTitle className="text-white font-black text-xl leading-none">
                  {status === "paid" ? "Créditos Adicionados!" : "Pagamento PIX"}
                </DialogTitle>
                <p className="text-zinc-400 text-xs font-medium mt-1">
                  {status === "paid"
                    ? packageName
                    : "Realize o pagamento para liberar seus créditos"}
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="p-8 bg-white">
          {renderContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
