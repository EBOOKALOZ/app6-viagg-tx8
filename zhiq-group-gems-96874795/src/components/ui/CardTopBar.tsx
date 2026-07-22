/**
 * CardTopBar — Header Universal dos Cards Viagg-TX8
 *
 * Barra superior padrão sobre a IMAGEM do card, usada em TODOS os módulos
 * (Mercado, Imóveis, Veículos, Serviços, Fretes, Turismo, Empresas, Leilões,
 * Arremates e futuros). Identidade visual única.
 *
 * Esquerda: Logo → Modalidade → Condição → Verificado (glassmorphism, quebra
 * em 2 linhas se faltar espaço). Direita: Compartilhar + Favoritar.
 *
 * Requer um contêiner PAI com `position: relative` (a própria área da imagem).
 * SÓ UI — sem lógica de dados.
 */
import React from "react";
import { Share2, Heart, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type CardModality = "venda" | "leilao" | "arremate" | "aluguel";
export type CardCondition = "new" | "used" | "seminovo" | "recondicionado";

const MODALITY: Record<CardModality, { label: string; cls: string }> = {
  venda:    { label: "Venda",    cls: "bg-[#FF6A00]/90 text-white" },   // 🟠
  leilao:   { label: "Leilão",   cls: "bg-purple-600/90 text-white" },  // 🟣
  arremate: { label: "Arremate", cls: "bg-blue-600/90 text-white" },    // 🔵
  aluguel:  { label: "Aluguel",  cls: "bg-sky-600/90 text-white" },     // 🔑
};

const CONDITION: Record<CardCondition, { label: string; cls: string }> = {
  new:             { label: "Novo",           cls: "bg-emerald-500/90 text-white" }, // 🟢
  used:            { label: "Usado",          cls: "bg-amber-500/90 text-white" },   // 🟡
  seminovo:        { label: "Seminovo",       cls: "bg-sky-500/90 text-white" },     // 🔵
  recondicionado:  { label: "Recondicionado", cls: "bg-[#8B5E3C]/90 text-white" },   // 🟤
};

const BADGE_BASE =
  "inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wide " +
  "backdrop-blur-md shadow-sm ring-1 ring-white/20 pointer-events-none whitespace-nowrap";

const ACTION_BTN =
  "p-2 rounded-full bg-[#1A1F24]/70 hover:bg-[#1A1F24] border border-white/10 backdrop-blur-md " +
  "text-white/90 hover:text-white shadow-sm transition-all duration-200 hover:scale-105 active:scale-95";

export interface CardTopBarProps {
  modality?: CardModality;
  condition?: CardCondition | null;
  verified?: boolean;
  favorited?: boolean;
  onShare?: (e: React.MouseEvent) => void;
  onFavorite?: (e: React.MouseEvent) => void;
  /** tamanho do logo (default h-11 w-11 = ~44px) */
  logoClassName?: string;
  className?: string;
}

export function CardTopBar({
  modality,
  condition,
  verified = false,
  favorited = false,
  onShare,
  onFavorite,
  logoClassName,
  className,
}: CardTopBarProps) {
  return (
    <div
      className={cn(
        "absolute inset-x-2 top-2 z-20 flex items-start justify-between gap-2 pointer-events-none",
        className
      )}
    >
      {/* ─── ESQUERDA: logo + badges (quebram em 2 linhas se faltar espaço) ─── */}
      <div className="flex items-start flex-wrap gap-1.5 min-w-0">
        <img
          src="/viagg-logo.png"
          alt="Viagg-TX8"
          width={44}
          height={44}
          loading="lazy"
          decoding="async"
          className={cn(
            "h-11 w-11 rounded-lg object-cover shadow-md ring-1 ring-white/20 pointer-events-none shrink-0",
            logoClassName
          )}
        />
        {modality && (
          <span className={cn(BADGE_BASE, MODALITY[modality].cls)}>{MODALITY[modality].label}</span>
        )}
        {condition && CONDITION[condition] && (
          <span className={cn(BADGE_BASE, CONDITION[condition].cls)}>{CONDITION[condition].label}</span>
        )}
        {verified && (
          <span className={cn(BADGE_BASE, "bg-teal-500/90 text-white")}>
            <Check className="h-3 w-3" /> Verificado
          </span>
        )}
      </div>

      {/* ─── DIREITA: compartilhar + favoritar ─── */}
      <div className="flex items-center gap-1.5 shrink-0 pointer-events-auto">
        {onShare && (
          <button type="button" onClick={onShare} className={ACTION_BTN} title="Compartilhar" aria-label="Compartilhar">
            <Share2 className="w-4 h-4" />
          </button>
        )}
        {onFavorite && (
          <button type="button" onClick={onFavorite} className={ACTION_BTN} title="Favoritar" aria-label="Favoritar">
            <Heart className={cn("w-4 h-4 transition-all duration-300", favorited ? "fill-red-500 text-red-500 scale-110" : "")} />
          </button>
        )}
      </div>
    </div>
  );
}

export default CardTopBar;
