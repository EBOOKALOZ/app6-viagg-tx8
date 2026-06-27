import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

export interface FilterCategory {
  value: string;
  label: string;
  count: number;
  emoji?: string;
  Icon?: LucideIcon;
}

interface CategoryFilterBarProps {
  categories: FilterCategory[];
  activeValue: string;
  onSelect: (value: string) => void;
  totalCount: number;
  allLabel?: string;
  allEmoji?: string;
  /** light = fundo claro; dark = fundo escuro */
  variant?: "light" | "dark";
  className?: string;
}

export function CategoryFilterBar({
  categories,
  activeValue,
  onSelect,
  totalCount,
  allLabel = "Todos",
  allEmoji = "🔖",
  variant = "light",
  className,
}: CategoryFilterBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: "left" | "right") =>
    scrollRef.current?.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });

  const isLight = variant === "light";

  /* ── Arrow button ── */
  const arrowCls = cn(
    "shrink-0 rounded-full p-1.5 transition-all hover:scale-110 z-10 border shadow-md",
    isLight
      ? "bg-white/90 border-zinc-200 text-zinc-500 hover:bg-white hover:shadow-lg"
      : "bg-white/10 border-white/20 text-white hover:bg-white/20 backdrop-blur-sm"
  );

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button onClick={() => scroll("left")} className={arrowCls} aria-label="Anterior">
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      <div
        ref={scrollRef}
        className="flex gap-2.5 overflow-x-auto flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden scroll-smooth py-0.5"
      >
        {/* ── Pill "Todas/Todos" ── */}
        <Pill
          isActive={activeValue === "all"}
          onClick={() => onSelect("all")}
          isLight={isLight}
          emoji={allEmoji}
          label={allLabel}
          count={totalCount}
        />

        {categories.map(({ value, label, count, emoji, Icon }) => (
          <Pill
            key={value}
            isActive={activeValue === value}
            onClick={() => onSelect(value)}
            isLight={isLight}
            emoji={emoji}
            Icon={Icon}
            label={label}
            count={count}
          />
        ))}
      </div>

      <button onClick={() => scroll("right")} className={arrowCls} aria-label="Próximo">
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────
   Sub-componente: Pill premium individual
───────────────────────────────────────── */
interface PillProps {
  isActive: boolean;
  onClick: () => void;
  isLight: boolean;
  emoji?: string;
  Icon?: LucideIcon;
  label: string;
  count: number;
}

function Pill({ isActive, onClick, isLight, emoji, Icon, label, count }: PillProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group/pill relative flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-2xl shrink-0 font-extrabold text-sm transition-all duration-200 whitespace-nowrap select-none",
        /* ── ATIVO ── */
        isActive && "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30 scale-[1.03] ring-2 ring-orange-400/40",
        /* ── INATIVO claro ── */
        !isActive && isLight && "bg-[#F5E62B] text-zinc-800 border border-yellow-300/60 hover:brightness-95 hover:shadow-md hover:scale-[1.02]",
        /* ── INATIVO escuro ── */
        !isActive && !isLight && "bg-[#F5E62B] text-zinc-900 border border-yellow-300/40 hover:brightness-95 hover:shadow-md hover:scale-[1.02]",
      )}
    >
      {/* Bolha do ícone */}
      <span className={cn(
        "flex items-center justify-center w-7 h-7 rounded-xl shrink-0 shadow-sm transition-all duration-200",
        /* Ativo → bolha branca translúcida (pill já é laranja) */
        isActive && "bg-white/25 text-white shadow-sm",
        /* Inativo → bolha preta com ícone amarelo (contraste sobre pill amarelo) */
        !isActive && "bg-zinc-900 text-[#F5E62B] group-hover/pill:bg-zinc-800",
      )}>
        {Icon ? (
          <Icon className="w-4 h-4 drop-shadow-sm" />
        ) : emoji ? (
          <span className="text-base leading-none">{emoji}</span>
        ) : null}
      </span>

      {/* Label */}
      <span className="tracking-tight leading-none">{label}</span>

      {/* Badge contador — verde pulsando levemente */}
      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-black min-w-[18px] text-center leading-none bg-emerald-500 text-white animate-pulse shadow-sm shadow-emerald-500/50">
        {count}
      </span>
    </button>
  );
}
