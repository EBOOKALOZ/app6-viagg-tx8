/**
 * ContactIntentionCard
 *
 * Card exibido no painel do anunciante para cada intenção de contato.
 *
 * Estados visuais:
 *   - pending_unlock  → dados mascarados + botão "Desbloquear"
 *   - unlocked        → dados completos + botão WhatsApp
 *   - sem saldo       → CTA para comprar créditos
 */

import React, { useState } from "react";
import {
  Lock,
  Unlock,
  MessageSquare,
  Phone,
  ExternalLink,
  Loader2,
  Building2,
  Car,
  Clock,
  MapPin,
  CreditCard,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  type ContactIntention,
  type ListingModule,
  INTEREST_TYPE_LABELS,
} from "@/hooks/useContactIntentions";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ContactIntentionCardProps {
  intention: ContactIntention;
  availableCredits: number;
  onUnlock: (id: string) => Promise<{
    success: boolean;
    error?: string;
    credits_charged?: number;
    buy_credits_cta?: boolean;
    required?: number;
    available?: number;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ModuleIcon({ module }: { module: ListingModule }) {
  if (module === "real_estate") return <Building2 className="w-4 h-4" />;
  return <Car className="w-4 h-4" />;
}

function moduleLabel(module: ListingModule): string {
  return module === "real_estate" ? "Imóvel" : "Veículo";
}

function interestLabel(type: ContactIntention["interest_type"]): string {
  return INTEREST_TYPE_LABELS[type] ?? type;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia${days > 1 ? "s" : ""}`;
}

function buildWhatsAppUrl(phone: string, listingModule: ListingModule): string {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  const text = encodeURIComponent(
    `Olá! Vi seu anúncio de ${moduleLabel(listingModule)} na plataforma Viagg-TX8 e gostaria de mais informações.`
  );
  return `https://wa.me/${normalized}?text=${text}`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function ContactIntentionCard({
  intention,
  availableCredits,
  onUnlock,
}: ContactIntentionCardProps) {
  const navigate = useNavigate();
  const [isUnlocking, setIsUnlocking] = useState(false);

  const isLocked = intention.status === "pending_unlock";
  const isUnlocked = intention.status === "unlocked";
  const hasEnoughCredits = availableCredits >= intention.credits_cost;

  // Imóveis usam o pacote PRÓPRIO (não o do lojista). Decide pela origem do lead.
  const creditosRoute =
    intention.listing_module === "real_estate"
      ? "/anunciante/imoveis/creditos"
      : "/anunciante/creditos";

  const handleUnlock = async () => {
    if (isUnlocking || !isLocked) return;
    setIsUnlocking(true);
    try {
      const result = await onUnlock(intention.id);
      if (result.success) {
        toast.success(
          result.credits_charged
            ? `Contato desbloqueado! ${result.credits_charged} crédito${result.credits_charged !== 1 ? "s" : ""} debitado${result.credits_charged !== 1 ? "s" : ""}.`
            : "Contato desbloqueado com sucesso!"
        );
      } else if (result.error === "insufficient_credits" || result.buy_credits_cta) {
        // CTA blindado: apenas créditos de COMPRA REAL chegam até aqui
        const faltam = (result.required ?? intention.credits_cost) - (result.available ?? availableCredits);
        toast.error(
          `Créditos insuficientes. Faltam ${faltam} crédito${faltam !== 1 ? "s" : ""}.`,
          {
            action: {
              label: "Comprar créditos",
              onClick: () => navigate(creditosRoute),
            },
          }
        );
      } else if (result.error === "already_unlocked") {
        toast.info("Este contato já foi desbloqueado.");
      } else {
        toast.error(`Erro ao desbloquear: ${result.error ?? "desconhecido"}`);
      }
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div
      className={cn(
        "relative rounded-[24px] border-2 bg-white transition-all duration-300 overflow-hidden",
        isUnlocked
          ? "border-emerald-200 shadow-sm shadow-emerald-100"
          : "border-zinc-100 hover:border-orange-200 shadow-sm hover:shadow-orange-50"
      )}
    >
      {/* ── Faixa lateral de status ── */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1 rounded-l-[22px]",
          isUnlocked ? "bg-emerald-500" : "bg-orange-400"
        )}
      />

      <div className="pl-5 pr-5 py-5 space-y-4">

        {/* ── Header do card ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Ícone do módulo */}
            <div
              className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0",
                isUnlocked ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-600"
              )}
            >
              <ModuleIcon module={intention.listing_module} />
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  {moduleLabel(intention.listing_module)}
                </span>
                <span
                  className={cn(
                    "text-[9px] font-black uppercase px-2 py-0.5 rounded-full",
                    interestTypeColor(intention.interest_type)
                  )}
                >
                  {interestLabel(intention.interest_type)}
                </span>
                {isUnlocked && (
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                    ✓ Desbloqueado
                  </span>
                )}
                {isLocked && (
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                    🔒 Aguardando
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-zinc-400 font-medium">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTime(intention.created_at)}
                </span>
                {intention.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {intention.city}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Custo em créditos */}
          {isLocked && (
            <div className="text-right shrink-0">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Custo</p>
              <p className="text-lg font-black text-zinc-900 leading-none">
                {intention.credits_cost}
                <span className="text-xs font-bold text-zinc-400 ml-1">cr</span>
              </p>
            </div>
          )}
        </div>

        {/* ── Divisor ── */}
        <div className="border-t border-zinc-50" />

        {/* ── Dados do visitante ── */}
        <div className="space-y-2">
          {/* Nome */}
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-zinc-50 flex items-center justify-center shrink-0">
              <span className="text-[10px]">👤</span>
            </div>
            <div>
              <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Nome</p>
              {isUnlocked ? (
                <p className="text-sm font-black text-zinc-900">{intention.visitor_name || "—"}</p>
              ) : (
                <p className="text-sm font-black text-zinc-900 select-none blur-[3px]">
                  {intention.masked_preview?.split(" · ")[0] ?? "████████"}
                </p>
              )}
            </div>
          </div>

          {/* Telefone */}
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-zinc-50 flex items-center justify-center shrink-0">
              <Phone className="w-3 h-3 text-zinc-400" />
            </div>
            <div>
              <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Telefone</p>
              {isUnlocked ? (
                <p className="text-sm font-black text-zinc-900">{intention.visitor_phone || "—"}</p>
              ) : (
                <p className="text-sm font-mono font-black text-zinc-900 select-none">
                  {intention.masked_preview?.split(" · ")[1] ?? "(00) ████-████"}
                </p>
              )}
            </div>
          </div>

          {/* Mensagem */}
          {(intention.visitor_message || isLocked) && (
            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-zinc-50 flex items-center justify-center shrink-0 mt-0.5">
                <MessageSquare className="w-3 h-3 text-zinc-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Mensagem</p>
                {isUnlocked ? (
                  <p className="text-xs text-zinc-600 font-medium leading-relaxed">
                    {intention.visitor_message || "Sem mensagem adicional."}
                  </p>
                ) : (
                  <p className="text-xs text-zinc-400 font-medium select-none italic">
                    Mensagem oculta — desbloqueie para ler
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Ações ── */}
        {isLocked && (
          <div className="space-y-3 pt-1">
            {hasEnoughCredits ? (
              <Button
                onClick={handleUnlock}
                disabled={isUnlocking}
                className="w-full h-16 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-black text-[18px] uppercase tracking-widest shadow-lg shadow-orange-600/20 transition-all gap-3"
              >
                {isUnlocking ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <Unlock className="w-6 h-6" />
                    Desbloquear — {intention.credits_cost} crédito{intention.credits_cost !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-2xl border border-amber-100">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-[11px] font-bold text-amber-700 leading-tight">
                    Saldo insuficiente · Você tem {availableCredits} cr, necessário {intention.credits_cost} cr
                  </p>
                </div>
                <Button
                  onClick={() => navigate(creditosRoute)}
                  className="w-full h-12 rounded-2xl bg-zinc-900 text-white font-black text-[11px] uppercase tracking-widest gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  Adquirir Créditos
                </Button>
              </div>
            )}

            <div className="flex items-center justify-center gap-1.5 text-[10px] text-zinc-400 font-medium">
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
              Dados protegidos · Desbloqueio irreversível após confirmação
            </div>
          </div>
        )}

        {isUnlocked && intention.visitor_phone && (
          <button
            onClick={() =>
              window.open(
                buildWhatsAppUrl(intention.visitor_phone!, intention.listing_module),
                "_blank"
              )
            }
            className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] uppercase tracking-widest shadow-lg shadow-emerald-600/20 gap-2 flex items-center justify-center transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            Abrir no WhatsApp
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Helper interno de cor de tipo ───────────────────────────────────────────

function interestTypeColor(type: ContactIntention["interest_type"]): string {
  const map: Record<string, string> = {
    whatsapp_click:  "bg-green-50 text-green-700",
    message_request: "bg-blue-50 text-blue-700",
    proposal:        "bg-violet-50 text-violet-700",
    view_contact:    "bg-zinc-100 text-zinc-600",
  };
  return map[type] ?? "bg-zinc-100 text-zinc-600";
}
