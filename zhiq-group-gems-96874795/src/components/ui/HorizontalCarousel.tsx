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
  cardWidth = "w-[90vw] sm:w-[340px] md:w-[360px] lg:w-[380px]",
  className,
  gap = "gap-5",
  snap = true,
  alwaysShowArrows = false,
}: HorizontalCarouselProps) {
  const ref = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (!ref.current) return;
    const container = ref.current;
    const children = Array.from(container.children) as HTMLElement[];
    if (children.length === 0) return;

    const currentScroll = Math.round(container.scrollLeft);
    const firstChildOffset = children[0].offsetLeft;

    if (dir === "right") {
      const nextCard = children.find((child) => (child.offsetLeft - firstChildOffset) > currentScroll + 5);
      if (nextCard && currentScroll + container.clientWidth < container.scrollWidth - 5) {
        container.scrollTo({
          left: nextCard.offsetLeft - firstChildOffset,
          behavior: "smooth",
        });
      } else {
        container.scrollTo({
          left: 0,
          behavior: "smooth",
        });
      }
    } else {
      const prevCards = children.filter((child) => (child.offsetLeft - firstChildOffset) < currentScroll - 5);
      const prevCard = prevCards[prevCards.length - 1];
      if (prevCard && currentScroll > 5) {
        container.scrollTo({
          left: prevCard.offsetLeft - firstChildOffset,
          behavior: "smooth",
        });
      } else {
        container.scrollTo({
          left: container.scrollWidth - container.clientWidth,
          behavior: "smooth",
        });
      }
    }
  };

  return (
    <div className={cn("relative flex flex-col gap-0 group/carousel bg-[#F5E62B] p-4 md:p-6 rounded-2xl", className)}>
      <div
        ref={ref}
        className={cn(
          "flex overflow-x-auto pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden scroll-smooth [-webkit-overflow-scrolling:touch] touch-auto",
          snap && "snap-x snap-mandatory",
          gap
        )}
      >
        {Array.isArray(children)
          ? children.map((child, i) => (
              <div key={i} className={cn("flex-none", snap && "snap-start snap-always", cardWidth)}>
                {child}
              </div>
            ))
          : <div className={cn("flex-none", snap && "snap-start snap-always", cardWidth)}>{children}</div>}
      </div>

      {/* Flechas futuristas coladas ao card */}
      <div className="flex items-center justify-center -mt-2 sm:-mt-3 z-10">
        <div className="inline-flex items-center gap-3 px-3 py-1.5 rounded-full bg-zinc-900/95 dark:bg-black/95 backdrop-blur-xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.5),_0_0_15px_rgba(255,106,0,0.2)] transition-all duration-300 hover:border-[#FF6A00]/60 hover:shadow-[0_8px_32px_rgba(0,0,0,0.7),_0_0_28px_rgba(255,106,0,0.45)] group/controls">
          <button
            onClick={() => scroll("left")}
            className="group/btn relative flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-gradient-to-r hover:from-[#FF6A00] hover:to-[#FF8C33] text-zinc-300 hover:text-white border border-white/10 hover:border-transparent transition-all duration-300 hover:scale-110 active:scale-95 shadow-inner"
            aria-label="Anterior"
            title="Card anterior"
          >
            <ChevronLeft className="w-5 h-5 transition-transform duration-300 group-hover/btn:-translate-x-0.5" />
          </button>

          <div className="h-4 w-[1px] bg-white/15" />

          <button
            onClick={() => scroll("right")}
            className="group/btn relative flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-gradient-to-r hover:from-[#FF6A00] hover:to-[#FF8C33] text-zinc-300 hover:text-white border border-white/10 hover:border-transparent transition-all duration-300 hover:scale-110 active:scale-95 shadow-inner"
            aria-label="Próximo"
            title="Próximo card"
          >
            <ChevronRight className="w-5 h-5 transition-transform duration-300 group-hover/btn:translate-x-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
