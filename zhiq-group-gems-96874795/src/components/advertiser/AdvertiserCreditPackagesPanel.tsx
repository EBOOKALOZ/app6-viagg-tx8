/**
 * AdvertiserCreditPackagesPanel (v2)
 *
 * Grid de pacotes de créditos com fluxo de compra completo:
 *   1. Usuário escolhe pacote → create_advertiser_credit_purchase (RPC)
 *   2. Modal PIX abre com checkout_payload
 *   3. Polling automático a cada 5s
 *   4. Quando paid → fecha + refresca saldo
 *
 * Sem créditos manuais. Sem débito direto no frontend.
 */

import React, { useState } from "react";
import {
  Sparkles, CheckCircle2, Loader2, Star, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useAdvertiserCreditPackages,
  useAdvertiserCreditPurchase,
  type AdvertiserCreditPackage,
} from "@/hooks/useAdvertiserCreditPurchase";
import { PixPaymentModal } from "@/components/advertiser/PixPaymentModal";
import type { CheckoutPayload, PurchaseStatusType } from "@/hooks/useAdvertiserLeadsDashboard";

// ─── Props ────────────────────────────────────────────────────────────────────

interface AdvertiserCreditPackagesPanelProps {
  availableCredits?: number;
  showInsufficientBanner?: boolean;
  requiredCredits?: number;
  onPurchaseConfirmed?: () => void;
  pollStatus: (purchaseId: string) => Promise<PurchaseStatusType | null>;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function AdvertiserCreditPackagesPanel({
  availableCredits = 0,
  showInsufficientBanner = false,
  requiredCredits,
  onPurchaseConfirmed,
  pollStatus,
}: AdvertiserCreditPackagesPanelProps) {
  const { data: packages = [], isLoading } = useAdvertiserCreditPackages();
  const { initiatePurchase, isCreating } = useAdvertiserCreditPurchase();

  const [loadingPkgId, setLoadingPkgId] = useState<string | null>(null);
  const [pixModal, setPixModal] = useState<{
    open: boolean;
    purchaseId: string;
    packageName: string;
    creditsTotal: number;
    amountBrl: number;
    checkoutPayload: CheckoutPayload;
    status: PurchaseStatusType;
  } | null>(null);

  const deficit = requiredCredits ? Math.max(0, requiredCredits - availableCredits) : null;

  const handleBuy = async (pkg: AdvertiserCreditPackage) => {
    setLoadingPkgId(pkg.id);
    try {
      const result = await initiatePurchase(pkg.id);
      if (!result.success) {
        toast.error(`Erro ao criar pedido: ${result.error}`);
        return;
      }

      // Abre modal PIX (sem checkout_payload ainda → modo instruções manuais)
      setPixModal({
        open: true,
        purchaseId: result.purchaseId!,
        packageName: pkg.name,
        creditsTotal: result.creditsTotal!,
        amountBrl: result.amountBrl!,
        checkoutPayload: {
          instructions: `Pedido criado! ID: ${result.purchaseId}. Entre em contato com o suporte informando este ID para finalizar o pagamento e liberar seus créditos.`,
        },
        status: "pending",
      });
    } finally {
      setLoadingPkgId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="py-16 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Banner saldo insuficiente ── */}
      {showInsufficientBanner && deficit !== null && deficit > 0 && (
        <div className="flex items-start gap-4 p-5 bg-amber-50 border border-amber-200 rounded-2xl">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="font-black text-amber-800 text-sm uppercase tracking-tight">
              Você não possui créditos suficientes
            </p>
            <p className="text-amber-700 text-xs font-medium mt-0.5">
              Saldo: <strong>{availableCredits}</strong> · Faltam <strong>{deficit} crédito{deficit !== 1 ? "s" : ""}</strong> para desbloquear este contato.
            </p>
          </div>
        </div>
      )}

      {/* ── Título ── */}
      <div className="space-y-1">
        <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> Pacotes de Créditos para Leads
        </p>
        <h3 className="text-xl font-black text-zinc-900">
          Escolha seu pacote de desbloqueios
        </h3>
        <p className="text-sm text-zinc-500 font-medium">
          Créditos válidos para desbloquear contatos de imóveis e veículos. Apenas créditos confirmados são aceitos.
        </p>
      </div>

      {/* ── Grid de pacotes ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {packages.map((pkg) => (
          <Card
            key={pkg.id}
            className={cn(
              "relative border-2 rounded-[28px] overflow-hidden transition-all duration-200 flex flex-col",
              pkg.is_featured
                ? "border-orange-400 shadow-orange-100 shadow-lg"
                : "border-zinc-200 hover:border-orange-200 hover:shadow-md"
            )}
          >
            {pkg.is_featured && (
              <div className="absolute top-0 left-0 right-0 bg-orange-600 text-white text-center py-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1">
                  <Star className="w-3 h-3 fill-current" />
                  {pkg.badge_text ?? "Mais Popular"}
                </p>
              </div>
            )}

            <CardContent className={cn("p-6 space-y-4 flex-1 flex flex-col", pkg.is_featured && "pt-10")}>

              {/* Nome + bônus */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-zinc-900 text-lg">{pkg.name}</h4>
                  {pkg.credits_bonus > 0 && (
                    <Badge className="bg-emerald-100 text-emerald-700 font-black text-[10px] border-0">
                      +{pkg.credits_bonus} bônus
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{pkg.package_type}</p>
              </div>

              {/* Créditos */}
              <div>
                <p className="text-4xl font-black text-orange-600 leading-none tabular-nums">{pkg.credits_total}</p>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mt-0.5">
                  créditos{pkg.credits_bonus > 0 ? ` (${pkg.credits_base}+${pkg.credits_bonus})` : ""}
                </p>
              </div>

              {/* Preço */}
              <div>
                <p className="text-2xl font-black text-zinc-900 tabular-nums">
                  R$ {Number(pkg.price_brl).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-zinc-400 font-medium">
                  ≈ R$ {(pkg.price_brl / pkg.credits_total).toFixed(2)}/crédito
                </p>
              </div>

              {/* Features */}
              {pkg.features.length > 0 && (
                <ul className="space-y-1.5 flex-1">
                  {pkg.features.slice(0, 3).map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs font-medium text-zinc-600">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              )}

              {/* Botão */}
              <Button
                onClick={() => handleBuy(pkg)}
                disabled={isCreating || loadingPkgId === pkg.id}
                className={cn(
                  "w-full h-11 rounded-2xl font-black text-[11px] uppercase tracking-widest gap-2 mt-auto",
                  pkg.is_featured
                    ? "bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-600/20"
                    : "bg-zinc-900 hover:bg-zinc-800 text-white"
                )}
              >
                {loadingPkgId === pkg.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <><Zap className="w-3.5 h-3.5" /> Comprar</>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Modal PIX ── */}
      {pixModal && (
        <PixPaymentModal
          open={pixModal.open}
          onOpenChange={(v) => setPixModal(prev => prev ? { ...prev, open: v } : null)}
          purchaseId={pixModal.purchaseId}
          packageName={pixModal.packageName}
          creditsTotal={pixModal.creditsTotal}
          amountBrl={pixModal.amountBrl}
          checkoutPayload={pixModal.checkoutPayload}
          initialStatus={pixModal.status}
          onPollStatus={pollStatus}
          onConfirmed={() => {
            onPurchaseConfirmed?.();
            setPixModal(null);
          }}
        />
      )}
    </div>
  );
}
