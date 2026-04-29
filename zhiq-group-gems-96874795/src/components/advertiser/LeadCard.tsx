/**
 * LeadCard — Card de lead/interessado no painel do anunciante
 *
 * Estados visuais:
 *   pending_unlock → dados mascarados, botão "Desbloquear com X créditos"
 *   pending_unlock + sem saldo → alerta, botão "Comprar créditos"
 *   pending_unlock + desbloqueando → spinner
 *   unlocked → dados completos + botão WhatsApp
 *   expired → grayscale, mensagem de expirado
 *   cancelled → grayscale
 */

import React, { useState } from "react";
import {
  Lock,
  Unlock,
  MessageSquare,
  Clock,
  Coins,
  ExternalLink,
  ShoppingCart,
  Loader2,
  Building2,
  CarFront,
  User,
  Phone,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { INTEREST_TYPE_CONFIG } from "@/hooks/useAdvertiserLeadsDashboard";
import type { LeadItem } from "@/hooks/useAdvertiserLeadsDashboard";

// ─── Props ────────────────────────────────────────────────────────────────────

interface LeadCardProps {
  lead: LeadItem;
  availableCredits: number;
  onUnlock: (id: string) => Promise<{
    success: boolean;
    error?: string;
    credits_charged?: number;
    buy_credits_cta?: boolean;
    required?: number;
    available?: number;
  }>;
  onBuyCredits: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MODULE_CONFIG = {
  real_estate: { label: "Imóvel",  Icon: Building2, color: "text-blue-600",  bg: "bg-blue-50" },
  vehicles:    { label: "Veículo", Icon: CarFront,   color: "text-green-600", bg: "bg-green-50" },
};

function formatWhatsAppUrl(phone: string, name: string): string {
  const clean = phone.replace(/\D/g, "");
  const e164 = clean.startsWith("55") ? clean : `55${clean}`;
  const msg = encodeURIComponent(`Olá ${name}! Vi seu interesse no meu anúncio e gostaria de conversar.`);
  return `https://wa.me/${e164}?text=${msg}`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function LeadCard({ lead, availableCredits, onUnlock, onBuyCredits }: LeadCardProps) {
  const navigate = useNavigate();
  const [isUnlocking, setIsUnlocking] = useState(false);

  const isLocked    = lead.status === "pending_unlock";
  const isUnlocked  = lead.status === "unlocked";
  const isExpired   = lead.status === "expired";
  const isCancelled = lead.status === "cancelled";
  const hasBalance  = availableCredits >= lead.credits_cost;

  const module  = MODULE_CONFIG[lead.listing_module] ?? MODULE_CONFIG.real_estate;
  const ModuleIcon = module.Icon;
  const interestCfg = INTEREST_TYPE_CONFIG[lead.interest_type] ?? { label: lead.interest_type, icon: "💬" };

  const timeAgo = formatDistanceToNow(new Date(lead.created_at), {
    addSuffix: true,
    locale: ptBR,
  });

  // ── Ação de desbloqueio ───────────────────────────────────────────────────
  const handleUnlock = async () => {
    if (isUnlocking || !isLocked) return;
    setIsUnlocking(true);
    try {
      const result = await onUnlock(lead.id);

      if (result.success) {
        toast.success(
          `Contato desbloqueado! ${result.credits_charged} crédito${result.credits_charged !== 1 ? "s" : ""} debitado${result.credits_charged !== 1 ? "s" : ""}.`
        );
      } else if (result.error === "insufficient_credits" || result.buy_credits_cta) {
        const faltam = (result.required ?? lead.credits_cost) - (result.available ?? availableCredits);
        toast.error(`Faltam ${faltam} crédito${faltam !== 1 ? "s" : ""}. Compre um pacote para continuar.`, {
          action: { label: "Comprar", onClick: onBuyCredits },
        });
      } else if (result.error === "already_unlocked") {
        toast.info("Lead já estava desbloqueado.");
      } else {
        toast.error(`Erro: ${result.error ?? "desconhecido"}`);
      }
    } finally {
      setIsUnlocking(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={cn(
      "rounded-[28px] border-2 overflow-hidden transition-all duration-300",
      isUnlocked  && "border-emerald-200 bg-white shadow-lg shadow-emerald-600/5",
      isLocked    && !hasBalance && "border-amber-200 bg-amber-50/30",
      isLocked    && hasBalance  && "border-orange-200 bg-white hover:shadow-lg hover:shadow-orange-600/5",
      isExpired   && "border-zinc-200 bg-zinc-50 opacity-60",
      isCancelled && "border-zinc-200 bg-zinc-50 opacity-50",
    )}>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4">
        <div className="flex items-center gap-2">
          {/* Módulo badge */}
          <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest", module.bg, module.color)}>
            <ModuleIcon className="w-3 h-3" />
            {module.label}
          </div>
          {/* Tipo de interesse */}
          <span className="text-xs font-bold text-zinc-400">
            {interestCfg.icon} {interestCfg.label}
          </span>
        </div>

        {/* Status badge */}
        {isUnlocked && (
          <Badge className="bg-emerald-100 text-emerald-700 font-black text-[10px] border-0 gap-1">
            <CheckCircle2 className="w-3 h-3" /> Desbloqueado
          </Badge>
        )}
        {isLocked && (
          <Badge className={cn(
            "text-[10px] font-black border-0 gap-1",
            hasBalance ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"
          )}>
            <Lock className="w-3 h-3" />
            {hasBalance ? "Pendente" : "Sem saldo"}
          </Badge>
        )}
        {isExpired && (
          <Badge className="bg-zinc-100 text-zinc-500 font-black text-[10px] border-0">
            Expirado
          </Badge>
        )}
      </div>

      {/* ── Corpo ── */}
      <div className="px-6 pb-5 space-y-4">

        {/* Preview mascarado (locked) ou dados reais (unlocked) */}
        {isLocked && (
          <div className="space-y-3">
            {/* Preview mascarado */}
            <div className="bg-zinc-100 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Lock className="w-3.5 h-3.5 text-zinc-400" />
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  Prévia dos dados do interessado
                </p>
              </div>
              <p className="text-sm font-medium text-zinc-500 leading-relaxed">
                {lead.masked_preview ?? "★★★★ interessado em contato · dados ocultos até desbloqueio"}
              </p>
            </div>

            {/* Localização se disponível */}
            {(lead.city || lead.region) && (
              <p className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
                📍 {[lead.city, lead.region].filter(Boolean).join(", ")}
              </p>
            )}

            {/* Timestamp */}
            <p className="text-[10px] text-zinc-400 font-medium flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> {timeAgo}
            </p>
          </div>
        )}

        {isUnlocked && (
          <div className="space-y-3">
            {/* Nome */}
            {lead.visitor_name && (
              <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-2xl">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">Nome</p>
                  <p className="font-black text-zinc-900 text-sm">{lead.visitor_name}</p>
                </div>
              </div>
            )}

            {/* Telefone */}
            {lead.visitor_phone && (
              <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-2xl">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">Telefone</p>
                  <p className="font-black text-zinc-900 text-sm">{lead.visitor_phone}</p>
                </div>
              </div>
            )}

            {/* Mensagem */}
            {lead.visitor_message && (
              <div className="p-4 bg-zinc-50 rounded-2xl space-y-1">
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                  <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">Mensagem</p>
                </div>
                <p className="text-sm text-zinc-700 font-medium leading-relaxed">
                  {lead.visitor_message}
                </p>
              </div>
            )}

            {/* Timestamp */}
            <p className="text-[10px] text-zinc-400 font-medium flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> {timeAgo}
            </p>
          </div>
        )}

        {(isExpired || isCancelled) && (
          <div className="space-y-2">
            <p className="text-sm text-zinc-400 font-medium">
              {isExpired ? "Este lead expirou e não pode mais ser desbloqueado." : "Lead cancelado."}
            </p>
            <p className="text-[10px] text-zinc-400 font-medium flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> {timeAgo}
            </p>
          </div>
        )}

        {/* ── CTAs ── */}
        <div className="space-y-2 pt-1">

          {/* 
            🛡️ BLINDAGEM DE UI (NÃO ALTERAR) 🛡️
            O tamanho e estilo destes botões (h-16, text-[18px], icon w-6)
            foram homologados como padrão de acessibilidade para Imóveis e Veículos.
            NUNCA reduza esses valores.
          */}

          {/* Botão de desbloqueio */}
          {isLocked && hasBalance && (
            <Button
              onClick={handleUnlock}
              disabled={isUnlocking}
              className="w-full h-16 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-black text-[18px] uppercase tracking-widest gap-3 shadow-lg shadow-orange-600/20 transition-all"
            >
              {isUnlocking ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <Unlock className="w-6 h-6" />
                  Desbloquear com {lead.credits_cost} crédito{lead.credits_cost !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          )}

          {/* Sem saldo → comprar créditos */}
          {isLocked && !hasBalance && (
            <div className="space-y-2">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-center">
                <p className="text-xs font-black text-amber-700">
                  Você não possui créditos suficientes
                </p>
                <p className="text-[10px] text-amber-600 font-medium mt-0.5">
                  Necessário: <strong>{lead.credits_cost}</strong> · Disponível: <strong>{availableCredits}</strong>
                </p>
              </div>
              <Button
                onClick={onBuyCredits}
                className="w-full h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-black text-[11px] uppercase tracking-widest gap-2"
              >
                <ShoppingCart className="w-4 h-4" />
                Comprar {lead.credits_cost - availableCredits} crédito{(lead.credits_cost - availableCredits) !== 1 ? "s" : ""} para desbloquear
              </Button>
            </div>
          )}

          {/* WhatsApp (unlocked) */}
          {isUnlocked && lead.visitor_phone && (
            <a
              href={formatWhatsAppUrl(lead.visitor_phone, lead.visitor_name ?? "Interessado")}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl bg-[#25D366] hover:bg-[#20BA5C] text-white font-black text-[11px] uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              Abrir no WhatsApp
              <ExternalLink className="w-3.5 h-3.5 opacity-60" />
            </a>
          )}

          {/* Custo info (locked) */}
          {isLocked && (
            <p className="text-center text-[10px] text-zinc-400 font-medium flex items-center justify-center gap-1">
              <Coins className="w-3 h-3" />
              Custo de desbloqueio: {lead.credits_cost} crédito{lead.credits_cost !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
