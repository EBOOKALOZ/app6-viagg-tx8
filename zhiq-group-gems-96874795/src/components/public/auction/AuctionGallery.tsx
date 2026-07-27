import React, { useState, useEffect, useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, Play, Maximize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface AuctionMediaItem {
  id: string;
  media_type: 'image' | 'video';
  public_url: string;
}

interface AuctionGalleryProps {
  media: AuctionMediaItem[];
  fallbackImage?: string | null;
  title: string;
}

export function AuctionGallery({ media, fallbackImage, title }: AuctionGalleryProps) {
  // Always ensure there's at least the fallback if no media exists
  const allMedia = media.length > 0 ? media : (fallbackImage ? [{ id: 'fallback', media_type: 'image' as const, public_url: fallbackImage }] : []);
  
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [thumbRef, thumbApi] = useEmblaCarousel({
    containScroll: 'keepSnaps',
    dragFree: true,
  });

  const [isFullscreen, setIsFullscreen] = useState(false);

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi || !thumbApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    thumbApi.scrollTo(emblaApi.selectedScrollSnap());
  }, [emblaApi, thumbApi, setSelectedIndex]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
  }, [emblaApi, onSelect]);

  const onThumbClick = useCallback(
    (index: number) => {
      if (!emblaApi || !thumbApi) return;
      emblaApi.scrollTo(index);
    },
    [emblaApi, thumbApi]
  );

  if (allMedia.length === 0) {
    return (
      <div className="w-full aspect-[16/9] bg-[#252B33] rounded-3xl flex items-center justify-center border border-[#323A45]">
        <p className="text-[#8E98A3] font-bold">Sem imagem disponível</p>
      </div>
    );
  }

  const renderMedia = (item: AuctionMediaItem, isFull = false) => {
    if (item.media_type === 'video') {
      return (
        <video 
          src={item.public_url} 
          controls={isFull}
          autoPlay={isFull}
          muted={!isFull}
          className="w-full h-full object-contain" 
          poster={fallbackImage || undefined}
        />
      );
    }
    return (
      <img
        src={item.public_url}
        alt={title}
        className={cn("w-full h-full", isFull ? "object-contain" : "object-cover md:object-contain")}
      />
    );
  };

  return (
    <div className="relative group/gallery">
      {/* Main Viewport */}
      <div className="relative overflow-hidden rounded-3xl bg-[#1B1F24] aspect-[4/3] md:aspect-[16/9] ring-1 ring-[#FF7A00]/20" ref={emblaRef}>
        <div className="flex h-full touch-pan-y">
          {allMedia.map((item, index) => (
            <div className="flex-[0_0_100%] min-w-0 relative h-full" key={item.id}>
              {renderMedia(item, false)}
              
              {/* Play Overlay for Video in non-fullscreen */}
              {item.media_type === 'video' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
                    <Play className="w-8 h-8 text-white ml-1" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Fullscreen Trigger */}
        <button 
          onClick={() => setIsFullscreen(true)}
          className="absolute top-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md transition-all opacity-0 group-hover/gallery:opacity-100"
        >
          <Maximize2 className="w-5 h-5" />
        </button>

        {/* Arrows overlay */}
        {allMedia.length > 1 && (
          <>
            <button
              onClick={scrollPrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-[#FF6A00] text-white flex items-center justify-center backdrop-blur-sm transition-all opacity-0 group-hover/gallery:opacity-100"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={scrollNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-[#FF6A00] text-white flex items-center justify-center backdrop-blur-sm transition-all opacity-0 group-hover/gallery:opacity-100"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {allMedia.length > 1 && (
        <div className="mt-4 overflow-hidden" ref={thumbRef}>
          <div className="flex gap-3 px-1">
            {allMedia.map((item, index) => (
              <button
                key={item.id}
                onClick={() => onThumbClick(index)}
                className={cn(
                  "relative flex-[0_0_80px] h-[60px] rounded-xl overflow-hidden transition-all duration-300 ring-2",
                  index === selectedIndex ? "ring-[#FF6A00] opacity-100" : "ring-transparent opacity-50 hover:opacity-100"
                )}
              >
                {item.media_type === 'video' ? (
                   <div className="w-full h-full bg-[#252B33] flex items-center justify-center">
                     <Play className="w-6 h-6 text-[#8E98A3]" />
                   </div>
                ) : (
                  <img src={item.public_url} alt="" className="w-full h-full object-cover" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Fullscreen Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center flex-col animate-in fade-in zoom-in-95 duration-200">
          <button 
            onClick={() => setIsFullscreen(false)}
            className="absolute top-6 right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all z-50"
          >
            <X className="w-6 h-6" />
          </button>
          
          <div className="w-full h-full p-4 flex items-center justify-center">
             {renderMedia(allMedia[selectedIndex], true)}
          </div>
        </div>
      )}
    </div>
  );
}
