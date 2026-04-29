/**
 * Componentes compartilhados de modalidade de anúncio
 *
 * Usados por:
 *   - ProductForm.tsx
 *   - VehicleForm.tsx
 *   - (qualquer futuro formulário que precisar de leilão/arremate)
 *
 * Lógica: 100% reutilizada de useAdvertiserAuctions e useAdvertiserCredits
 * Sem hardcode — valores de créditos vêm do admin via merchant_credit_usage_rules
 */
import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Gavel, Tag, ShoppingBag, Timer, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

export type ListingMode = "normal" | "auction" | "arremate";

export interface AuctionFormState {
  starting_bid: string;
  original_price: string;
  buy_now_price: string;
  duration_hours: string;
  fulfillment: string;
}

export const defaultAuctionForm: AuctionFormState = {
  starting_bid: "",
  original_price: "",
  buy_now_price: "",
  duration_hours: "24",
  fulfillment: "pickup",
};

// ─── CountdownTimer ──────────────────────────────────────────

export function CountdownTimer({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const diff = new Date(endsAt).getTime() - now;
  if (diff <= 0) return <span className="text-red-500 font-bold">Encerrado</span>;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const isUrgent = diff < 3600000;
  return (
    <span className={cn("font-mono font-bold tabular-nums", isUrgent && "text-red-500 animate-pulse")}>
      {d > 0 && <>{String(d).padStart(2, "0")}d </>}
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

// ─── ModeSelector ────────────────────────────────────────────

interface ModeSelectorProps {
  value: ListingMode;
  onChange: (m: ListingMode) => void;
  accentColor?: string; // CSS class para override de cor (default: emerald)
}

export function ModeSelector({ value, onChange, accentColor }: ModeSelectorProps) {
  // Modalidade fixa em 'normal' — Leilão e Arremate desativados temporariamente
  return null;
}

// ─── AuctionFields ───────────────────────────────────────────

interface AuctionFieldsProps {
  form: AuctionFormState;
  onChange: (updates: Partial<AuctionFormState>) => void;
  listingType: "auction" | "arremate";
}

export function AuctionFields({ form, onChange, listingType }: AuctionFieldsProps) {
  const isAuction = listingType === "auction";
  const accentBorder = isAuction ? "focus:border-orange-500" : "focus:border-violet-500";
  const accentBg = isAuction
    ? "bg-orange-500/5 border-orange-500/20"
    : "bg-violet-500/5 border-violet-500/20";

  return (
    <div className={cn("rounded-3xl border p-6 space-y-6 animate-in slide-in-from-top-4 duration-300", accentBg)}>
      <div className="flex items-center gap-2">
        <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", isAuction ? "bg-orange-100" : "bg-violet-100")}>
          {isAuction ? <Gavel className="w-4 h-4 text-orange-600" /> : <Tag className="w-4 h-4 text-violet-600" />}
        </div>
        <div>
          <h3 className="text-sm font-black text-zinc-900 uppercase tracking-tight">
            Configuração do {isAuction ? "Leilão" : "Arremate"}
          </h3>
          <p className="text-[10px] text-zinc-500">
            {isAuction ? "Lance inicial, duração e preço de compra imediata" : "Preço de oportunidade e duração da oferta"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Preço inicial / oportunidade */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">
            {isAuction ? "Lance Inicial (R$) *" : "Preço de Oportunidade (R$) *"}
          </label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0,00"
            className={cn("h-12 rounded-2xl border-2 border-zinc-100 bg-white font-bold transition-all", accentBorder)}
            value={form.starting_bid}
            onChange={(e) => onChange({ starting_bid: e.target.value })}
          />
        </div>

        {/* Preço original / referência */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">
            Preço Normal / Referência (R$)
          </label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="Para comparação"
            className={cn("h-12 rounded-2xl border-2 border-zinc-100 bg-white font-bold transition-all", accentBorder)}
            value={form.original_price}
            onChange={(e) => onChange({ original_price: e.target.value })}
          />
        </div>
      </div>

      {/* Arrematar agora — apenas em leilão */}
      {isAuction && (
        <div className="space-y-2">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">
            Arrematar Agora (R$) — Opcional
          </label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="Compra imediata sem aguardar fim do leilão"
            className="h-12 rounded-2xl border-2 border-zinc-100 bg-white font-bold focus:border-orange-500 transition-all"
            value={form.buy_now_price}
            onChange={(e) => onChange({ buy_now_price: e.target.value })}
          />
        </div>
      )}

      {/* Duração */}
      <div className="space-y-2">
        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">
          <Timer className="inline w-3 h-3 mr-1 mb-0.5" />
          Duração
        </label>
        <div className="grid grid-cols-4 gap-2">
          {["6", "12", "24", "48"].map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => onChange({ duration_hours: h })}
              className={cn(
                "py-3 rounded-xl border-2 text-xs font-black transition-all",
                form.duration_hours === h
                  ? isAuction
                    ? "border-orange-500 bg-orange-50 text-orange-700"
                    : "border-violet-500 bg-violet-50 text-violet-700"
                  : "border-zinc-100 text-zinc-500 hover:border-zinc-300"
              )}
            >
              {h}h
            </button>
          ))}
        </div>
      </div>

      {/* Entrega */}
      <div className="space-y-2">
        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">
          Modalidade de Entrega / Retirada
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: "pickup", l: "🏪 Retirada" },
            { v: "delivery", l: "🚚 Entrega" },
            { v: "both", l: "↔️ Ambos" },
          ].map(({ v, l }) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange({ fulfillment: v })}
              className={cn(
                "py-2.5 rounded-xl border-2 text-xs font-bold transition-all",
                form.fulfillment === v
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-zinc-100 text-zinc-500 hover:border-zinc-300"
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── CreditInfoBanner ────────────────────────────────────────

interface CreditInfoBannerProps {
  usageRules: { feature_code: string; credits_cost: number }[];
  balance: number;
}

export function CreditInfoBanner({ usageRules, balance }: CreditInfoBannerProps) {
  const contactCost =
    usageRules.find((r) => r.feature_code === "offer_accept_contact_unlock")?.credits_cost ?? 2;
  const intentionCost =
    usageRules.find((r) => r.feature_code === "purchase_intention_received")?.credits_cost ?? 5;
  const total = contactCost + intentionCost;

  return (
    <div className="rounded-2xl bg-violet-50 border border-violet-100 px-4 py-3 space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-violet-600" />
          <span className="text-xs font-black text-violet-700 uppercase tracking-wide">
            Custo por aceite de oferta
          </span>
        </div>
        <span className="text-xs font-black text-violet-900 bg-violet-100 px-2 py-0.5 rounded-full">
          {total} créditos
        </span>
      </div>
      <p className="text-[11px] text-violet-600">
        {contactCost} comunicação + {intentionCost} intenção de compra •{" "}
        <span className="font-bold">Saldo atual: {balance} créditos</span>
      </p>
    </div>
  );
}
