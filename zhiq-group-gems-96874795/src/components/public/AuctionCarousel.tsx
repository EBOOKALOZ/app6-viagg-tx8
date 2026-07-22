/**
 * AuctionCarousel — vitrine horizontal (carrossel) de leilões/arremates.
 *
 * Rolagem por SETAS (esquerda/direita) + snap suave + swipe no touch.
 * Reusa o card oficial MarketAuctionCard (variant="carousel" preenche o slot).
 * SÓ UI — nenhuma lógica de dados/negócio.
 */
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MarketAuctionCard } from "@/components/advertiser/MarketAuctionCard";
import type { AuctionListing } from "@/hooks/useAuctions";

export function AuctionCarousel({ listings }: { listings: AuctionListing[] }) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>("[data-card]");
    const step = (first ? first.offsetWidth + 16 : el.clientWidth * 0.8);
    el.scrollBy({ left: dir * step * 2, behavior: "smooth" }); // ~2 cards por clique
  };

  const Arrow = ({ dir, side }: { dir: 1 | -1; side: "left" | "right" }) => (
    <button
      type="button"
      aria-label={dir === -1 ? "Anterior" : "Próximo"}
      onClick={() => scroll(dir)}
      className={`hidden sm:flex absolute top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full items-center justify-center
        bg-[#1A1F24] border border-[#323A45] text-white shadow-[0_8px_24px_rgba(0,0,0,0.45)]
        hover:bg-[#252B33] hover:scale-105 active:scale-95 transition-all
        ${side === "left" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"}`}
    >
      {dir === -1 ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
    </button>
  );

  return (
    <div className="relative">
      <Arrow dir={-1} side="left" />
      <Arrow dir={1} side="right" />

      <div
        ref={trackRef}
        className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory items-stretch pb-3 px-1
          [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {listings.map((listing) => (
          <div
            key={listing.id}
            data-card
            className="snap-start shrink-0 w-[68vw] min-[400px]:w-[44vw] sm:w-[280px] md:w-[260px] lg:w-[240px]"
          >
            <MarketAuctionCard listing={listing} variant="carousel" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default AuctionCarousel;
