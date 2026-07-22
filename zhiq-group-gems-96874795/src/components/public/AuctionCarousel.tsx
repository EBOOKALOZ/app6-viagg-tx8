/**
 * AuctionCarousel — vitrine horizontal (carrossel) de leilões/arremates.
 *
 * Rolagem por SETAS modernas + snap suave + swipe no touch.
 * Reusa o card oficial MarketAuctionCard (variant="carousel" preenche o slot).
 */
import { MarketAuctionCard } from "@/components/advertiser/MarketAuctionCard";
import { HorizontalCarousel } from "@/components/ui/HorizontalCarousel";
import type { AuctionListing } from "@/hooks/useAuctions";

export function AuctionCarousel({ listings }: { listings: AuctionListing[] }) {
  return (
    <HorizontalCarousel cardWidth="w-[90vw] sm:w-[340px] md:w-[360px] lg:w-[380px]" gap="gap-4">
      {listings.map((listing) => (
        <MarketAuctionCard key={listing.id} listing={listing} variant="carousel" />
      ))}
    </HorizontalCarousel>
  );
}

export default AuctionCarousel;
