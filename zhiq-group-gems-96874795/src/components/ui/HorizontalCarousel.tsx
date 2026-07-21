import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface HorizontalCarouselProps {
  children: React.ReactNode;
  cardWidth?: string;
  className?: string;
  gap?: string;
  snap?: boolean;
  alwaysShowArrows?: boolean;
}

export function HorizontalCarousel({
  children,
  cardWidth = "w-96 sm:w-[26rem]",
  className,
  gap = "gap-5",
  snap = false,
  alwaysShowArrows = false,
}: HorizontalCarouselProps) {
  const ref = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    const w = ref.current?.clientWidth ?? 340;
    ref.current?.scrollBy({ left: dir === "left" ? -(w * 0.75) : w * 0.75, behavior: "smooth" });
  };

  if (alwaysShowArrows) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        {/* Flechas acima dos cards */}
        <div className="flex justify-end gap-2 pr-1">
          <button
            onClick={() => scroll("left")}
            className="bg-white/90 backdrop-blur shadow-sm rounded-full p-1 border border-zinc-200/70 transition-all hover:scale-110"
            aria-label="Anterior"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-zinc-500" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="bg-white/90 backdrop-blur shadow-sm rounded-full p-1 border border-zinc-200/70 transition-all hover:scale-110"
            aria-label="Próximo"
          >
            <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
          </button>
        </div>

        {/* Cards — tamanho original sem alteração */}
        <div
          ref={ref}
          className={cn(
            "flex overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden scroll-smooth touch-pan-x select-none",
            snap && "snap-x snap-mandatory",
            gap
          )}
        >
          {Array.isArray(children)
            ? children.map((child, i) => (
                <div key={i} className={cn("flex-none", snap && "snap-start", cardWidth)}>
                  {child}
                </div>
              ))
            : <div className={cn("flex-none", snap && "snap-start", cardWidth)}>{children}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative group/carousel", className)}>
      <div
        ref={ref}
        className={cn(
          "flex overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden scroll-smooth touch-pan-x select-none",
          snap && "snap-x snap-mandatory",
          gap
        )}
      >
        {Array.isArray(children)
          ? children.map((child, i) => (
              <div key={i} className={cn("flex-none", snap && "snap-start", cardWidth)}>
                {child}
              </div>
            ))
          : <div className={cn("flex-none", snap && "snap-start", cardWidth)}>{children}</div>}
      </div>

      <button
        onClick={() => scroll("left")}
        className="absolute z-10 top-1/2 -translate-y-8 -left-4 bg-white/95 backdrop-blur shadow-xl rounded-full p-2.5 border border-zinc-100 opacity-0 group-hover/carousel:opacity-100 transition-all hover:scale-110"
        aria-label="Anterior"
      >
        <ChevronLeft className="w-5 h-5 text-zinc-700" />
      </button>
      <button
        onClick={() => scroll("right")}
        className="absolute z-10 top-1/2 -translate-y-8 -right-4 bg-white/95 backdrop-blur shadow-xl rounded-full p-2.5 border border-zinc-100 opacity-0 group-hover/carousel:opacity-100 transition-all hover:scale-110"
        aria-label="Próximo"
      >
        <ChevronRight className="w-5 h-5 text-zinc-700" />
      </button>

      {/* fade edges */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-4 w-6 bg-gradient-to-r from-current to-transparent opacity-5" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-4 w-8 bg-gradient-to-l from-current to-transparent opacity-10" />
    </div>
  );
}
